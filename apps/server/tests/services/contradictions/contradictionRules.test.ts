import { describe, it, expect } from 'vitest';

import { detectContradictions } from '../../../src/services/contradictions/contradictionDetectionService';
import { detectAliasPossibleDuplicate } from '../../../src/services/contradictions/domainContradictionService';
import { preserveBothClaims } from '../../../src/services/contradictions/contradictionProvenanceService';
import { requiresCriticalReview, buildReviewQueue } from '../../../src/services/contradictions/contradictionReviewService';
import type { EvidenceBundle } from '../../../src/services/provenance/inference/provenanceInferenceTypes';

function bundle(
  partial: Partial<EvidenceBundle> & Pick<EvidenceBundle, 'id' | 'claimText'>,
): EvidenceBundle {
  return {
    sourceType: 'user_message',
    sourceQuote: partial.claimText,
    claimType: 'entity',
    origin: 'explicit_user_statement',
    confidence: 0.9,
    truthState: 'candidate',
    createdAt: '2024-01-01T00:00:00Z',
    ...partial,
  };
}

describe('contradiction rules', () => {
  it('Marcus self/father creates identity contradiction', () => {
    const existing = bundle({
      id: 'e1',
      claimText: 'Marcus Chen is me',
      claimType: 'identity',
      sourceMessageId: 'msg-1',
    });
    const incoming = bundle({
      id: 'n1',
      claimText: 'Marcus Chen is my father',
      claimType: 'identity',
      sourceMessageId: 'msg-2',
    });

    const result = detectContradictions({ existingClaims: [existing], newClaim: incoming });
    expect(result.contradictions.length).toBe(1);
    expect(result.contradictions[0].contradictionType).toBe('identity');
    expect(result.contradictions[0].suggestedResolution).toBe('split_entities');
    expect(requiresCriticalReview(result.contradictions[0])).toBe(true);
  });

  it('Bryan relationship contradiction review', () => {
    const existing = bundle({
      id: 'e1',
      claimText: 'Bryan is my best friend',
      claimType: 'relationship',
      sourceMessageId: 'msg-1',
    });
    const incoming = bundle({
      id: 'n1',
      claimText: 'I barely knew Bryan in high school',
      claimType: 'relationship',
      sourceMessageId: 'msg-2',
    });

    const result = detectContradictions({ existingClaims: [existing], newClaim: incoming });
    expect(result.contradictions.length).toBe(1);
    expect(result.contradictions[0].contradictionType).toBe('relationship');
    expect(result.contradictions[0].requiresReview).toBe(true);
    expect(result.contradictions[0].suggestedResolution).toBe('needs_user_review');
  });

  it('Amazon May/July timeline conflict', () => {
    const existing = bundle({
      id: 'e1',
      claimText: 'I started Amazon in July',
      claimType: 'timeline',
      sourceMessageId: 'msg-1',
    });
    const incoming = bundle({
      id: 'n1',
      claimText: 'I started Amazon in May',
      claimType: 'timeline',
      sourceMessageId: 'msg-2',
    });

    const result = detectContradictions({ existingClaims: [existing], newClaim: incoming });
    expect(result.contradictions.some((c) => c.contradictionType === 'timeline')).toBe(true);
    expect(result.contradictions[0].suggestedResolution).toBe('mark_time_bounded');
  });

  it('paused → active becomes status transition, not hard contradiction', () => {
    const existing = bundle({
      id: 'e1',
      claimText: 'LoreBook is paused',
      claimType: 'status',
      sourceMessageId: 'msg-1',
    });
    const incoming = bundle({
      id: 'n1',
      claimText: 'I am working on LoreBook every night',
      claimType: 'status',
      sourceMessageId: 'msg-2',
    });

    const result = detectContradictions({ existingClaims: [existing], newClaim: incoming });
    expect(result.transitions.length).toBe(1);
    expect(result.transitions[0].fromStatus).toBe('paused');
    expect(result.transitions[0].toStatus).toBe('active');
    expect(result.contradictions.length).toBe(0);
  });

  it('Hell Fairy project suggestion rejected because known character', () => {
    const existing = bundle({
      id: 'e1',
      claimText: 'Hell Fairy exists as a character in my lore',
      claimType: 'entity',
      origin: 'explicit_user_statement',
      truthState: 'confirmed',
      sourceMessageId: 'msg-1',
    });
    const incoming = bundle({
      id: 'n1',
      claimText: 'Hell Fairy is a project',
      claimType: 'entity',
      origin: 'system_inferred',
      confidence: 0.55,
      sourceMessageId: 'msg-2',
    });

    const result = detectContradictions({
      existingClaims: [existing],
      newClaim: incoming,
      knownCanonDomains: { 'Hell Fairy': 'character' },
    });
    expect(result.contradictions.some((c) => c.contradictionType === 'domain')).toBe(true);
    expect(result.rejectedWeakExtractions.some((r) => r.id === 'n1')).toBe(true);
    expect(result.contradictions[0].suggestedResolution).toBe('keep_existing');
  });

  it('Meridian/Amazon employment resolved with time context', () => {
    const existing = bundle({
      id: 'e1',
      claimText: 'I worked at Meridian Robotics on navigation',
      claimType: 'entity',
      sourceMessageId: 'msg-1',
    });
    const incoming = bundle({
      id: 'n1',
      claimText: 'I work at Amazon now',
      claimType: 'entity',
      sourceMessageId: 'msg-2',
    });

    const formerResult = detectContradictions({
      existingClaims: [
        { ...existing, claimText: 'I used to work at Meridian Robotics' },
      ],
      newClaim: incoming,
    });
    expect(formerResult.contradictions.filter((c) => c.contradictionType === 'employment').length).toBe(0);

    const overlapResult = detectContradictions({ existingClaims: [existing], newClaim: incoming });
    expect(overlapResult.contradictions.some((c) => c.contradictionType === 'employment')).toBe(true);
  });

  it('Alex/Stage Alias only possible duplicate with shared provenance', () => {
    const existing = bundle({
      id: 'e1',
      claimText: 'Alex Kim appeared at the venue',
      sourceMessageId: 'msg-1',
      sourceThreadId: 'thread-9',
    });
    const incomingNoShared = bundle({
      id: 'n1',
      claimText: 'Stage Alias is a performer',
      sourceMessageId: 'msg-2',
      sourceThreadId: 'thread-other',
    });
    expect(detectAliasPossibleDuplicate(existing, incomingNoShared)).toBeNull();

    const incomingShared = bundle({
      id: 'n2',
      claimText: 'Stage Alias is also called Alex Kim — same person',
      sourceMessageId: 'msg-3',
      sourceThreadId: 'thread-9',
      sourceQuote: 'Stage Alias (Alex Kim) at the venue',
    });
    const alias = detectAliasPossibleDuplicate(existing, incomingShared);
    expect(alias).not.toBeNull();
    expect(alias!.contradictionType).toBe('alias');
  });

  it('critical contradictions require review', () => {
    const existing = bundle({
      id: 'e1',
      claimText: 'Marcus Chen is me',
      claimType: 'identity',
    });
    const incoming = bundle({
      id: 'n1',
      claimText: 'Marcus Chen is my father',
      claimType: 'identity',
    });
    const result = detectContradictions({ existingClaims: [existing], newClaim: incoming });
    const queue = buildReviewQueue(result.contradictions);
    expect(queue.length).toBe(1);
    expect(queue[0].availableActions).toContain('split_entities');
    expect(requiresCriticalReview(result.contradictions[0])).toBe(true);
  });

  it('contradiction keeps both evidence bundles', () => {
    const existing = bundle({
      id: 'e1',
      claimText: 'Bryan is my best friend',
      claimType: 'relationship',
    });
    const incoming = bundle({
      id: 'n1',
      claimText: 'I barely knew Bryan',
      claimType: 'relationship',
    });
    const result = detectContradictions({ existingClaims: [existing], newClaim: incoming });
    const preserved = preserveBothClaims(existing, incoming);
    expect(result.contradictions[0].preserveBoth).toBe(true);
    expect(preserved.existing.truthState).toBe('contradicted');
    expect(preserved.incoming.truthState).toBe('review');
    expect(result.preservedClaims.some((c) => c.id === 'e1')).toBe(true);
  });
});
