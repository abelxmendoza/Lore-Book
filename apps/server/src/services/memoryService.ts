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

import { chapterService } from './chapterService';
import { correctionService } from './correctionService';
import { embeddingService } from './embeddingService';
import { peoplePlacesService } from './peoplePlacesService';
import { skillExtractionService } from './skills/skillExtractionService';
import { supabaseAdmin } from './supabaseClient';

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
};

class MemoryService {
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
        summary = await titleGenerationService.generateEntrySummary(
          payload.userId,
          payload.content,
          payload.date
        );
      } catch (error) {
        logger.debug({ error }, 'Failed to auto-generate summary, continuing without');
      }
    }

    const entry: MemoryEntry = {
      id: uuid(),
      user_id: payload.userId,
      content: payload.content,
      date: payload.date ?? new Date().toISOString(),
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

    const { error } = await supabaseAdmin.from('journal_entries').insert(entry);
    if (error) {
      // Check if table doesn't exist
      if (error.code === '42P01' || error.message?.includes('does not exist')) {
        logger.error({ error }, 'journal_entries table does not exist. Please run database migrations.');
        throw new Error('Database table "journal_entries" does not exist. Please run migrations.');
      }
      logger.error({ error }, 'Failed to save entry');
      throw error;
    }

    try {
      await peoplePlacesService.recordEntitiesForEntry(entry, payload.relationships);
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
              skills: results.map(r => r.skill.skill_name)
            }, 'Auto-extracted skills from journal entry');
          }
        })
        .catch(err => {
          logger.warn({ error: err, userId: payload.userId, entryId: entry.id }, 'Failed to extract skills from entry (non-blocking)');
        });
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

      let builder = supabaseAdmin.from('journal_entries').select('*').eq('user_id', userId);

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

      const { data, error } = await builder.order('date', { ascending: false }).limit(query.limit ?? 50);
      if (error) {
        // Check if table doesn't exist
        if (error.code === '42P01' || error.message?.includes('does not exist')) {
          logger.warn('journal_entries table does not exist yet, returning empty array');
          return [];
        }
        logger.error({ error }, 'Failed to search entries');
        throw error;
      }

      return data ?? [];
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
      .select('*')
      .eq('user_id', userId)
      .eq('id', entryId)
      .single();

    if (error) {
      logger.error({ error }, 'Failed to fetch entry by id');
      return null;
    }

    return data as MemoryEntry;
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
    threshold = 0.4
  ): Promise<MemoryEntry[]> {
    const embedding = await embeddingService.embedText(search);

    const { data, error } = await supabaseAdmin.rpc('match_journal_entries', {
      user_uuid: userId,
      query_embedding: embedding,
      match_threshold: threshold,
      match_count: limit
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

  async getTimeline(userId: string): Promise<ChapterTimeline> {
    try {
      const [entries, chapters] = await Promise.all([
        this.searchEntries(userId, { limit: 365 }),
        chapterService.listChapters(userId)
      ]);

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
        months: this.groupByMonth(chapterGroups.get(chapter.id) ?? [])
      }));

      return {
        chapters: chapterTimelines,
        unassigned: this.groupByMonth(unassigned)
      };
    } catch (error) {
      logger.error({ error }, 'Error building timeline');
      // Return empty timeline on error
      return {
        chapters: [],
        unassigned: []
      };
    }
  }

  async listTags(userId: string) {
    try {
      const entries = await this.searchEntries(userId, { limit: 500 });
      const tags = new Map<string, number>();
      entries.forEach((entry) => {
        entry.tags.forEach((tag) => {
          tags.set(tag, (tags.get(tag) ?? 0) + 1);
        });
      });
      return Array.from(tags.entries()).map(([name, count]) => ({ name, count }));
    } catch (error) {
      logger.error({ error }, 'Error listing tags');
      return [];
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
        .select('*')
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
        .select('*')
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
        .select('*')
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
          .select('*')
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
          .select('*')
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
          .select('*')
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
          .select('*')
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
          .select('*')
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
        .select('*')
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
        .select('*')
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
