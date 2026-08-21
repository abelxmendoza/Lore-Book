import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import { classifyJournalOccurrenceFromText, resolveJournalWriteOccurrence } from './journalOccurrenceWrite';
import { dateAssignmentService } from '../dateAssignmentService';

const NOW = new Date('2026-08-20T18:42:13.001Z');

vi.mock('../../lib/openai', () => ({
  openai: {
    chat: {
      completions: {
        create: vi.fn().mockResolvedValue({
          choices: [{ message: { content: '{"date":null,"confidence":0}' } }],
        }),
      },
    },
  },
}));

describe('journal occurrence write contract', () => {
  it('1. explicit exact date from payload is occurrence', () => {
    const write = resolveJournalWriteOccurrence({
      explicitDate: '2026-07-15T20:00:00.000Z',
      content: 'We went to a concert with Jamie.',
      now: NOW,
    });
    expect(write.occurredAt).toBe('2026-07-15T20:00:00.000Z');
    expect(write.temporalSource).toBe('user_stated');
  });

  it('2. explicit today is occurrence today', () => {
    const write = classifyJournalOccurrenceFromText('Today I went to a concert with Jamie.', NOW);
    expect(write.occurredAt?.slice(0, 10)).toBe('2026-08-20');
    expect(write.unresolvedReason).toBeNull();
  });

  it('3. explicit right now is occurrence now', () => {
    const write = classifyJournalOccurrenceFromText('I am at the show right now.', NOW);
    expect(write.occurredAt).toBe(NOW.toISOString());
  });

  it('4. yesterday is yesterday', () => {
    const write = classifyJournalOccurrenceFromText('Yesterday I saw Jamie.', NOW);
    expect(write.occurredAt?.slice(0, 10)).toBe('2026-08-19');
  });

  it('5-6. last month keeps month precision', () => {
    const write = classifyJournalOccurrenceFromText('Last month I went to a concert with Jamie.', NOW);
    expect(write.occurredAt?.slice(0, 7)).toBe('2026-07');
    expect(write.precision).toBe('month');
  });

  it('7. year precision is preserved', () => {
    const write = classifyJournalOccurrenceFromText('In 2019 I started at Vanguard Robotics.', NOW);
    expect(write.precision).toBe('year');
    expect(write.occurredAt?.slice(0, 4)).toBe('2019');
  });

  it('8. approximate season is preserved', () => {
    const write = classifyJournalOccurrenceFromText('Last summer I traveled with Jamie.', NOW);
    expect(write.precision).toBe('season');
    expect(write.occurredAt).not.toBeNull();
  });

  it('9. range keeps both ends when present', () => {
    const write = classifyJournalOccurrenceFromText('Last month I went to a concert with Jamie.', NOW);
    expect(write.occurredEnd).not.toBeNull();
  });

  it('10. no date stays unresolved and is not now', () => {
    const write = classifyJournalOccurrenceFromText('Jamie and I talked about MemoVault.', NOW);
    expect(write.occurredAt).toBeNull();
    expect(write.recordedAt).toBe(NOW.toISOString());
    expect(write.unresolvedReason).toBe('no temporal evidence');
  });

  it('11. "I don\'t remember when" is unresolved even if written today', () => {
    const write = classifyJournalOccurrenceFromText(
      'I wrote this today. I don\'t remember when the concert happened.',
      NOW,
    );
    expect(write.occurredAt).toBeNull();
    expect(write.mentionedAt).toBe(NOW.toISOString());
    expect(write.recordedAt).toBe(NOW.toISOString());
  });

  it('12. recorded today about an old event keeps the old occurrence', () => {
    const write = classifyJournalOccurrenceFromText(
      'Last month I went to a concert with Jamie. Writing this today.',
      NOW,
    );
    expect(write.occurredAt?.slice(0, 7)).toBe('2026-07');
    expect(write.mentionedAt).toBe(NOW.toISOString());
  });

  it('13. recorded today about an unknown event stays unresolved', () => {
    const write = classifyJournalOccurrenceFromText(
      'I am writing this today. I don\'t know when this happened.',
      NOW,
    );
    expect(write.occurredAt).toBeNull();
  });

  it('18. chronology index migration does not COALESCE date with NOW()', () => {
    const sql = readFileSync(
      resolve(process.cwd(), '../../supabase/migrations/20260821120000_journal_occurrence_nullable.sql'),
      'utf8',
    );
    expect(sql).not.toMatch(/COALESCE\(\s*NEW\.date\s*,\s*NOW\(\)/i);
    expect(sql).toMatch(/IF NEW\.date IS NULL/);
  });

  it('14. explicit user date still works even without temporalSource', () => {
    const write = resolveJournalWriteOccurrence({
      explicitDate: '2026-08-21',
      content: 'Jamie and I talked about MemoVault.',
      now: NOW,
    });
    expect(write.occurredAt?.slice(0, 10)).toBe('2026-08-21');
    expect(write.temporalSource).toBe('user_stated');
  });

  it('sourceCreatedAt is mention time, not occurrence, when the story time differs', () => {
    const write = resolveJournalWriteOccurrence({
      content: 'Thinking about Japan last summer.',
      sourceCreatedAt: '2026-08-20T12:00:00.000Z',
      now: NOW,
    });
    expect(write.mentionedAt).toBe('2026-08-20T12:00:00.000Z');
    expect(write.occurredAt).not.toBe('2026-08-20T12:00:00.000Z');
    expect(write.precision).toBe('season');
  });

  it('recording_fallback ignores an explicit now stamp', () => {
    const write = resolveJournalWriteOccurrence({
      explicitDate: NOW.toISOString(),
      temporalSource: 'recording_fallback',
      content: 'Resume uploaded.',
      now: NOW,
    });
    expect(write.occurredAt).toBeNull();
    expect(write.temporalSource).toBe('recording_fallback');
  });

  it('document_stated preserves year precision', () => {
    const write = resolveJournalWriteOccurrence({
      explicitDate: '2024-01-01',
      occurrencePrecision: 'year',
      temporalSource: 'document_stated',
      now: NOW,
    });
    expect(write.occurredAt?.slice(0, 4)).toBe('2024');
    expect(write.precision).toBe('year');
    expect(write.temporalSource).toBe('document_stated');
  });
});

describe('dateAssignmentService', () => {
  it('does not default missing dates to now', async () => {
    const suggestion = await dateAssignmentService.suggestDate(
      '11111111-1111-4111-8111-111111111111',
      'Jamie and I talked about MemoVault.',
      { now: NOW },
    );
    expect(suggestion.date).toBeNull();
    expect(suggestion.source).toBe('unresolved');
    expect(suggestion.confidence).toBe(0);
  });

  it('resolves explicit today without inventing a different clock', async () => {
    const suggestion = await dateAssignmentService.suggestDate(
      '11111111-1111-4111-8111-111111111111',
      'Today I went to a concert with Jamie.',
      { now: NOW },
    );
    expect(suggestion.date?.toISOString().slice(0, 10)).toBe('2026-08-20');
    expect(suggestion.source).toBe('extracted');
  });
});
