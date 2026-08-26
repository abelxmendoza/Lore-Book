import { describe, expect, it, vi } from 'vitest';

import { getAnalyticsTier, groupAnalyticsService } from './groupAnalyticsService';
import { organizationService, type Organization } from './organizationService';

function org(overrides: Partial<Organization> = {}): Organization {
  return {
    id: 'org-1',
    user_id: 'user-1',
    name: 'Support Team',
    aliases: [],
    type: 'other',
    group_type: 'other',
    membership_model: 'strict',
    user_relationship: 'referenced',
    is_public_entity: false,
    status: 'active',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  } as Organization;
}

describe('groupAnalyticsService — relationship-depth gating, not raw mention count', () => {
  describe('getAnalyticsTier', () => {
    it('grants full analytics to relationships reflecting real, ongoing engagement', () => {
      expect(getAnalyticsTier('founder')).toBe('full');
      expect(getAnalyticsTier('member')).toBe('full');
      expect(getAnalyticsTier('employee')).toBe('full');
      expect(getAnalyticsTier('recruiter')).toBe('full');
      expect(getAnalyticsTier('student')).toBe('full');
    });

    it('grants historical analytics to past-tense relationships', () => {
      expect(getAnalyticsTier('former_member')).toBe('historical');
      expect(getAnalyticsTier('former_employee')).toBe('historical');
      expect(getAnalyticsTier('alumnus')).toBe('historical');
    });

    it('grants a lighter cultural-influence tier to arm\'s-length relationships', () => {
      expect(getAnalyticsTier('fan')).toBe('cultural');
      expect(getAnalyticsTier('customer')).toBe('cultural');
      expect(getAnalyticsTier('applicant')).toBe('cultural');
    });

    it('grants no analytics at all to merely-referenced organizations', () => {
      expect(getAnalyticsTier('referenced')).toBe('none');
      expect(getAnalyticsTier('aware_of')).toBe('none');
    });
  });

  it('a merely-referenced organization gets zero analytics regardless of how often it was mentioned', async () => {
    // This is the reviewer's exact hypothetical: "Support Team mentioned 10x
    // -> 80% confidence" would be wrong if importance were occurrence-based.
    // In practice, an org the user has only ever "referenced" never reaches
    // scoring at all — relationship depth gates eligibility before any
    // mention-count math runs.
    const referencedOrg = org({ user_relationship: 'referenced' });
    await expect(
      groupAnalyticsService.calculateAnalytics('user-1', referencedOrg.id, referencedOrg),
    ).rejects.toThrow(/No analytics for relationship tier/);
  });

  it('a former relationship returns a zeroed historical stub instead of a live score', async () => {
    const pastOrg = org({ user_relationship: 'former_employee' });
    const analytics = await groupAnalyticsService.calculateAnalytics('user-1', pastOrg.id, pastOrg);
    expect(analytics.importance_score).toBe(0);
    expect(analytics.recency_score).toBe(0);
  });

  describe('recursion guard — calculateAnalytics must never re-fetch its own organization', () => {
    // Regression test for a real production incident: calculateAnalytics's
    // 'full' and 'cultural' tiers each used to call two private helpers
    // (getGroupConversations, calculateUserInfluence) that independently
    // re-fetched the org via organizationService.getOrganization(userId, id).
    // organizationService.getOrganization is itself the CALLER of
    // calculateAnalytics, so that re-fetch re-entered calculateAnalytics,
    // which called the helpers again — infinite recursion, crashing the
    // process with a heap out-of-memory error even for a tiny 9-member org.
    // The fix threads the already-hydrated `organization` object through
    // instead of re-fetching it; this test asserts getOrganization is never
    // called from inside calculateAnalytics, for either tier that touches
    // those helpers.

    it('never calls organizationService.getOrganization while computing full analytics', async () => {
      const getOrgSpy = vi.spyOn(organizationService, 'getOrganization');
      const memberOrg = org({ user_relationship: 'member', members: [] as unknown as Organization['members'] });

      await groupAnalyticsService.calculateAnalytics('user-1', memberOrg.id, memberOrg);

      expect(getOrgSpy).not.toHaveBeenCalled();
      getOrgSpy.mockRestore();
    });

    it('never calls organizationService.getOrganization while computing cultural-tier analytics', async () => {
      const getOrgSpy = vi.spyOn(organizationService, 'getOrganization');
      const fanOrg = org({ user_relationship: 'fan' });

      await groupAnalyticsService.calculateAnalytics('user-1', fanOrg.id, fanOrg);

      expect(getOrgSpy).not.toHaveBeenCalled();
      getOrgSpy.mockRestore();
    });
  });
});
