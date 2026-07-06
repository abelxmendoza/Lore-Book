import { format, parseISO, startOfDay } from 'date-fns';
import { v4 as uuid } from 'uuid';

import { logger } from '../logger';
import type {
  ChapterTimeline,
  EntryRelationship,
  JournalQuery,
  MemoryEntry,
  MemorySource,
  MonthGroup,
  ResolvedMemoryEntry
} from '../types';

import { deriveEmotionalIntensity } from '../utils/emotionalIntensity';
import { JOURNAL_COLS } from '../db/journalEntryColumns';
import { db } from '../db/drizzle/client';
import { matchJournalEntries } from '../db/drizzle/memoryQueries';

import { chapterService } from './chapterService';
import { characterFoundationService } from './characterFoundationService';
import { correctionService } from './correctionService';
import { embeddingService } from './embeddingService';
import { peoplePlacesService } from './peoplePlacesService';
import { skillExtractionService } from './skills/skillExtractionService';
import { questSuggestionService } from './quests/questSuggestionService';
import { projectSuggestionService } from './projects/projectSuggestionService';
import { supabaseAdmin } from './supabaseClient';
import { ingestJournalEntry } from './unifiedErIngestion';
import { dateAssignmentService } from './dateAssignmentService';

const ENTRY_LIST_CACHE_TTL_MS = 30_000;
const BOOTSTRAP_ENTRY_FETCH_LIMIT = 500;

export type TimelineEndpointTiming = {
  totalMs: number;
  dbMs: number;
  stitchMs: number;
  serializeMs: number;
  chapterLoadMs: number;
  entryCacheHit: boolean;
  openaiMs: number;
};

export type TagsEndpointTiming = {
  totalMs: number;
  dbMs: number;
  computeMs: number;
  serializeMs: number;
  entryCacheHit: boolean;
  openaiMs: number;
};

export type ChaptersEndpointTiming = {
  totalMs: number;
  dbMs: number;
  entryFetchMs: number;
  chapterLoadMs: number;
  profileComputeMs: number;
  candidateComputeMs: number;
  serializeMs: number;
  cacheHit: boolean;
  openaiMs: number;
};

type EntryListCacheEntry = {
  entries: MemoryEntry[];
  fetchedAt: number;
  limit: number;
};

export type SaveEntryPayload = {
  userId: string;
  content: string;
  date?: string;
  tags?: string[];
  chapterId?: string | null;
  mood?: string | null;
  summary?: string | null;
  source?: MemorySource;
  content_type?: string;
  original_content?: string | null;
  preserve_original_language?: boolean;
  metadata?: Record<string, unknown>;
  relationships?: EntryRelationship[];
  /** Order user told the story (1-based). For story-slice entries. Do not use for chronology. */
  narrativeOrder?: number | null;
  /** Parent entry when this was materialized as a story slice (backward-storytelling pipeline). */
  derivedFromEntryId?: string | null;
  /** Skip the automatic ER ingestion (used by external syncs that call ingestExternalPost themselves for provenance). */
  skipIngestion?: boolean;
};

class MemoryService {
  private entryListCache = new Map<string, EntryListCacheEntry>();

  private isSimpleEntryListQuery(query: JournalQuery): boolean {
    return (
      !query.semantic &&
      !query.search &&
      !query.tag &&
      !query.chapterId &&
      !query.from &&
      !query.to
    );
  }

  invalidateEntryListCache(userId: string): void {
    this.entryListCache.delete(userId);
  }

