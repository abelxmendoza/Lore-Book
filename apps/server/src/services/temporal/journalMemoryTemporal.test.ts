import { describe, expect, it } from 'vitest';

import {
  compareByOccurrence,
  isRecordingMasquerade,
  occurrenceDateOrEmpty,
  resolveJournalMemoryTemporal,
} from './journalMemoryTemporal';

const JULY = '2026-07-15T20:00:00.000Z';
const AUG_20_WRITE = '2026-08-20T18:42:13.001Z';
const AUG_20_NOW = '2026-08-20T18:42:13.200Z';
const JUNE_MONTH = '2026-06-01T00:00:00.000Z';

describe('resolveJournalMemoryTemporal', () => {
  it('1. journal recorded same day as event keeps occurrence, not write time-of-day as a competing clock', () => {
    const clocks = resolveJournalMemoryTemporal({
      journalEntryId: 'je-1',
      journalDate: '2026-08-20T00:00:00.000Z',
      recordedAt: AUG_20_WRITE,
      sourceType: 'manual',
      temporalSource: 'user_stated',
      precision: 'date',
    });
    expect(clocks.occurredAt).toBe('2026-08-20T00:00:00.000Z');
    expect(clocks.recordedAt).toBe(AUG_20_WRITE);
    expect(clocks.occurrenceStatus).not.toBe('unresolved');
  });

  it('2. journal recorded after the event keeps July occurrence', () => {
    const clocks = resolveJournalMemoryTemporal({
      journalDate: JULY,
      recordedAt: AUG_20_WRITE,
      sourceType: 'chat',
      temporalSource: 'user_stated',
      precision: 'date',
    });
    expect(clocks.occurredAt).toBe(JULY);
    expect(clocks.mentionedAt).toBe(AUG_20_WRITE);
    expect(clocks.recordedAt).toBe(AUG_20_WRITE);
  });

  it('3. journal recorded months after the event still uses occurrence', () => {
    const clocks = resolveJournalMemoryTemporal({
      journalDate: JUNE_MONTH,
      recordedAt: AUG_20_WRITE,
      sourceType: 'chat',
      temporalSource: 'relative_expression',
      precision: 'month',
    });
    expect(clocks.occurredAt).toBe(JUNE_MONTH);
    expect(clocks.occurrenceStatus).toBe('range');
    expect(clocks.precision).toBe('month');
  });

  it('4. known recording date + unknown occurrence stays unresolved', () => {
    const clocks = resolveJournalMemoryTemporal({
      journalDate: null,
      recordedAt: AUG_20_WRITE,
      sourceType: 'chat',
    });
    expect(clocks.occurredAt).toBeNull();
    expect(clocks.occurrenceStatus).toBe('unresolved');
    expect(clocks.recordedAt).toBe(AUG_20_WRITE);
    expect(occurrenceDateOrEmpty(clocks)).toBe('');
  });

  it('5. approximate occurrence is not upgraded to the exact recording timestamp', () => {
    const clocks = resolveJournalMemoryTemporal({
      journalDate: JUNE_MONTH,
      recordedAt: AUG_20_WRITE,
      sourceType: 'journal',
      temporalSource: 'user_stated',
      precision: 'month',
    });
    expect(clocks.occurredAt).toBe(JUNE_MONTH);
    expect(clocks.occurredAt).not.toBe(AUG_20_WRITE);
    expect(clocks.precision).toBe('month');
    expect(clocks.occurrenceStatus).toBe('range');
  });

  it('6. month precision is preserved', () => {
    const clocks = resolveJournalMemoryTemporal({
      journalDate: JUNE_MONTH,
      recordedAt: AUG_20_WRITE,
      temporalSource: 'user_stated',
      precision: 'month',
    });
    expect(clocks.precision).toBe('month');
    expect(clocks.temporal.occurred.precision).toBe('month');
  });

  it('7. range precision (season) is preserved', () => {
    const clocks = resolveJournalMemoryTemporal({
      journalDate: '2026-06-21T00:00:00.000Z',
      recordedAt: AUG_20_WRITE,
      temporalSource: 'relative_expression',
      precision: 'season',
    });
    expect(clocks.precision).toBe('season');
    expect(clocks.occurrenceStatus).toBe('range');
  });

  it('8. sequence-only / unknown precision stays unresolved rather than minting a timestamp', () => {
    const clocks = resolveJournalMemoryTemporal({
      journalDate: AUG_20_NOW,
      recordedAt: AUG_20_WRITE,
      sourceType: 'chat',
      temporalSource: 'recording_fallback',
      precision: 'unknown',
    });
    expect(clocks.occurredAt).toBeNull();
    expect(clocks.occurrenceStatus).toBe('unresolved');
  });

  it('9. unknown occurrence is unresolved', () => {
    const clocks = resolveJournalMemoryTemporal({
      recordedAt: AUG_20_WRITE,
      sourceType: 'manual',
    });
    expect(clocks.occurredAt).toBeNull();
    expect(clocks.occurrenceStatus).toBe('unresolved');
  });

  it('10. canonical event occurrence beats memory.date', () => {
    const clocks = resolveJournalMemoryTemporal({
      journalEntryId: 'je-concert',
      journalDate: AUG_20_NOW,
      recordedAt: AUG_20_WRITE,
      sourceType: 'chat',
      canonicalOccurredAt: JULY,
      canonicalEventId: 'evt-concert',
      canonicalPrecision: 'date',
    });
    expect(clocks.occurredAt).toBe(JULY);
    expect(clocks.canonicalEventId).toBe('evt-concert');
    expect(clocks.recordedAt).toBe(AUG_20_WRITE);
  });

  it('11. created_at never silently becomes occurrence', () => {
    const clocks = resolveJournalMemoryTemporal({
      journalDate: AUG_20_NOW,
      recordedAt: AUG_20_WRITE,
      sourceType: 'chat',
    });
    expect(isRecordingMasquerade({
      journalDate: AUG_20_NOW,
      recordedAt: AUG_20_WRITE,
      sourceType: 'chat',
    })).toBe(true);
    expect(clocks.occurredAt).toBeNull();
    expect(clocks.recordedAt).toBe(AUG_20_WRITE);
  });

  it('12. mentionedAt never silently becomes occurrence', () => {
    const clocks = resolveJournalMemoryTemporal({
      journalDate: JULY,
      recordedAt: AUG_20_WRITE,
      sourceType: 'chat',
      temporalSource: 'user_stated',
    });
    expect(clocks.mentionedAt).toBe(AUG_20_WRITE);
    expect(clocks.occurredAt).toBe(JULY);
    expect(clocks.occurredAt).not.toBe(clocks.mentionedAt);
  });

  it('13. Character Story order is occurrence, not recording', () => {
    const laterWriteOlderLife = resolveJournalMemoryTemporal({
      journalDate: '2024-06-01T00:00:00.000Z',
      recordedAt: AUG_20_WRITE,
      temporalSource: 'user_stated',
    });
    const earlierWriteNewerLife = resolveJournalMemoryTemporal({
      journalDate: '2025-01-01T00:00:00.000Z',
      recordedAt: '2025-01-02T00:00:00.000Z',
      temporalSource: 'user_stated',
    });
    const unresolved = resolveJournalMemoryTemporal({
      journalDate: AUG_20_NOW,
      recordedAt: AUG_20_WRITE,
      sourceType: 'chat',
    });
    const ordered = [unresolved, earlierWriteNewerLife, laterWriteOlderLife].sort(compareByOccurrence);
    expect(ordered.map((c) => c.occurredAt)).toEqual([
      '2024-06-01T00:00:00.000Z',
      '2025-01-01T00:00:00.000Z',
      null,
    ]);
  });

  it('14. unresolved memory stays undated', () => {
    const clocks = resolveJournalMemoryTemporal({
      journalDate: AUG_20_NOW,
      recordedAt: AUG_20_WRITE,
      sourceType: 'chat',
      temporalSource: 'recording_fallback',
    });
    expect(occurrenceDateOrEmpty(clocks)).toBe('');
    expect(clocks.temporal.occurred.start).toBeNull();
  });

  it('15-16. journal + resolved event share one occurrence and keep both ids', () => {
    const clocks = resolveJournalMemoryTemporal({
      journalEntryId: 'je-1',
      journalDate: AUG_20_NOW,
      recordedAt: AUG_20_WRITE,
      sourceType: 'chat',
      canonicalOccurredAt: JULY,
      canonicalEventId: 'evt-1',
    });
    expect(clocks.journalEntryId).toBe('je-1');
    expect(clocks.canonicalEventId).toBe('evt-1');
    expect(clocks.occurredAt).toBe(JULY);
  });

  it('19. "when did X happen?" must not answer with recording date', () => {
    const clocks = resolveJournalMemoryTemporal({
      journalDate: AUG_20_NOW,
      recordedAt: AUG_20_WRITE,
      sourceType: 'chat',
    });
    expect(clocks.occurredAt).toBeNull();
    expect(clocks.recordedAt).toBe(AUG_20_WRITE);
  });

  it('20. "when did I write about X?" can use mention/record time', () => {
    const clocks = resolveJournalMemoryTemporal({
      journalDate: JULY,
      recordedAt: AUG_20_WRITE,
      sourceType: 'chat',
      temporalSource: 'user_stated',
    });
    expect(clocks.mentionedAt).toBe(AUG_20_WRITE);
    expect(clocks.recordedAt).toBe(AUG_20_WRITE);
  });
});
