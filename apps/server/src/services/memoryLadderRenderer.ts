import {
  addDays,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isSameWeek,
  parseISO,
  startOfDay,
  startOfMonth,
  startOfWeek
} from 'date-fns';

import type { MemoryLadderEntry, MemoryLadderGroup, MemoryLadderInterval } from '../types';
import { correctionService } from './correctionService';
import { memoryService } from './memoryService';

const MAX_RENDER_ENTRIES = 500;

const intervalBounds: Record<MemoryLadderInterval, (date: Date) => { start: Date; end: Date }> = {
  daily: (date: Date) => ({
    start: startOfDay(date),
    end: startOfDay(date)
  }),
  weekly: (date: Date) => {
    const start = startOfWeek(date, { weekStartsOn: 1 });
    return { start, end: endOfWeek(start, { weekStartsOn: 1 }) };
  },
  monthly: (date: Date) => {
    const start = startOfMonth(date);
    return { start, end: endOfMonth(start) };
  }
};

const intervalLabels: Record<MemoryLadderInterval, (start: Date, end: Date) => string> = {
  daily: (start) => {
    const today = startOfDay(new Date());
    if (isSameDay(start, today)) return 'Today';
    if (isSameDay(start, addDays(today, -1))) return 'Yesterday';
    return format(start, 'EEEE, MMM d');
  },
  weekly: (start, end) => {
    const today = new Date();
    if (isSameWeek(today, start, { weekStartsOn: 1 })) return 'This Week';
    return `Week of ${format(start, 'MMM d')}`;
  },
  monthly: (start) => {
    const today = new Date();
    if (isSameMonth(today, start)) return 'This Month';
    return format(start, 'LLLL yyyy');
  }
};

const normalizeList = (value: unknown): string[] => {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === 'string' && value.trim()) return [value];
  return [];
};

class MemoryLadderRenderer {
  private toEntry(raw: ReturnType<typeof correctionService.applyCorrections>): MemoryLadderEntry {
    const corrected = raw.corrected_content ?? raw.summary ?? raw.content;
    const metadata = (raw.metadata ?? {}) as Record<string, unknown>;
    const primaryLine = corrected.split('\n').map((line) => line.trim()).find(Boolean);
    const title = (metadata.title as string | undefined) ?? raw.summary ?? primaryLine ?? 'Untitled memory';

    return {
      id: raw.id,
      date: raw.date,
      title,
      key_tags: raw.tags ?? [],
      emotion_summary: (metadata.emotion_summary as string | undefined) ?? raw.mood ?? null,
      echoes: normalizeList(metadata.echoes),
      traits_detected: normalizeList(metadata.traits_detected ?? metadata.traits),
      content_preview: corrected.slice(0, 240),
      corrected_content: raw.corrected_content,
      summary: raw.summary,
      resolution_notes: raw.resolution_notes,
      corrections: raw.corrections ?? [],
      source: raw.source ?? 'manual'
    };
  }

  private groupEntries(entries: ReturnType<typeof correctionService.applyCorrectionsToEntries>, interval: MemoryLadderInterval) {
    const grouped = new Map<string, MemoryLadderGroup>();

    entries.forEach((entry) => {
      const date = parseISO(entry.date);
      const { start, end } = intervalBounds[interval](date);
      const key = `${start.toISOString()}_${end.toISOString()}`;
      const group = grouped.get(key);
      const mapped = this.toEntry(entry);

      if (group) {
        group.entries.push(mapped);
      } else {
        grouped.set(key, {
          label: intervalLabels[interval](start, end),
          start: start.toISOString(),
          end: end.toISOString(),
          entries: [mapped]
        });
      }
    });

    return Array.from(grouped.values()).map((group) => ({
      ...group,
      entries: group.entries.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    }));
  }

  async render(
    userId: string,
    filters: { interval: MemoryLadderInterval; persona?: string; tag?: string; emotion?: string }
  ) {
    const entries = await memoryService.searchEntries(userId, { limit: MAX_RENDER_ENTRIES });
    const resolved = correctionService.applyCorrectionsToEntries(entries);

    const filtered = resolved.filter((entry) => {
      const metadata = (entry.metadata ?? {}) as Record<string, unknown>;
      if (filters.tag && !entry.tags.includes(filters.tag)) return false;
      if (filters.persona) {
        const persona = (metadata.persona as string | undefined)?.toLowerCase();
        if (!persona || !persona.includes(filters.persona.toLowerCase())) return false;
      }
      if (filters.emotion) {
        const mood = (metadata.emotion_summary as string | undefined) ?? entry.mood ?? '';
        if (!mood.toLowerCase().includes(filters.emotion.toLowerCase())) return false;
      }
      return true;
    });

    const groups = this.groupEntries(filtered, filters.interval).sort(
      (a, b) => new Date(b.start).getTime() - new Date(a.start).getTime()
    );

    return { interval: filters.interval, groups };
  }
}

export const memoryLadderRenderer = new MemoryLadderRenderer();
