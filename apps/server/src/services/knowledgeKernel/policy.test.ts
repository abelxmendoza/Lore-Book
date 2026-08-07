import { describe, expect, it } from 'vitest';

import { buildReportedClaimPair, validateKnowledgeAssertion } from './policy';
import type { KnowledgeAssertionInput } from './types';

const baseAssertion: KnowledgeAssertionInput = {
  subject: { kind: 'person', id: 'person-1', label: 'Jamie' },
  predicate: 'works_on',
  objectValue: { label: 'MemoVault' },
  assertionClass: 'experience',
  domain: 'project',
  epistemicStance: 'user_belief',
  assertedBy: { kind: 'user' },
  derivationMethod: 'directly_stated',
};

describe('knowledge kernel policy', () => {
  it('rejects invalid certainty and temporal validity', () => {
    const result = validateKnowledgeAssertion({
      ...baseAssertion,
      certainty: 1.2,
      validFrom: '2026-08-10T00:00:00.000Z',
      validTo: '2026-08-01T00:00:00.000Z',
    });

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors).toContain('certainty must be between 0 and 1');
      expect(result.errors).toContain('validFrom cannot be after validTo');
    }
  });

  it('keeps LoreBook hypotheses in human review', () => {
    const result = validateKnowledgeAssertion({
      ...baseAssertion,
      epistemicStance: 'system_hypothesis',
      assertedBy: { kind: 'lorebook' },
      derivationMethod: 'inferred',
    });

    expect(result).toEqual({ valid: true, requiresHumanReview: true });
  });

  it('does not allow unconfirmed high-impact assertions to become active', () => {
    const result = validateKnowledgeAssertion({
      ...baseAssertion,
      sensitivity: 'high_impact',
      status: 'active',
    });

    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors).toContain(
        'high-impact assertions cannot become active without user confirmation',
      );
    }
  });

  it('allows the user to confirm a high-impact assertion explicitly', () => {
    const result = validateKnowledgeAssertion({
      ...baseAssertion,
      sensitivity: 'high_impact',
      status: 'active',
      derivationMethod: 'user_confirmed',
    });

    expect(result).toEqual({ valid: true, requiresHumanReview: false });
  });

  it('separates artifact-supported speech from the underlying reported claim', () => {
    const pair = buildReportedClaimPair({
      reporter: { kind: 'external_person', id: 'person-2', label: 'Morgan' },
      subject: { kind: 'person', id: 'person-1', label: 'Jamie' },
      predicate: 'left_community_event',
      objectValue: true,
      domain: 'community',
      evidenceKind: 'social_post',
      evidenceId: '00000000-0000-4000-8000-000000000001',
      sensitivity: 'high_impact',
    });

    expect(pair.sourceStatement.status).toBe('proposed');
    expect(pair.sourceStatement.metadata).toMatchObject({
      doesNotEstablishUnderlyingOccurrence: true,
    });
    expect(pair.underlyingClaim.status).toBe('proposed');
    expect(pair.underlyingClaim.certainty).toBeNull();
    expect(pair.sourceEvidence.relation).toBe('supports');
    expect(validateKnowledgeAssertion(pair.sourceStatement)).toEqual({
      valid: true,
      requiresHumanReview: true,
    });
  });
});