  async saveEntry(payload: SaveEntryPayload): Promise<MemoryEntry> {
    const isEncrypted = Boolean((payload.metadata as { encrypted?: boolean } | undefined)?.encrypted);
    const metadata = { ...(payload.metadata ?? {}) } as Record<string, unknown>;
    if (payload.relationships?.length) {
      metadata.relationships = payload.relationships;
    }
    // Auto-generate summary if not provided
    // Skip auto-summary for preserved content types (they should keep original wording)
    let summary = payload.summary;
    if (!summary && payload.content && payload.content.length > 20 && !payload.preserve_original_language) {
      try {
        // Lazy import to avoid circular dep (titleGenerationService → memoryService)
        const { titleGenerationService } = await import('./titleGenerationService');
        summary = await titleGenerationService.generateEntrySummary(
          payload.userId,
          payload.content,
          payload.date
        );
      } catch (error) {
        logger.debug({ error }, 'Failed to auto-generate summary, continuing without');
      }
    }

    // If no date supplied, ask dateAssignmentService to infer one from content.
    // Only use the suggestion when confidence is reasonable (≥0.5); otherwise keep now().
    let entryDate = payload.date;
    if (!entryDate && payload.content && payload.content.length > 20) {
      try {
        const suggestion = await dateAssignmentService.suggestDate(payload.userId, payload.content);
        if (suggestion.confidence >= 0.5 && suggestion.source !== 'default') {
          entryDate = suggestion.date.toISOString();
        }
      } catch (error) {
        logger.debug({ error }, 'Date suggestion failed, using current date');
      }
    }

    const entry: MemoryEntry = {
      id: uuid(),
      user_id: payload.userId,
      content: payload.content,
      date: entryDate ?? new Date().toISOString(),
      tags: payload.tags ?? [],
      chapter_id: payload.chapterId ?? null,
      mood: payload.mood ?? null,
      summary: summary ?? null,
      source: payload.source ?? 'manual',
      content_type: payload.content_type as any,
      original_content: payload.original_content ?? null,
      preserve_original_language: payload.preserve_original_language ?? false,
      metadata
    };

    if (!isEncrypted) {
      try {
        const embedding = await embeddingService.embedText(payload.summary ?? payload.content);
        entry.embedding = embedding;
      } catch (error) {
        logger.warn({ error }, 'Entry saved without embedding');
      }
    }

    const insertRow: Record<string, unknown> = { ...entry };
    if (payload.narrativeOrder != null) insertRow.narrative_order = payload.narrativeOrder;
    if (payload.derivedFromEntryId != null) insertRow.derived_from_entry_id = payload.derivedFromEntryId;
    // Derive emotional intensity at ingestion — high-emotion entries decay slower (see migration 20260529000007)
    insertRow.emotional_intensity = deriveEmotionalIntensity(payload.content, payload.mood);

    const { error } = await supabaseAdmin.from('journal_entries').insert(insertRow);
    if (error) {
      // Check if table doesn't exist
      if (error.code === '42P01' || error.message?.includes('does not exist')) {
        logger.error({ error }, 'journal_entries table does not exist. Please run database migrations.');
        throw new Error('Database table "journal_entries" does not exist. Please run migrations.');
      }
      logger.error({ error }, 'Failed to save entry');
      throw error;
    }

    this.invalidateEntryListCache(payload.userId);

    try {
      const upsertedEntities = await peoplePlacesService.recordEntitiesForEntry(entry, payload.relationships);

      // Promote person entities extracted from this entry to character records (fire-and-forget).
      // This is what makes "tío Juan" show up in the Character Book after being mentioned in chat.
      for (const entity of upsertedEntities) {
        if (entity.type === 'person') {
          characterFoundationService.promoteEntityToCharacter(payload.userId, entity).catch((err) => {
            logger.debug({ err, entityName: entity.name }, 'Character promotion failed (non-blocking)');
          });
        }
      }
    } catch (serviceError) {
      logger.warn({ serviceError }, 'Entry saved but failed to track people/places');
    }

    // Trigger engine processing for new entry (fire and forget - non-blocking)
    try {
      const { onNewEntry } = await import('../engineRuntime/triggers');
      onNewEntry(payload.userId, entry.id).catch((err) => {
        logger.warn({ error: err, userId: payload.userId, entryId: entry.id }, 'Engine trigger failed');
      });
    } catch (error) {
      logger.debug({ error }, 'Engine triggers not available, skipping');
    }

    // Auto-extract skills from entry (fire and forget - non-blocking)
    // Only for non-encrypted entries with sufficient content
    if (!isEncrypted && payload.content && payload.content.length > 50) {
      skillExtractionService.processEntryForSkills(payload.userId, entry.id, payload.content)
        .then(results => {
          if (results.length > 0) {
            logger.info({
              userId: payload.userId,
              entryId: entry.id,
              skillCount: results.length,
              skills: results.map(r => r.skill.skill_name),
            }, 'Auto-extracted skills from journal entry');
          }
        })
        .catch(err => {
          logger.warn({ error: err, userId: payload.userId, entryId: entry.id }, 'Failed to extract skills from entry (non-blocking)');
        });

      questSuggestionService.processEntryForQuestSuggestions(payload.userId, entry.id, payload.content)
        .then((count) => {
          if (count > 0) {
            logger.debug({ userId: payload.userId, entryId: entry.id, count }, 'Queued quest suggestions from journal');
          }
        })
        .catch(err => {
          logger.warn({ error: err, userId: payload.userId, entryId: entry.id }, 'Failed to extract quest suggestions from entry (non-blocking)');
        });

      projectSuggestionService.processEntryForProjectSuggestions(payload.userId, entry.id, payload.content)
        .then((count) => {
          if (count > 0) {
            logger.debug({ userId: payload.userId, entryId: entry.id, count }, 'Queued project suggestions from journal');
          }
        })
        .catch(err => {
          logger.warn({ error: err, userId: payload.userId, entryId: entry.id }, 'Failed to extract project suggestions from entry (non-blocking)');
        });
    }

    // Journal ER ingestion (fire-and-forget): unified ER path
    // Skip for external sources that manually invoke the provenance-aware ingestExternalPost
    if (!isEncrypted && payload.content && payload.content.length > 20 && !payload.skipIngestion) {
      ingestJournalEntry(payload.userId, entry.id, payload.content);
    }

    return entry;
  }

