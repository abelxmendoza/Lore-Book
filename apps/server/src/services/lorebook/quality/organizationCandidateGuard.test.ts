import { describe, expect, it } from 'vitest';

import { guardOrganizationCandidate, isGenericOrganizationPhrase } from './organizationCandidateGuard';
import type { EntityQualityCandidate } from './entityQualityGuardTypes';

function candidate(overrides: Partial<EntityQualityCandidate> = {}): EntityQualityCandidate {
  return {
    name: 'Amazon Failure Analysis Team',
    domain: 'organizations',
    ...overrides,
  };
}

describe('organizationCandidateGuard', () => {
  it('rejects bare generic team/department descriptors', () => {
    expect(isGenericOrganizationPhrase('Support Team')).toBe(true);
    expect(isGenericOrganizationPhrase('Venture Capital Firm')).toBe(true);
    expect(isGenericOrganizationPhrase('Engineering Team')).toBe(true);
    expect(isGenericOrganizationPhrase('Failure Analysis')).toBe(true);
  });

  it('rejects narrative/descriptive spans, not names', () => {
    expect(isGenericOrganizationPhrase('Social workers visiting Tio Juan')).toBe(true);
  });

  it('accepts a real named organization, including a qualified team name', () => {
    expect(isGenericOrganizationPhrase('Amazon Failure Analysis Team')).toBe(false);
    expect(isGenericOrganizationPhrase('Rivian')).toBe(false);
    expect(isGenericOrganizationPhrase('University of Southern California')).toBe(false);
  });

  it('guardOrganizationCandidate rejects generic phrases for organizations/groups domains only', () => {
    const verdict = guardOrganizationCandidate(candidate({ name: 'Support Team' }));
    expect(verdict?.gate).toBe('reject');

    const groupsVerdict = guardOrganizationCandidate(candidate({ name: 'Support Team', domain: 'groups' }));
    expect(groupsVerdict?.gate).toBe('reject');

    // Not this guard's domain — no-op regardless of name.
    const locationsVerdict = guardOrganizationCandidate(candidate({ name: 'Support Team', domain: 'locations' }));
    expect(locationsVerdict).toBeNull();
  });

  it('guardOrganizationCandidate rejects fabricated test-placeholder names', () => {
    const verdict = guardOrganizationCandidate(candidate({ name: 'Zephyrine Corp' }));
    expect(verdict?.gate).toBe('reject');
    expect(verdict?.rejectionReason).toBe('fabricated_test_term');
  });

  it('guardOrganizationCandidate allows a real named organization', () => {
    expect(guardOrganizationCandidate(candidate({ name: 'Amazon Failure Analysis Team' }))).toBeNull();
  });
});
