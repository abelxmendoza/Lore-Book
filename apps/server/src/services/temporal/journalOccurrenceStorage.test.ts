import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { extractLexicalOccurrence } from '../dateAssignmentService';
import {
  classifyJournalMemoryTemporal,
  clocksFromJournalEntry,
  happenedPhrase,
  occurrenceForChronology,
  wroteAboutPhrase,
} from './journalMemoryTemporal';
import {
  planJournalChronologyIndexSync,
  resolveJournalOccurrenceWrite,
} from './journalOccurrenceStorage';
import {
  auditLegacyJournalTemporalRows,
  classifyLegacyJournalTemporalRow,
} from './legacyJournalTemporalClassifier';

const MAYA = 'Maya';
const PRIYA = 'Priya';
const AUG_21 = '2026-08-21T18:00:00.000Z';
const JULY_15 = '2026-07-15T20:00:00.000Z';
const JULY_1 = '2026-07-01T00:00:00.000Z';
const NOW = new Date('2026-08-21T18:00:00.000Z');
const USER_A = '00000000-0000-4000-8000-00000000000a';
const USER_B = '00000000-0000-4000-8000-00000000000b';

const MIGRATION = path.resolve(
  __dirname,
  '../../../../../supabase/migrations/20260821010000_journal_occurrence_nullable.sql',
);