  async upsertSummary(
    userId: string,
    date: string,
    summary: string,
    tags: string[]
  ): Promise<void> {
    const normalizedDate = format(startOfDay(parseISO(date)), 'yyyy-MM-dd');
    const { error } = await supabaseAdmin
      .from('daily_summaries')
      .upsert({ id: uuid(), user_id: userId, date: normalizedDate, summary, tags });
    if (error) {
      logger.error({ error }, 'Failed to upsert summary');
      throw error;
    }
  }

  async searchEntries(userId: string, query: JournalQuery = {}): Promise<MemoryEntry[]> {
    try {
      if (query.semantic && query.search) {
        return this.semanticSearchEntries(userId, query.search, query.limit, query.threshold);
      }

      const requestedLimit = query.limit ?? 50;
      const simpleList = this.isSimpleEntryListQuery(query);

      if (simpleList) {
        const cached = this.entryListCache.get(userId);
        if (
          cached &&
          Date.now() - cached.fetchedAt < ENTRY_LIST_CACHE_TTL_MS &&
          cached.limit >= requestedLimit
        ) {
          return cached.entries.slice(0, requestedLimit);
        }
      }

      let builder = supabaseAdmin.from('journal_entries').select(JOURNAL_COLS).eq('user_id', userId);

      if (query.search) {
        builder = builder.ilike('content', `%${query.search}%`);
      }
      if (query.tag) {
        builder = builder.contains('tags', [query.tag]);
      }
      if (query.chapterId) {
        builder = builder.eq('chapter_id', query.chapterId);
      }
      if (query.from) {
        builder = builder.gte('date', query.from);
      }
      if (query.to) {
        builder = builder.lte('date', query.to);
      }

      const fetchLimit = simpleList
        ? Math.max(requestedLimit, BOOTSTRAP_ENTRY_FETCH_LIMIT)
        : requestedLimit;

      const { data, error } = await builder.order('date', { ascending: false }).limit(fetchLimit);
      if (error) {
        // Check if table doesn't exist
        if (error.code === '42P01' || error.message?.includes('does not exist')) {
          logger.warn('journal_entries table does not exist yet, returning empty array');
          return [];
        }
        logger.error({ error }, 'Failed to search entries');
        throw error;
      }

      const entries = data ?? [];

      if (simpleList) {
        this.entryListCache.set(userId, {
          entries,
          fetchedAt: Date.now(),
          limit: fetchLimit,
        });
        return entries.slice(0, requestedLimit);
      }

      return entries;
    } catch (error) {
      // If it's a table doesn't exist error, return empty array
      if (error instanceof Error && (error.message?.includes('does not exist') || (error as any).code === '42P01')) {
        logger.warn('journal_entries table does not exist yet, returning empty array');
        return [];
      }
      throw error;
    }
  }

  async getEntry(userId: string, entryId: string): Promise<MemoryEntry | null> {
    const { data, error } = await supabaseAdmin
      .from('journal_entries')
      .select(JOURNAL_COLS)
      .eq('user_id', userId)
      .eq('id', entryId)
      .single();

    if (error) {
      logger.error({ error }, 'Failed to fetch entry by id');
      return null;
    }

    return data as MemoryEntry;
  }

  async getEntriesByIds(userId: string, entryIds: string[]): Promise<MemoryEntry[]> {
    if (entryIds.length === 0) return [];
    const { data, error } = await supabaseAdmin
      .from('journal_entries')
      .select(JOURNAL_COLS)
      .eq('user_id', userId)
      .in('id', entryIds);
    if (error) {
      logger.error({ error }, 'Failed to fetch entries by ids');
      return [];
    }
    return (data ?? []) as MemoryEntry[];
  }

