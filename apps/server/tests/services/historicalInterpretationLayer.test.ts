import { describe, expect, it, vi } from 'vitest';

import {
  buildInterpretationConfirmationDecision,
  detectHistoricalInterpretationCandidate,
  historicalInterpretationService,
  projectHistoricalInterpretationTimeline,
  type HistoricalInterpretationRecord,
} from '../../src/services/historicalInterpretation';

function record(overrides: Partial<HistoricalInterpretationRecord> = {}): HistoricalInterpretationRecord {
  return {
    id: 'interpretation-1', userId: 'synthetic-user', eventRecordId: 'event-1', resolvedEventId: 'resolved-1',
    interpretation: 'Looking back, I see this as a turning point.', kind: 'MEANING', author: 'USER',
    status: 'PROPOSED', confidence: 0.94, createdAt: '2026-01-01T00:00:00.000Z', replacesId: null,
    whyChanged: 'Later reflection changed how the event is understood.',
    supportingEvidence: [{ sourceType: 'conversation_message', sourceId: 'message-1' }],
    contradictingEvidence: [], sourceConversationMessageId: 'message-1', ...overrides,
  };
}

describe('Historical Interpretation Layer', () => {
  it('does not mistake ordinary event detail for historical interpretation', () => {
    expect(detectHistoricalInterpretationCandidate('We met at the cafe at 2 PM.')).toBeNull();
  });

  it('extracts explicit hindsight as meaning without changing the event', () => {
    const candidate = detectHistoricalInterpretationCandidate('Looking back, I now see that period as the beginning of something better.');
    expect(candidate).toEqual(expect.objectContaining({ kind: 'MEANING' }));
    expect(candidate!.confidence).toBeGreaterThan(0.8);
  });

  it('keeps lessons distinct from historical facts', () => {
    const candidate = detectHistoricalInterpretationCandidate('In hindsight, I learned that setbacks can redirect me toward better work.');
    expect(candidate?.kind).toBe('LESSON');
  });

  it('versions interpretations and prefers the latest user-confirmed meaning', () => {
    const first = record({ id: 'first', status: 'SUPERSEDED', createdAt: '2026-01-01T00:00:00.000Z' });
    const current = record({ id: 'current', status: 'CANONICAL', createdAt: '2027-01-01T00:00:00.000Z', replacesId: 'first' });
    const alternative = record({ id: 'alternative', author: 'LOREBOOK', status: 'PROPOSED', createdAt: '2028-01-01T00:00:00.000Z' });
    const timeline = projectHistoricalInterpretationTimeline('event-1', [alternative, current, first]);
    expect(timeline.historicalFactImmutable).toBe(true);
    expect(timeline.currentUnderstanding?.id).toBe('current');
    expect(timeline.alternativeInterpretations.map((item) => item.id)).toEqual(['alternative']);
  });

  it('lets only a user-confirmed narrative interpretation reach automatic governance', () => {
    const decision = buildInterpretationConfirmationDecision({ userId: 'synthetic-user', interpretation: record() });
    expect(decision).toEqual(expect.objectContaining({ outcome: 'ALLOW_AUTOMATIC', permitted: true }));
    expect(decision.envelope).toEqual(expect.objectContaining({
      intent: 'CONFIRM', category: 'NARRATIVE', reason: 'REVIEW_APPROVAL',
    }));
  });

  it('emits projection invalidation only after an atomic confirmation succeeds', async () => {
    const apply = vi.fn().mockResolvedValue({ mutationId: 'mutation-1' });
    const result = await historicalInterpretationService.confirmWithAtomicAdapter({
      userId: 'synthetic-user', interpretation: record(), adapter: { atomic: true, apply },
    });
    expect(result.executionOutcome).toBe('APPLIED');
    expect(result.projectionInvalidationEvent?.projections).toEqual([
      'identity_snapshot', 'context_plan_cache', 'publishing_projection',
    ]);
  });
});
