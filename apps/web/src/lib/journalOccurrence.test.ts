import { describe, it, expect } from 'vitest';
import {
  compareJournalOccurrenceAsc,
  formatJournalOccurrenceLabel,
  hasJournalOccurrence,
  journalOccurrenceMonthKey,
  journalOccurrenceTime,
} from './journalOccurrence';

describe('journalOccurrence display helpers', () => {
  it('labels null occurrence without crashing or using 1970', () => {
    expect(hasJournalOccurrence(null)).toBe(false);
    expect(formatJournalOccurrenceLabel(null)).toBe('Date unknown');
    expect(journalOccurrenceMonthKey(null)).toBe('unscheduled');
    expect(formatJournalOccurrenceLabel(undefined)).toBe('Date unknown');
  });

  it('sorts unknown after dated memories', () => {
    const a = '2020-01-01T00:00:00.000Z';
    const b = '2025-08-21T00:00:00.000Z';
    const sorted = [null, b, a].sort(compareJournalOccurrenceAsc);
    expect(sorted).toEqual([a, b, null]);
  });

  it('does not treat null as epoch', () => {
    expect(journalOccurrenceTime(null)).toBeNull();
    expect(journalOccurrenceTime('2026-07-12T00:00:00.000Z')).not.toBe(0);
  });
});