  async updateEntry(
    userId: string,
    entryId: string,
    updates: Partial<Omit<SaveEntryPayload, 'userId'>>
  ): Promise<MemoryEntry> {
    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString()
    };

    if (updates.content !== undefined) updateData.content = updates.content;
    if (updates.date !== undefined) updateData.date = updates.date;
    if (updates.tags !== undefined) updateData.tags = updates.tags;
    if (updates.chapterId !== undefined) updateData.chapter_id = updates.chapterId;
    if (updates.mood !== undefined) updateData.mood = updates.mood;
    if (updates.summary !== undefined) updateData.summary = updates.summary;
    if (updates.source !== undefined) updateData.source = updates.source;
    if (updates.content_type !== undefined) updateData.content_type = updates.content_type;
    if (updates.original_content !== undefined) updateData.original_content = updates.original_content;
    if (updates.preserve_original_language !== undefined) updateData.preserve_original_language = updates.preserve_original_language;
    if (updates.metadata !== undefined) {
      updateData.metadata = { ...updateData.metadata as Record<string, unknown>, ...updates.metadata };
    }
    if (updates.relationships !== undefined) {
      const metadata = (updateData.metadata as Record<string, unknown>) || {};
      metadata.relationships = updates.relationships;
      updateData.metadata = metadata;
    }

    const { data, error } = await supabaseAdmin
      .from('journal_entries')
      .update(updateData)
      .eq('id', entryId)
      .eq('user_id', userId)
      .select('*')
      .single();

    if (error) {
      logger.error({ error }, 'Failed to update entry');
      throw error;
    }

    this.invalidateEntryListCache(userId);

    // Update embedding if content changed
    if (updates.content || updates.summary) {
      try {
        const embedding = await embeddingService.embedText(updates.summary ?? updates.content ?? '');
        await supabaseAdmin
          .from('journal_entries')
          .update({ embedding })
          .eq('id', entryId)
          .eq('user_id', userId);
      } catch (error) {
        logger.warn({ error }, 'Entry updated but embedding update failed');
      }
    }

