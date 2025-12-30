/**
 * Normalizes journal entries into timeline events
 */

import { NormalizedTimelineEvent, Normalizer } from './base';

export interface JournalEntry {
  id: string;
  date: string | Date;
  content: string;
  summary?: string | null;
  tags?: string[];
  mood?: string | null;
  sentiment?: string | null;
  chapter_id?: string | null;
  source?: string;
  metadata?: Record<string, any>;
}

export const normalizeJournalEntry: Normalizer<JournalEntry> = (entry: JournalEntry): NormalizedTimelineEvent[] => {
  const eventDate = typeof entry.date === 'string' ? new Date(entry.date) : entry.date;
  const title = entry.summary || entry.content.substring(0, 100) || 'Journal Entry';
  
  return [{
    title,
    description: entry.content.length > 200 ? entry.content.substring(0, 200) + '...' : entry.content,
    eventDate,
    tags: ['journal', ...(entry.tags || [])],
    metadata: {
      sentiment: entry.sentiment,
      mood: entry.mood,
      chapter_id: entry.chapter_id,
      source: entry.source || 'manual',
      ...entry.metadata
    },
    sourceType: 'journal',
    sourceId: entry.id,
    confidence: 1.0
  }];
};


