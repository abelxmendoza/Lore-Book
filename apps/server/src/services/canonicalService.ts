import { formatISO } from 'date-fns';

import type { CanonicalAlignment, CanonicalRecord, ResolvedMemoryEntry } from '../types';
import { correctionService } from './correctionService';
import { memoryService } from './memoryService';

class CanonicalService {
  private toCanonicalRecord(entry: ResolvedMemoryEntry): CanonicalRecord {
    return {
      entryId: entry.id,
      date: entry.date,
      canonicalContent: entry.corrected_content ?? entry.content,
      tags: Array.from(new Set(entry.tags)),
      chapterId: entry.chapter_id ?? null,
      summary: entry.summary ?? undefined,
      correctionCount: entry.corrections?.length ?? 0,
      lastCorrectedAt: entry.corrections?.at(-1)?.created_at
    };
  }

  async buildAlignment(userId: string): Promise<CanonicalAlignment> {
    const entries = await memoryService.searchEntries(userId, { limit: 250 });
    const resolved = correctionService.applyCorrectionsToEntries(entries);
    resolved.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    const records = resolved.map((entry) => this.toCanonicalRecord(entry));
    const chapters = records.reduce<CanonicalAlignment['chapters']>((acc, record) => {
      const key = record.chapterId ?? 'unassigned';
      const current = acc[key] ?? { tagSet: [] as string[], entries: [] as string[] };
      const combinedTags = new Set([...current.tagSet, ...record.tags]);
      acc[key] = { tagSet: Array.from(combinedTags), entries: [...current.entries, record.entryId] };
      return acc;
    }, {});

    return { records, chapters };
  }

  summarizeCorrections(records: CanonicalRecord[]) {
    const totalCorrections = records.reduce((sum, record) => sum + record.correctionCount, 0);
    const lastUpdated = records.reduce<string | undefined>((latest, record) => {
      if (!record.lastCorrectedAt) return latest;
      if (!latest || new Date(record.lastCorrectedAt) > new Date(latest)) {
        return formatISO(new Date(record.lastCorrectedAt));
      }
      return latest;
    }, undefined);

    return { totalCorrections, lastUpdated };
  }
}

export const canonicalService = new CanonicalService();
