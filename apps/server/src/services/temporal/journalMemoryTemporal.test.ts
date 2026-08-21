import { describe, expect, it } from 'vitest';
import {
  classifyJournalMemoryTemporal,
  explainJournalMemoryTemporal,
  happenedPhrase,
  occurrenceForChronology,
  wroteAboutPhrase,
} from './journalMemoryTemporal';

const MAYA_CONCERT = 'I went to a concert with Maya.';
const JULY = '2026-07-15T20:00:00.000Z';
const AUG_20 = '2026-08-20T18:00:00.000Z';
const AUG_21 = '2026-08-21T18:00:00.000Z';
const WEEK_LATER = '2026-07-22T18:00:00.000Z';

describe('journal memory temporal authority', () => {
  it('1. Journal recorded the same day as the event keeps that occurrence', () => {
    const view = classifyJournalMemoryTemporal({
      journalId: 'je-same-day',
      content: MAYA_CONCERT,
      claimedDate: JULY,
      createdAt: JULY,
    });
    expect(view.occurredAt).toBe(JULY);
    expect(view.recordedAt).toBe(JULY);
    expect(view.occurrenceStatus).toBe('confirmed');
    expect(view.recordingFallbackRejected).toBe(false);
  });

  it('2. Journal recorded one week after the event keeps July occurrence', () => {
    const view = classifyJournalMemoryTemporal({
      journalId: 'je-week-later',
      content: MAYA_CONCERT,
      claimedDate: JULY,
      createdAt: WEEK_LATER,
      temporalSource: 'user_stated',
    });
    expect(view.occurredAt).toBe(JULY);
    expect(view.recordedAt).toBe(WEEK_LATER);
    expect(view.mentionedAt).toBe(WEEK_LATER);
  });

  it('3. Journal recorded months later does not move the concert to August', () => {
    const view = classifyJournalMemoryTemporal({
      journalId: 'je-months-later',
      content: 'Last month I went to a concert with Maya.',
      claimedDate: AUG_20,
      createdAt: AUG_20,
      temporalSource: 'recording_fallback',
    });
    expect(view.occurredAt).toBeNull();
    expect(view.recordedAt).toBe(AUG_20);
    expect(view.recordingFallbackRejected).toBe(true);
    expect(happenedPhrase(view)).toContain('unknown');
    expect(wroteAboutPhrase(view)).toContain('2026-08-20');
  });

  it('4. Known recording date with unknown occurrence stays unresolved', () => {
    const view = classifyJournalMemoryTemporal({
      journalId: 'je-unknown',
      content: 'I was thinking about Maya.',
      claimedDate: AUG_20,
      createdAt: AUG_20,
      temporalSource: 'recording_fallback',
    });
    expect(view.occurredAt).toBeNull();
    expect(view.occurrenceStatus).toBe('unresolved');
    expect(occurrenceForChronology(view)).toBeNull();
  });

  it('5–7. Approximate / month / range precision is not promoted to a day', () => {
    const view = classifyJournalMemoryTemporal({
      journalId: 'je-month',
      content: 'Last summer I went to a concert with Maya.',
      claimedDate: '2026-07-01T00:00:00.000Z',
      createdAt: AUG_20,
      temporalSource: 'relative_expression',
      timePrecision: 'month',
    });
    expect(view.occurredAt).toBe('2026-07-01T00:00:00.000Z');
    expect(view.occurrenceStatus).toBe('range');
    expect(view.precision).toBe('month');
    expect(view.recordedAt).toBe(AUG_20);
  });

  it('8. Sequence-only remains unresolved', () => {
    const view = classifyJournalMemoryTemporal({
      journalId: 'je-seq',
      content: 'Before that we went out. After that I called Maya.',
      claimedDate: AUG_20,
      createdAt: AUG_20,
      temporalSource: 'recording_fallback',
    });
    expect(view.unresolvedReason).toBe('sequence_only');
    expect(view.occurredAt).toBeNull();
  });

  it('9. “I don’t remember when” stays unresolved', () => {
    const view = classifyJournalMemoryTemporal({
      journalId: 'je-idk',
      content: "I don't remember when we went to the concert with Maya.",
      claimedDate: AUG_20,
      createdAt: AUG_20,
    });
    expect(view.unresolvedReason).toBe('unknown_occurrence');
    expect(view.occurredAt).toBeNull();
  });

  it('10–12. Canonical event beats memory.date; created_at and mentionedAt never become occurrence', () => {
    const view = classifyJournalMemoryTemporal({
      journalId: 'je-linked',
      canonicalEventId: 'evt-concert',
      content: 'Writing about the concert with Maya.',
      claimedDate: AUG_20,
      createdAt: AUG_20,
      mentionedAt: AUG_21,
      canonicalOccurredAt: JULY,
      temporalSource: 'recording_fallback',
    });
    expect(view.occurredAt).toBe(JULY);
    expect(view.mentionedAt).toBe(AUG_21);
    expect(view.recordedAt).toBe(AUG_20);
    expect(view.canonicalLinkage).toBe(true);
    expect(view.dedupeDecision).toBe('keep_canonical_event');
    expect(view.recordingFallbackRejected).toBe(true);
    expect(view.canonicalEventId).toBe('evt-concert');
  });

  it('13–14. Character Story can order by occurrence and keep unresolved memory undated', () => {
    const dated = classifyJournalMemoryTemporal({
      journalId: 'je-dated',
      content: MAYA_CONCERT,
      claimedDate: JULY,
      createdAt: WEEK_LATER,
      temporalSource: 'user_stated',
    });
    const undated = classifyJournalMemoryTemporal({
      journalId: 'je-undated',
      content: 'Thinking about Maya.',
      claimedDate: AUG_20,
      createdAt: AUG_20,
      temporalSource: 'recording_fallback',
    });
    expect(occurrenceForChronology(dated)).toBe(JULY);
    expect(occurrenceForChronology(undated)).toBeNull();
  });

  it('15–16. Journal + resolved event of the same concert dedupe to one canonical id', () => {
    const view = classifyJournalMemoryTemporal({
      journalId: 'je-concert',
      canonicalEventId: 'evt-concert',
      claimedDate: AUG_20,
      createdAt: AUG_20,
      canonicalOccurredAt: JULY,
    });
    expect(view.dedupeDecision).toBe('keep_canonical_event');
    expect(view.canonicalEventId).toBe('evt-concert');
    expect(view.journalSourceId).toBe('je-concert');
  });

  it('19. “When did X happen?” does not answer with recording date', () => {
    const view = classifyJournalMemoryTemporal({
      content: 'Last month I went to a concert with Maya.',
      claimedDate: AUG_20,
      createdAt: AUG_20,
      temporalSource: 'recording_fallback',
    });
    expect(happenedPhrase(view)).not.toContain('2026-08-20');
  });

  it('20. “When did I write about X?” uses mention/record time', () => {
    const view = classifyJournalMemoryTemporal({
      content: MAYA_CONCERT,
      claimedDate: JULY,
      createdAt: AUG_20,
      mentionedAt: AUG_20,
      temporalSource: 'user_stated',
    });
    expect(wroteAboutPhrase(view)).toContain('2026-08-20');
  });

  it('diagnostics answer why a memory is on a date', () => {
    const view = classifyJournalMemoryTemporal({
      journalId: 'je-diag',
      canonicalEventId: 'evt-concert',
      claimedDate: AUG_20,
      createdAt: AUG_20,
      canonicalOccurredAt: JULY,
      temporalSource: 'recording_fallback',
    });
    expect(explainJournalMemoryTemporal(view)).toMatchObject({
      canonicalItemId: 'evt-concert',
      journalSourceId: 'je-diag',
      occurredAt: JULY,
      recordedAt: AUG_20,
      recordingFallbackRejected: true,
      canonicalEventLinkage: true,
    });
  });
});