    return data as MemoryEntry;
  }

  async getResolvedEntry(userId: string, entryId: string): Promise<ResolvedMemoryEntry | null> {
    const entry = await this.getEntry(userId, entryId);
    return entry ? correctionService.applyCorrections(entry) : null;
  }

  async semanticSearchEntries(
    userId: string,
    search: string,
    limit = 20,
    threshold = 0.4,
    yearShardMin?: number
  ): Promise<MemoryEntry[]> {
    const embedding = await embeddingService.embedText(search);

    // Prefer the typed direct-Postgres path; fall back to the PostgREST RPC if the
    // Drizzle client is unconfigured or the query fails. Both share identical SQL
    // semantics (see drizzle/memoryQueries.matchJournalEntries).
    if (db) {
      try {
        const rows = await matchJournalEntries(userId, embedding, threshold, limit, yearShardMin);
        return rows.map((row) => ({
          ...row,
          date: row.date instanceof Date ? row.date.toISOString() : row.date,
        })) as MemoryEntry[];
      } catch (drizzleError) {
        logger.warn({ error: drizzleError }, 'Drizzle semantic search failed; falling back to RPC');
      }
    }

    const { data, error } = await supabaseAdmin.rpc('match_journal_entries', {
      user_uuid: userId,
      query_embedding: embedding,
      match_threshold: threshold,
      match_count: limit,
      ...(yearShardMin != null && { p_year_shard_min: yearShardMin }),
    });

    if (error) {
      logger.error({ error }, 'Failed to run semantic search');
      throw error;
    }

    return (data as MemoryEntry[]) ?? [];
  }

  async searchEntriesWithCorrections(userId: string, query: JournalQuery = {}): Promise<ResolvedMemoryEntry[]> {
    const entries = await this.searchEntries(userId, query);
    return correctionService.applyCorrectionsToEntries(entries);
  }

  private groupByMonth(entries: MemoryEntry[]): MonthGroup[] {
    const grouped = entries.reduce<Record<string, MemoryEntry[]>>((acc, entry) => {
      const month = format(parseISO(entry.date), 'yyyy MMMM');
      acc[month] = acc[month] ?? [];
      acc[month].push(entry);
      return acc;
    }, {});

    return Object.entries(grouped).map(([month, monthEntries]) => ({
      month,
      entries: monthEntries
    }));
  }

  async getTimeline(
    userId: string
  ): Promise<{ timeline: ChapterTimeline; timing: TimelineEndpointTiming }> {
    const started = Date.now();
    let entryDbMs = 0;
    let chapterLoadMs = 0;
    let stitchMs = 0;
    let entryCacheHit = false;

    try {
      const cachedBefore = this.entryListCache.get(userId);
      const entryCacheWarm = Boolean(
        cachedBefore &&
          Date.now() - cachedBefore.fetchedAt < ENTRY_LIST_CACHE_TTL_MS &&
          cachedBefore.limit >= 365
      );

      const entryStart = Date.now();
      const entriesPromise = this.searchEntries(userId, { limit: 365 }).then((entries) => {
        entryDbMs = Date.now() - entryStart;
        return entries;
      });
      const chaptersStart = Date.now();
      const chaptersPromise = chapterService.listChapters(userId).then((chapters) => {
        chapterLoadMs = Date.now() - chaptersStart;
        return chapters;
      });

      const [entries, chapters] = await Promise.all([entriesPromise, chaptersPromise]);
      entryCacheHit = entryCacheWarm;

      const stitchStart = Date.now();
      const chapterGroups = new Map<string, MemoryEntry[]>();
      chapters.forEach((chapter) => {
        chapterGroups.set(chapter.id, []);
      });
      const unassigned: MemoryEntry[] = [];

      entries.forEach((entry) => {
        if (entry.chapter_id && chapterGroups.has(entry.chapter_id)) {
          chapterGroups.get(entry.chapter_id)!.push(entry);
        } else {
          unassigned.push(entry);
        }
      });

      const chapterTimelines = chapters.map((chapter) => ({
        ...chapter,
        months: this.groupByMonth(chapterGroups.get(chapter.id) ?? []),
      }));

      stitchMs = Date.now() - stitchStart;

      const timeline = {
        chapters: chapterTimelines,
        unassigned: this.groupByMonth(unassigned),
      };

      const serializeStart = Date.now();
      JSON.stringify(timeline);
      const serializeMs = Date.now() - serializeStart;

      return {
        timeline,
        timing: {
          totalMs: Date.now() - started,
          dbMs: Math.max(entryDbMs, chapterLoadMs),
          stitchMs,
          serializeMs,
          chapterLoadMs,
          entryCacheHit,
          openaiMs: 0,
        },
      };
    } catch (error) {
      logger.error({ error }, 'Error building timeline');
      return {
        timeline: {
          chapters: [],
          unassigned: [],
        },
        timing: {
          totalMs: Date.now() - started,
          dbMs: Math.max(entryDbMs, chapterLoadMs),
          stitchMs,
          serializeMs: 0,
          chapterLoadMs,
          entryCacheHit,
          openaiMs: 0,
        },
      };
    }
  }

  async listTags(
    userId: string
  ): Promise<{ tags: Array<{ name: string; count: number }>; timing: TagsEndpointTiming }> {
    const started = Date.now();
    let dbMs = 0;
    let computeMs = 0;
    let entryCacheHit = false;

    const aggregateTags = (rows: Array<{ tags?: string[] | null }>) => {
      const computeStart = Date.now();
      const tags = new Map<string, number>();
      rows.forEach((entry) => {
        (entry.tags ?? []).forEach((tag) => {
          tags.set(tag, (tags.get(tag) ?? 0) + 1);
        });
      });
      computeMs = Date.now() - computeStart;
      return Array.from(tags.entries()).map(([name, count]) => ({ name, count }));
    };

    try {
      const cached = this.entryListCache.get(userId);
      if (
        cached &&
        Date.now() - cached.fetchedAt < ENTRY_LIST_CACHE_TTL_MS &&
        cached.limit >= BOOTSTRAP_ENTRY_FETCH_LIMIT
      ) {
        entryCacheHit = true;
        return {
          tags: aggregateTags(cached.entries),
          timing: {
            totalMs: Date.now() - started,
            dbMs: 0,
            computeMs,
            serializeMs: 0,
            entryCacheHit: true,
            openaiMs: 0,
          },
        };
      }

      const dbStart = Date.now();
      const { data, error } = await supabaseAdmin
        .from('journal_entries')
        .select('tags')
        .eq('user_id', userId)
        .order('date', { ascending: false })
        .limit(BOOTSTRAP_ENTRY_FETCH_LIMIT);

      dbMs = Date.now() - dbStart;

      if (error) {
        if (error.code === '42P01' || error.message?.includes('does not exist')) {
          return {
            tags: [],
            timing: {
              totalMs: Date.now() - started,
              dbMs,
              computeMs: 0,
              serializeMs: 0,
              entryCacheHit: false,
              openaiMs: 0,
            },
          };
        }
        logger.error({ error }, 'Error listing tags');
        throw error;
      }

      const tags = aggregateTags(data ?? []);
      const serializeStart = Date.now();
      JSON.stringify({ tags });
      const serializeMs = Date.now() - serializeStart;

      return {
        tags,
        timing: {
          totalMs: Date.now() - started,
          dbMs,
          computeMs,
          serializeMs,
          entryCacheHit,
          openaiMs: 0,
        },
      };
    } catch (error) {
      logger.error({ error }, 'Error listing tags');
      return {
        tags: [],
        timing: {
          totalMs: Date.now() - started,
          dbMs,
          computeMs,
          serializeMs: 0,
          entryCacheHit,
          openaiMs: 0,
        },
      };
    }
  }

  /**
   * Get recent memories with comprehensive filters and timeline hierarchy info
   */
  async getRecentMemories(
    userId: string,
    options: {
      limit?: number;
      eras?: string[];
      sagas?: string[];
      arcs?: string[];
      characters?: string[];
      sources?: string[];
      tags?: string[];
      dateFrom?: string;
      dateTo?: string;
    }
  ): Promise<MemoryEntry[]> {
    try {
      let builder = supabaseAdmin
        .from('journal_entries')
        .select(JOURNAL_COLS)
        .eq('user_id', userId);

      // Apply date filters
      if (options.dateFrom) {
        builder = builder.gte('date', options.dateFrom);
      }
      if (options.dateTo) {
        builder = builder.lte('date', options.dateTo);
      }

      // Apply source filter
      if (options.sources && options.sources.length > 0) {
        builder = builder.in('source', options.sources);
      }

      // Apply tag filter
      if (options.tags && options.tags.length > 0) {
        builder = builder.overlaps('tags', options.tags);
      }

      // Apply character filter (via metadata relationships)
      if (options.characters && options.characters.length > 0) {
        // This is a simplified filter - in production, you'd join with people_places table
        // For now, we'll filter by checking if any character name appears in content or metadata
        const characterFilter = options.characters.map((char) => `content.ilike.%${char}%`).join(',');
        // Note: This is a simplified approach. Full implementation would require proper joins
      }

      // Apply timeline hierarchy filters (era/saga/arc)
      // These would require joins with timeline tables, but for now we'll get entries first
      // and filter in memory if needed (not ideal, but works for MVP)

      const { data, error } = await builder
        .order('date', { ascending: false })
        .limit(options.limit ?? 20);

      if (error) {
        logger.error({ error }, 'Failed to fetch recent memories');
        return [];
      }

      let entries = (data ?? []) as MemoryEntry[];

      // Apply timeline hierarchy filters if needed
      // TODO: Optimize with proper SQL joins
      if (options.eras || options.sagas || options.arcs) {
        // For now, we'll need to fetch chapter info and filter
        // This is a simplified version - full implementation would use SQL joins
        const chapters = await chapterService.listChapters(userId);
        const filteredEntries: MemoryEntry[] = [];

        for (const entry of entries) {
          if (entry.chapter_id) {
            const chapter = chapters.find((c) => c.id === entry.chapter_id);
            // Check if chapter belongs to filtered arc/saga/era
            // This is simplified - full implementation would traverse hierarchy
            filteredEntries.push(entry);
          } else {
            filteredEntries.push(entry);
          }
        }

        entries = filteredEntries;
      }

      return entries;
    } catch (error) {
      logger.error({ error }, 'Error getting recent memories');
      return [];
    }
  }

  /**
   * Keyword/full-text search for entries
   */
  async keywordSearchEntries(
    userId: string,
    query: string,
    options: {
      limit?: number;
      eras?: string[];
      sagas?: string[];
      arcs?: string[];
      characters?: string[];
      sources?: string[];
      tags?: string[];
      dateFrom?: string;
      dateTo?: string;
    }
  ): Promise<MemoryEntry[]> {
    try {
      let builder = supabaseAdmin
        .from('journal_entries')
        .select(JOURNAL_COLS)
        .eq('user_id', userId);

      // Full-text search on content and summary
      if (query) {
        builder = builder.or(`content.ilike.%${query}%,summary.ilike.%${query}%`);
      }

      // Apply filters
      if (options.dateFrom) {
        builder = builder.gte('date', options.dateFrom);
      }
      if (options.dateTo) {
        builder = builder.lte('date', options.dateTo);
      }
      if (options.sources && options.sources.length > 0) {
        builder = builder.in('source', options.sources);
      }
      if (options.tags && options.tags.length > 0) {
        builder = builder.overlaps('tags', options.tags);
      }

      const { data, error } = await builder
        .order('date', { ascending: false })
        .limit(options.limit ?? 50);

      if (error) {
        logger.error({ error }, 'Failed to keyword search entries');
        return [];
      }

      // Score and rank by keyword density
      const entries = (data ?? []) as MemoryEntry[];
      // Escape regex special characters in user input to prevent regex injection
      const escapeRegExp = (str: string): string => {
        return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      };

      const scored = entries.map((entry) => {
        const contentLower = (entry.content || '').toLowerCase();
        const summaryLower = (entry.summary || '').toLowerCase();
        const queryLower = query.toLowerCase();
        const queryWords = queryLower.split(/\s+/);

        let score = 0;
        queryWords.forEach((word) => {
          // Sanitize word before using in regex to prevent injection attacks
          const escapedWord = escapeRegExp(word);
          const contentMatches = (contentLower.match(new RegExp(escapedWord, 'g')) || []).length;
          const summaryMatches = (summaryLower.match(new RegExp(escapedWord, 'g')) || []).length;
          score += contentMatches * 2 + summaryMatches * 3; // Summary matches weighted higher
        });

        return { entry, score };
      });

      scored.sort((a, b) => b.score - a.score);
      return scored.map((item) => item.entry);
    } catch (error) {
      logger.error({ error }, 'Error keyword searching entries');
      return [];
    }
  }

  /**
   * Get related memory clusters for given memory IDs
   */
  async getRelatedClusters(
    userId: string,
    memoryIds: string[],
    options: { limit?: number } = {}
  ): Promise<{
    clusters: Array<{
      type: 'era' | 'saga' | 'arc' | 'character' | 'temporal' | 'tag' | 'source';
      label: string;
      memories: MemoryEntry[];
    }>;
  }> {
    try {
      if (memoryIds.length === 0) {
        return { clusters: [] };
      }

      // Get the source memories
      const { data: sourceMemories, error: sourceError } = await supabaseAdmin
        .from('journal_entries')
        .select(JOURNAL_COLS)
        .eq('user_id', userId)
        .in('id', memoryIds);

      if (sourceError || !sourceMemories || sourceMemories.length === 0) {
        return { clusters: [] };
      }

      const memories = sourceMemories as MemoryEntry[];
      const clusters: Array<{
        type: 'era' | 'saga' | 'arc' | 'character' | 'temporal' | 'tag' | 'source';
        label: string;
        memories: MemoryEntry[];
      }> = [];

      // Temporal proximity cluster (±5 days)
      const temporalMemories = new Map<string, MemoryEntry>();
      for (const memory of memories) {
        const memoryDate = new Date(memory.date);
        const fiveDaysBefore = new Date(memoryDate.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString();
        const fiveDaysAfter = new Date(memoryDate.getTime() + 5 * 24 * 60 * 60 * 1000).toISOString();

        const { data: nearby } = await supabaseAdmin
          .from('journal_entries')
          .select(JOURNAL_COLS)
          .eq('user_id', userId)
          .gte('date', fiveDaysBefore)
          .lte('date', fiveDaysAfter)
          .neq('id', memory.id)
          .limit(10);

        if (nearby) {
          nearby.forEach((m) => {
            if (!memoryIds.includes(m.id)) {
              temporalMemories.set(m.id, m as MemoryEntry);
            }
          });
        }
      }

      if (temporalMemories.size > 0) {
        clusters.push({
          type: 'temporal',
          label: 'Nearby in time',
          memories: Array.from(temporalMemories.values()).slice(0, options.limit ?? 10)
        });
      }

      // Tag clusters
      const tagGroups = new Map<string, MemoryEntry[]>();
      for (const memory of memories) {
        memory.tags.forEach((tag) => {
          if (!tagGroups.has(tag)) {
            tagGroups.set(tag, []);
          }
        });
      }

      for (const [tag] of tagGroups) {
        const { data: tagMemories } = await supabaseAdmin
          .from('journal_entries')
          .select(JOURNAL_COLS)
          .eq('user_id', userId)
          .contains('tags', [tag])
          .limit(20);

        if (tagMemories && tagMemories.length > 0) {
          // Filter out source memories
          const filtered = (tagMemories as MemoryEntry[]).filter(m => !memoryIds.includes(m.id)).slice(0, 5);
          if (filtered.length > 0) {
            clusters.push({
              type: 'tag',
              label: `Tagged: ${tag}`,
              memories: filtered
            });
          }
        }
      }

      // Source clusters
      const sourceGroups = new Map<string, MemoryEntry[]>();
      for (const memory of memories) {
        const source = memory.source;
        if (!sourceGroups.has(source)) {
          sourceGroups.set(source, []);
        }
      }

      for (const [source] of sourceGroups) {
        const { data: sourceMemories } = await supabaseAdmin
          .from('journal_entries')
          .select(JOURNAL_COLS)
          .eq('user_id', userId)
          .eq('source', source)
          .limit(20);

        if (sourceMemories && sourceMemories.length > 0) {
          // Filter out source memories
          const filtered = (sourceMemories as MemoryEntry[]).filter(m => !memoryIds.includes(m.id)).slice(0, 5);
          if (filtered.length > 0) {
            clusters.push({
              type: 'source',
              label: `From: ${source}`,
              memories: filtered
            });
          }
        }
      }

      return { clusters };
    } catch (error) {
      logger.error({ error }, 'Error getting related clusters');
      return { clusters: [] };
    }
  }

  /**
   * Get linked memories for a specific entry
   */
  async getLinkedMemories(userId: string, entryId: string, limit = 10): Promise<MemoryEntry[]> {
    try {
      const entry = await this.getEntry(userId, entryId);
      if (!entry) {
        return [];
      }

      const linkedIds = new Set<string>();
      const linkedMemories: MemoryEntry[] = [];

      // Same chapter
      if (entry.chapter_id) {
        const { data: chapterMemories } = await supabaseAdmin
          .from('journal_entries')
          .select(JOURNAL_COLS)
          .eq('user_id', userId)
          .eq('chapter_id', entry.chapter_id)
          .neq('id', entryId)
          .limit(limit);

        if (chapterMemories) {
          chapterMemories.forEach((m) => {
            if (!linkedIds.has(m.id)) {
              linkedIds.add(m.id);
              linkedMemories.push(m as MemoryEntry);
            }
          });
        }
      }

      // Shared tags
      if (entry.tags.length > 0) {
        const { data: tagMemories } = await supabaseAdmin
          .from('journal_entries')
          .select(JOURNAL_COLS)
          .eq('user_id', userId)
          .overlaps('tags', entry.tags)
          .neq('id', entryId)
          .limit(limit);

        if (tagMemories) {
          tagMemories.forEach((m) => {
            if (!linkedIds.has(m.id) && linkedMemories.length < limit) {
              linkedIds.add(m.id);
              linkedMemories.push(m as MemoryEntry);
            }
          });
        }
      }

      // Temporal proximity (±5 days)
      const entryDate = new Date(entry.date);
      const fiveDaysBefore = new Date(entryDate.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString();
      const fiveDaysAfter = new Date(entryDate.getTime() + 5 * 24 * 60 * 60 * 1000).toISOString();

      const { data: temporalMemories } = await supabaseAdmin
        .from('journal_entries')
        .select(JOURNAL_COLS)
        .eq('user_id', userId)
        .gte('date', fiveDaysBefore)
        .lte('date', fiveDaysAfter)
        .neq('id', entryId)
        .limit(limit);

      if (temporalMemories) {
        temporalMemories.forEach((m) => {
          if (!linkedIds.has(m.id) && linkedMemories.length < limit) {
            linkedIds.add(m.id);
            linkedMemories.push(m as MemoryEntry);
          }
        });
      }

      // Same source
      const { data: sourceMemories } = await supabaseAdmin
        .from('journal_entries')
        .select(JOURNAL_COLS)
        .eq('user_id', userId)
        .eq('source', entry.source)
        .neq('id', entryId)
        .limit(limit);

      if (sourceMemories) {
        sourceMemories.forEach((m) => {
          if (!linkedIds.has(m.id) && linkedMemories.length < limit) {
            linkedIds.add(m.id);
            linkedMemories.push(m as MemoryEntry);
          }
        });
      }

      return linkedMemories.slice(0, limit);
    } catch (error) {
      logger.error({ error }, 'Error getting linked memories');
      return [];
    }
  }
}

export const memoryService = new MemoryService();
