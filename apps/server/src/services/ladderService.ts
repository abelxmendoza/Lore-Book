import { endOfMonth, endOfWeek, format, parseISO, startOfDay, startOfMonth, startOfWeek } from 'date-fns';

import type { LadderRung, MemoryLadder, ResolvedMemoryEntry } from '../types';
import { correctionService } from './correctionService';
import { memoryService } from './memoryService';

const MAX_GROUP_ENTRIES = 400;

class LadderService {
  private summarize(entries: ResolvedMemoryEntry[]): string {
    if (!entries.length) return 'No entries available for this period.';
    const highlights = entries.slice(0, 3).map((entry) => {
      const content = entry.corrected_content ?? entry.summary ?? entry.content;
      return `${format(parseISO(entry.date), 'MMM d')}: ${content}`;
    });
    const extra = entries.length > 3 ? ` (+${entries.length - 3} more)` : '';
    return `${highlights.join(' | ')}${extra}`;
  }

  private buildRungs(
    entries: ResolvedMemoryEntry[],
    getWindowStart: (date: Date) => Date,
    getWindowEnd: (start: Date) => Date,
    labelFormat: string
  ): LadderRung[] {
    const grouped = new Map<string, ResolvedMemoryEntry[]>();

    entries.forEach((entry) => {
      const date = parseISO(entry.date);
      const start = getWindowStart(date);
      const end = getWindowEnd(start);
      const key = `${start.toISOString()}_${end.toISOString()}`;
      const bucket = grouped.get(key) ?? [];
      bucket.push(entry);
      grouped.set(key, bucket);
    });

    return Array.from(grouped.entries())
      .map(([key, bucket]) => {
        const [start, end] = key.split('_');
        return {
          label: format(parseISO(start), labelFormat),
          start,
          end,
          entryIds: bucket.map((entry) => entry.id),
          summary: this.summarize(bucket)
        } satisfies LadderRung;
      })
      .sort((a, b) => new Date(b.start).getTime() - new Date(a.start).getTime());
  }

  async buildLadder(userId: string, from?: string): Promise<MemoryLadder> {
    const entries = await memoryService.searchEntries(userId, {
      from,
      limit: MAX_GROUP_ENTRIES
    });
    const resolved = correctionService.applyCorrectionsToEntries(entries);

    const daily = this.buildRungs(
      resolved,
      (date) => startOfDay(date),
      (start) => start,
      'yyyy-MM-dd'
    );
    const weekly = this.buildRungs(
      resolved,
      (date) => startOfWeek(date, { weekStartsOn: 1 }),
      (start) => endOfWeek(start, { weekStartsOn: 1 }),
      "'Week of' MMM d"
    );
    const monthly = this.buildRungs(resolved, (date) => startOfMonth(date), (start) => endOfMonth(start), 'yyyy MMMM');

    return { daily, weekly, monthly };
  }
}

export const ladderService = new LadderService();
