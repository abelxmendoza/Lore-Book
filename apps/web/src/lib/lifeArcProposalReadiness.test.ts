import { describe, expect, it } from 'vitest';

import type { LifeArcProposal } from '../hooks/useLifeArcProposals';
import { isProposalReadyForAutoCreate } from './lifeArcProposalReadiness';

function proposal(overrides: Partial<LifeArcProposal> = {}): LifeArcProposal {
  return {
    id: 'p1',
    fingerprint: 'fp',
    title: 'Career chapter',
    arc_type: 'work',
    track: 'career',
    start_date: '2024-01-01',
    end_date: '2024-06-01',
    confidence: 0.9,
    explanation: 'Evidence-backed span.',
    source_record_ids: ['a', 'b'],
    evidence: [
      { sourceKind: 'resolved_event', sourceId: 'a', sourceIds: ['a'], title: 'A', occurredAt: '2024-01-01T00:00:00.000Z', confidence: 0.9 },
      { sourceKind: 'resolved_event', sourceId: 'b', sourceIds: ['b'], title: 'B', occurredAt: '2024-06-01T00:00:00.000Z', confidence: 0.9 },
    ],
    status: 'pending',
    ...overrides,
  };
}

describe('isProposalReadyForAutoCreate', () => {
  it('accepts high-confidence multi-month proposals', () => {
    expect(isProposalReadyForAutoCreate(proposal())).toBe(true);
  });

  it('rejects low confidence or short spans without strong evidence', () => {
    expect(isProposalReadyForAutoCreate(proposal({ confidence: 0.5 }))).toBe(false);
    expect(isProposalReadyForAutoCreate(proposal({
      start_date: '2024-01-01',
      end_date: '2024-01-03',
      evidence: proposal().evidence.slice(0, 2),
    }))).toBe(false);
  });

  it('allows shorter spans when evidence is strong', () => {
    expect(isProposalReadyForAutoCreate(proposal({
      start_date: '2024-01-01',
      end_date: '2024-01-10',
      evidence: [
        ...proposal().evidence,
        { sourceKind: 'resolved_event', sourceId: 'c', sourceIds: ['c'], title: 'C', occurredAt: '2024-01-05T00:00:00.000Z', confidence: 0.9 },
      ],
    }))).toBe(true);
  });
});
