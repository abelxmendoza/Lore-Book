import { createClient } from '@supabase/supabase-js';
import { format, parseISO, startOfDay } from 'date-fns';
import { v4 as uuid } from 'uuid';

import { config } from '../config';
import { logger } from '../logger';
import type { JournalQuery, MemoryEntry, MemorySource } from '../types';

const supabase = createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
  auth: { persistSession: false }
});

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
};

class MemoryService {
  async saveEntry(payload: SaveEntryPayload): Promise<MemoryEntry> {
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
      metadata: payload.metadata ?? {}
    };

    const { error } = await supabase.from('journal_entries').insert(entry);
    if (error) {
      logger.error({ error }, 'Failed to save entry');
      throw error;
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
    const { error } = await supabase
      .from('daily_summaries')
      .upsert({ id: uuid(), user_id: userId, date: normalizedDate, summary, tags });
    if (error) {
      logger.error({ error }, 'Failed to upsert summary');
      throw error;
    }
  }

  async searchEntries(userId: string, query: JournalQuery = {}): Promise<MemoryEntry[]> {
    let builder = supabase.from('journal_entries').select('*').eq('user_id', userId);

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
      logger.error({ error }, 'Failed to search entries');
      throw error;
    }

    return data ?? [];
  }

  async getTimeline(userId: string) {
    const entries = await this.searchEntries(userId, { limit: 365 });
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

  async listTags(userId: string) {
    const entries = await this.searchEntries(userId, { limit: 500 });
    const tags = new Map<string, number>();
    entries.forEach((entry) => {
      entry.tags.forEach((tag) => {
        tags.set(tag, (tags.get(tag) ?? 0) + 1);
      });
    });
    return Array.from(tags.entries()).map(([name, count]) => ({ name, count }));
  }
}

export const memoryService = new MemoryService();
