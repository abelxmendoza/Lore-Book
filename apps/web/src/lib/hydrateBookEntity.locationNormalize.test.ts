import { describe, expect, it } from 'vitest';
import { normalizeLocationProfile } from './hydrateBookEntity';

describe('normalizeLocationProfile', () => {
  it('fills missing array fields so place modals can render sparse book cards', () => {
    const normalized = normalizeLocationProfile({
      id: 'loc-1',
      name: 'Northwind Depot',
      visitCount: 2,
    } as any);

    expect(normalized.relatedPeople).toEqual([]);
    expect(normalized.tagCounts).toEqual([]);
    expect(normalized.chapters).toEqual([]);
    expect(normalized.moods).toEqual([]);
    expect(normalized.entries).toEqual([]);
    expect(normalized.sources).toEqual([]);
    expect(normalized.visitCount).toBe(2);
  });
});
