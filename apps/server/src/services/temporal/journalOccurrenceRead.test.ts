import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  compareJournalOccurrenceAsc,
  jsonRoundTripPreservesNullDate,
  pickJournalOccurredAt,
  pickJournalRecordedAt,
} from './journalOccurrenceRead';
import { normalizeJournalEntry } from '../timeline/normalizers/journalNormalizer';

const MIGRATION = resolve(
  process.cwd(),
  '../../supabase/migrations/20260821120000_journal_occurrence_nullable.sql',
);

describe('journal occurrence null-safety helpers', () => {
  it('sorts unknown occurrence after dated events, never as 1970 or today', () => {
    const dated = '2024-06-11T18:00:00.000Z';
    const today = new Date().toISOString();
    const rows = [null, dated, today];
    const sorted = [...rows].sort(compareJournalOccurrenceAsc);
    expect(sorted[0]).toBe(dated);
    expect(sorted[sorted.length - 1]).toBeNull();
    expect(Date.parse(sorted[0] as string)).not.toBe(0);
  });

  it('preserves null date through JSON export/import', () => {
    expect(jsonRoundTripPreservesNullDate({ date: null })).toBe(true);
    expect(jsonRoundTripPreservesNullDate({ date: '2024-01-01T00:00:00.000Z' })).toBe(true);
  });

  it('does not mint a dated timeline event from a journal row with unknown occurrence', () => {
    expect(
      normalizeJournalEntry({
        id: 'mem-1',
        date: null,
        content: 'Maya told LoreBook this today but does not know when it happened.',
      }),
    ).toEqual([]);
  });

  it('treats created_at as recording time and never as occurrence', () => {
    expect(pickJournalOccurredAt({ date: null, timestamp: null })).toBeNull();
    expect(pickJournalRecordedAt({ created_at: '2026-08-21T12:00:00.000Z' })).toBe(
      '2026-08-21T12:00:00.000Z',
    );
  });

  it('does not invent occurrence from recording time for undated gym text', () => {
    expect(
      pickJournalOccurredAt({
        date: null,
        timestamp: null,
      }),
    ).toBeNull();
    expect(
      pickJournalRecordedAt({ created_at: '2026-08-21T15:00:00.000Z' }),
    ).toBe('2026-08-21T15:00:00.000Z');
  });

  it('keeps recording time separate from unknown occurrence', () => {
    expect(pickJournalOccurredAt({ date: null })).toBeNull();
    expect(pickJournalRecordedAt({ created_at: '2026-08-21T15:00:00.000Z' })).toBe(
      '2026-08-21T15:00:00.000Z',
    );
  });
});

describe('nullable occurrence migration SQL (unapplied)', () => {
  const sql = readFileSync(MIGRATION, 'utf8');

  it('drops NOT NULL and DEFAULT without rewriting historical dates', () => {
    expect(sql).toMatch(/ALTER COLUMN date DROP DEFAULT/i);
    expect(sql).toMatch(/ALTER COLUMN date DROP NOT NULL/i);
    expect(sql).not.toMatch(/UPDATE\s+public\.journal_entries/i);
    expect(sql).not.toMatch(/SET\s+date\s*=\s*NOW\(\)/i);
    expect(sql).not.toMatch(/WHERE date IS NULL/i);
  });

  it('replaces sync_chronology_index so NULL date never becomes NOW()', () => {
    expect(sql).toMatch(/IF NEW\.date IS NULL THEN/i);
    expect(sql).toMatch(/DELETE FROM public\.chronology_index/i);
    expect(sql).not.toMatch(/COALESCE\(NEW\.date,\s*NOW\(\)\)/i);
    expect(sql).not.toMatch(/COALESCE\(NEW\.date,\s*NEW\.created_at\)/i);
  });
});
