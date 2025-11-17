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
    const entry: MemoryEntry = {
      id: uuid(),
      user_id: payload.userId,
      content: payload.content,
      date: payload.date ?? new Date().toISOString(),
      tags: payload.tags ?? [],
      chapter_id: payload.chapterId ?? null,
      mood: payload.mood ?? null,
      summary: payload.summary ?? null,
      source: payload.source ?? 'manual',
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
}

export const memoryService = new MemoryService();
