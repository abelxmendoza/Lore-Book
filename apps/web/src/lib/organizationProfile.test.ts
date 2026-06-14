import { describe, it, expect } from 'vitest';
import {
  deriveOrganizationProfile,
  isProfileEmpty,
  computeInfluenceScore,
} from './organizationProfile';

describe('organizationProfile', () => {
  describe('isProfileEmpty', () => {
    it('treats undefined / {} as empty', () => {
      expect(isProfileEmpty(undefined)).toBe(true);
      expect(isProfileEmpty(null)).toBe(true);
      expect(isProfileEmpty({})).toBe(true);
    });

    it('detects content in any section', () => {
      expect(isProfileEmpty({ values: ['Loyalty'] })).toBe(false);
      expect(isProfileEmpty({ purpose: 'x' })).toBe(false);
      expect(isProfileEmpty({ structure: { roles: [{ role: 'Lead' }] } })).toBe(false);
    });
  });

  describe('deriveOrganizationProfile', () => {
    it('produces a non-empty, type-appropriate profile for a family', () => {
      const p = deriveOrganizationProfile({
        name: 'Ashford-Luna Family',
        group_type: 'family',
        members: ['Aunt Maribel', 'Nico'],
      });
      expect(isProfileEmpty(p)).toBe(false);
      expect(p.values).toContain('Loyalty');
      expect(p.activities?.length).toBeGreaterThan(0);
      expect(p.structure?.roles?.length).toBeGreaterThan(0);
    });

    it('falls back to a generic profile for unknown/other types', () => {
      const p = deriveOrganizationProfile({ name: 'Mystery Crew', group_type: 'other' });
      expect(isProfileEmpty(p)).toBe(false);
      expect(p.purpose).toBeTruthy();
    });

    it('weaves the first members into roles for color', () => {
      const p = deriveOrganizationProfile({
        name: 'BrightHire',
        group_type: 'company',
        members: ['Dana', 'Reese'],
      });
      const blob = JSON.stringify(p.structure?.roles);
      expect(blob).toContain('Dana');
    });
  });

  describe('computeInfluenceScore', () => {
    it('prefers stored analytics influence', () => {
      expect(computeInfluenceScore({ analyticsInfluence: 73 })).toBe(73);
    });

    it('ranks a founder above a referenced contact', () => {
      const founder = computeInfluenceScore({ userRelationship: 'founder', memberCount: 5, usageCount: 10 });
      const referenced = computeInfluenceScore({ userRelationship: 'referenced', memberCount: 5, usageCount: 10 });
      expect(founder).toBeGreaterThan(referenced);
      expect(founder).toBeLessThanOrEqual(100);
      expect(referenced).toBeGreaterThanOrEqual(0);
    });
  });
});
