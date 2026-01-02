import type { MemoryEntry } from '../../types';

export class VoicePrintExtractor {
  extract(entries: MemoryEntry[]): string {
    const sample = entries
      .slice(0, 10)
      .map((e) => e.content || e.summary || '')
      .join(' ');
    return sample.slice(0, 300); // first 300 characters
  }
}