describe('journal occurrence storage authority', () => {
  it('migration drops date default/not-null and never COALESCE(date, NOW())', () => {
    const sql = readFileSync(MIGRATION, 'utf8');
    expect(sql).toContain('ALTER COLUMN date DROP DEFAULT');
    expect(sql).toContain('ALTER COLUMN date DROP NOT NULL');
    expect(sql).toContain('IF NEW.date IS NULL THEN');
    expect(sql).not.toMatch(/COALESCE\s*\(\s*NEW\.date\s*,\s*NOW\s*\(\s*\)/i);
    expect(sql).not.toMatch(/UPDATE\s+public\.journal_entries/i);
    expect(sql).not.toMatch(/SET\s+date\s*=\s*NOW/i);
  });

  it('1. explicit exact date is stored as occurrence', () => {
    const write = resolveJournalOccurrenceWrite({
      explicitDate: JULY_15,
      recordedAt: AUG_21,
    });
    expect(write.date).toBe(JULY_15);
    expect(write.timestamp).toBe(JULY_15);
    expect(write.temporal_source).toBe('user_stated');
    expect(write.recorded_at).toBe(AUG_21);
  });

  it('2. explicit date + later recording keeps July occurrence', () => {
    const write = resolveJournalOccurrenceWrite({
      explicitDate: JULY_15,
      recordedAt: AUG_21,
    });
    const view = classifyJournalMemoryTemporal({
      claimedDate: write.date,
      createdAt: write.recorded_at,
      temporalSource: write.temporal_source,
      content: `I went to a concert with ${MAYA}.`,
    });
    expect(view.occurredAt).toBe(JULY_15);
    expect(view.recordedAt).toBe(AUG_21);
  });

  it('3. yesterday is extracted as occurrence, not recording', () => {
    const lexical = extractLexicalOccurrence(`Yesterday I went to a show with ${MAYA}.`, NOW);
    expect(lexical?.source).toBe('extracted');
    expect(lexical?.date?.toISOString().slice(0, 10)).toBe('2026-08-20');
  });

  it('4. last month is approximate occurrence, not August 21', () => {
    const lexical = extractLexicalOccurrence(`I went to that show with ${MAYA} sometime last month.`, NOW);
    expect(lexical?.date).not.toBeNull();
    expect(lexical?.date?.toISOString().slice(0, 7)).not.toBe('2026-08');
    const write = resolveJournalOccurrenceWrite({
      suggestion: lexical!,
      recordedAt: AUG_21,
    });
    expect(write.date).not.toBe(AUG_21);
    expect(write.time_precision).toMatch(/month|approximate|day/);
  });

  it('5. month precision is stored as month, not a day', () => {
    const write = resolveJournalOccurrenceWrite({
      suggestion: {
        date: new Date(JULY_1),
        precision: 'month',
        confidence: 0.7,
        source: 'extracted',
        originalText: 'July',
      },
      recordedAt: AUG_21,
    });
    expect(write.time_precision).toBe('month');
    const view = classifyJournalMemoryTemporal({
      claimedDate: write.date,
      createdAt: AUG_21,
      temporalSource: write.temporal_source,
      timePrecision: write.time_precision,
      content: `Last summer I went to a concert with ${MAYA}.`,
    });
    expect(view.occurrenceStatus).toBe('range');
  });

  it('6. year precision is not promoted to a day', () => {
    const write = resolveJournalOccurrenceWrite({
      suggestion: {
        date: new Date('2024-01-01T00:00:00.000Z'),
        precision: 'year',
        confidence: 0.7,
        source: 'extracted',
        originalText: '2024',
      },
      recordedAt: AUG_21,
    });
    expect(write.time_precision).toBe('year');
  });

  it('7. range stays a range', () => {
    const view = classifyJournalMemoryTemporal({
      claimedDate: JULY_1,
      createdAt: AUG_21,
      temporalSource: 'relative_expression',
      timePrecision: 'month',
      content: `From early July through late July I traveled with ${PRIYA}.`,
    });
    expect(view.occurrenceStatus).toBe('range');
  });

  it('8. sometime last summer is not recording day', () => {
    const lexical = extractLexicalOccurrence(`Sometime last summer I went to a concert with ${MAYA}.`, NOW);
    const write = resolveJournalOccurrenceWrite({
      suggestion: lexical,
      recordedAt: AUG_21,
    });
    expect(write.date).not.toBe(AUG_21);
  });

  it('9. no date → NULL occurrence, recording only in recorded_at', () => {
    const write = resolveJournalOccurrenceWrite({
      recordedAt: AUG_21,
    });
    expect(write.date).toBeNull();
    expect(write.timestamp).toBeNull();
    expect(write.temporal_source).toBe('unresolved');
    expect(write.recorded_at).toBe(AUG_21);
    expect(planJournalChronologyIndexSync({ date: write.date }).action).toBe('omit');
  });

  it('10. I don\'t remember when → unresolved, not today', () => {
    const lexical = extractLexicalOccurrence(
      `I don't remember when this happened. I was thinking about ${MAYA}.`,
      NOW,
    );
    expect(lexical?.date).toBeNull();
    const write = resolveJournalOccurrenceWrite({
      suggestion: lexical,
      recordedAt: AUG_21,
    });
    expect(write.date).toBeNull();
    const view = classifyJournalMemoryTemporal({
      content: `I don't remember when this happened.`,
      claimedDate: write.date,
      createdAt: AUG_21,
      temporalSource: write.temporal_source,
    });
    expect(view.occurredAt).toBeNull();
    expect(happenedPhrase(view)).toContain('unknown');
  });

  it('11. recording today about an old event keeps the old occurrence', () => {
    const write = resolveJournalOccurrenceWrite({
      explicitDate: JULY_15,
      recordedAt: AUG_21,
    });
    expect(write.date).toBe(JULY_15);
    expect(write.recorded_at).toBe(AUG_21);
  });

  it('12. recording today about an unknown event does not claim today', () => {
    const lexical = extractLexicalOccurrence(
      `I wrote this today. I don't know when it happened.`,
      NOW,
    );
    expect(lexical?.date).toBeNull();
    const write = resolveJournalOccurrenceWrite({
      suggestion: lexical,
      recordedAt: AUG_21,
    });
    expect(write.date).toBeNull();
    expect(planJournalChronologyIndexSync({ date: write.date }).startTime).toBeNull();
  });

  it('13. explicit today is occurrence', () => {
    const lexical = extractLexicalOccurrence(`Today I went to a concert with ${MAYA}.`, NOW);
    expect(lexical?.date?.toISOString()).toBe(NOW.toISOString());
    expect(lexical?.source).toBe('extracted');
  });

  it('14. explicit right now is occurrence', () => {
    const lexical = extractLexicalOccurrence(`I am with ${PRIYA} right now.`, NOW);
    expect(lexical?.date?.toISOString()).toBe(NOW.toISOString());
  });

  it('15. date == created_at but explicitly occurred today is confirmed', () => {
    const view = classifyJournalMemoryTemporal({
      content: `Today I went to a concert with ${MAYA}.`,
      claimedDate: AUG_21,
      createdAt: AUG_21,
      temporalSource: 'user_stated',
    });
    expect(view.occurredAt).toBe(AUG_21);
    expect(view.occurrenceStatus).toBe('confirmed');
  });

  it('16. date == created_at from recording_fallback is not occurrence', () => {
    const view = classifyJournalMemoryTemporal({
      content: `I was thinking about ${MAYA}.`,
      claimedDate: AUG_21,
      createdAt: AUG_21,
      temporalSource: 'recording_fallback',
    });
    expect(view.occurredAt).toBeNull();
    const report = classifyLegacyJournalTemporalRow({
      journalEntryId: 'je-fallback',
      storedDate: AUG_21,
      createdAt: AUG_21,
      temporalSource: 'recording_fallback',
      content: `I was thinking about ${MAYA}.`,
    });
    expect(report.classification).toBe('invalid_occurrence_fallback');
    expect(report.proposedAction).toBe('clear_occurrence');
  });

  it('17. ambiguous legacy equal timestamps are not rewritten', () => {
    const report = classifyLegacyJournalTemporalRow({
      journalEntryId: 'je-legacy',
      storedDate: AUG_21,
      createdAt: AUG_21,
      temporalSource: null,
      content: `Spent the evening with ${MAYA}.`,
    });
    expect(report.classification).toBe('ambiguous_legacy');
    expect(report.proposedAction).toBe('none');
    expect(report.reason).toMatch(/Cannot prove/);
  });

  it('18. canonical resolved_event linkage overrides journal compatibility date', () => {
    const view = classifyJournalMemoryTemporal({
      journalId: 'je-linked',
      canonicalEventId: 'evt-concert',
      content: `Writing about the concert with ${MAYA}.`,
      claimedDate: AUG_21,
      createdAt: AUG_21,
      canonicalOccurredAt: JULY_15,
      temporalSource: 'recording_fallback',
    });
    expect(view.occurredAt).toBe(JULY_15);
    expect(view.canonicalEventId).toBe('evt-concert');
    const report = classifyLegacyJournalTemporalRow({
      journalEntryId: 'je-linked',
      storedDate: AUG_21,
      createdAt: AUG_21,
      canonicalEventId: 'evt-concert',
      canonicalOccurredAt: JULY_15,
    });
    expect(report.classification).toBe('canonical_override');
    expect(report.proposedAction).toBe('prefer_canonical');
  });

  it('19. chronology index does not manufacture NOW()', () => {
    const omitted = planJournalChronologyIndexSync({ date: null });
    expect(omitted).toEqual({
      action: 'omit',
      startTime: null,
      reason: 'unknown occurrence must not mint chronology start_time',
    });
    const upserted = planJournalChronologyIndexSync({ date: JULY_15, timePrecision: 'day' });
    expect(upserted.action).toBe('upsert');
    if (upserted.action === 'upsert') {
      expect(upserted.startTime).toBe(JULY_15);
      expect(upserted.startTime).not.toBe(AUG_21);
    }
  });

  it('20. unresolved appears as unresolved, not dated chronology', () => {
    const view = classifyJournalMemoryTemporal({
      content: `I wrote this today. I don't know when it happened.`,
      claimedDate: null,
      createdAt: AUG_21,
      temporalSource: 'unresolved',
    });
    expect(view.occurrenceStatus).toBe('unresolved');
    expect(occurrenceForChronology(view)).toBeNull();
    expect(planJournalChronologyIndexSync({ date: null }).action).toBe('omit');
  });

  it('21. Character Story clock for unknown occurrence is Date unknown', () => {
    const view = classifyJournalMemoryTemporal({
      content: `Thinking about ${MAYA}.`,
      claimedDate: null,
      createdAt: AUG_21,
      temporalSource: 'unresolved',
    });
    expect(view.occurredAt).toBeNull();
    expect(happenedPhrase(view)).toContain('unknown');
  });

  it('22. Subject Timeline does not place unknown item today', () => {
    const clocks = clocksFromJournalEntry({
      date: null,
      created_at: AUG_21,
      content: `I don't remember when this happened with ${MAYA}.`,
      metadata: { temporal_source: 'unresolved' },
    });
    expect(clocks.occurredAt).toBeNull();
    expect(clocks.recordedAt).toBe(AUG_21);
  });

  it('23. chat recall distinguishes occurred vs recorded', () => {
    const view = classifyJournalMemoryTemporal({
      content: `I went to a concert with ${MAYA}.`,
      claimedDate: JULY_15,
      createdAt: AUG_21,
      mentionedAt: AUG_21,
      temporalSource: 'user_stated',
    });
    expect(happenedPhrase(view)).toContain('2026-07-15');
    expect(wroteAboutPhrase(view)).toContain('2026-08-21');
    expect(happenedPhrase(view)).not.toContain('2026-08-21');
  });

  it('24. dry-run never mutates', () => {
    const result = auditLegacyJournalTemporalRows(USER_A, [
      {
        journalEntryId: 'je-1',
        userId: USER_A,
        storedDate: AUG_21,
        createdAt: AUG_21,
        temporalSource: 'recording_fallback',
        content: `Thinking about ${MAYA}.`,
      },
    ]);
    expect(result.mutated).toBe(false);
    expect(result.rows[0]?.proposedAction).toBe('clear_occurrence');
  });

  it('25. tenant isolation', () => {
    const result = auditLegacyJournalTemporalRows(USER_A, [
      {
        journalEntryId: 'je-a',
        userId: USER_A,
        storedDate: JULY_15,
        createdAt: AUG_21,
        temporalSource: 'user_stated',
      },
      {
        journalEntryId: 'je-b',
        userId: USER_B,
        storedDate: AUG_21,
        createdAt: AUG_21,
        temporalSource: 'recording_fallback',
      },
    ]);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.journalEntryId).toBe('je-a');
  });
});
