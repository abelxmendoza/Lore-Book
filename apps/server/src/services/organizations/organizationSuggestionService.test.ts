import { describe, expect, it } from 'vitest';

import { mapGroupType, resolveMatch } from './organizationSuggestionService';

describe('organizationSuggestionService', () => {
  describe('mapGroupType', () => {
    it('maps employer-shaped types to company', () => {
      expect(mapGroupType('employer')).toBe('company');
      expect(mapGroupType('company')).toBe('company');
      expect(mapGroupType('startup')).toBe('company');
      expect(mapGroupType('agency')).toBe('company');
      expect(mapGroupType('investor')).toBe('company');
      expect(mapGroupType('client')).toBe('company');
    });

    it('maps school-shaped types to institution', () => {
      expect(mapGroupType('school')).toBe('institution');
      expect(mapGroupType('university')).toBe('institution');
      expect(mapGroupType('bootcamp')).toBe('institution');
      expect(mapGroupType('program')).toBe('institution');
    });

    it('maps platform/vendor to vendor', () => {
      expect(mapGroupType('platform')).toBe('vendor');
      expect(mapGroupType('vendor')).toBe('vendor');
    });

    it('maps community_org to community instead of collapsing to other', () => {
      expect(mapGroupType('community_org')).toBe('community');
    });

    it('maps software to software instead of collapsing to company', () => {
      expect(mapGroupType('software')).toBe('software');
    });
  });

  describe('resolveMatch', () => {
    it('resolves an exact name to an existing match', () => {
      const existing = [{ id: 'org-1', name: 'Rivian' }];
      expect(resolveMatch('Rivian', existing).match_status).toBe('existing');
    });

    it('resolves a bare acronym against a known full institution name as similar', () => {
      const existing = [{ id: 'org-1', name: 'University of Southern California' }];
      const match = resolveMatch('USC', existing);
      expect(match.match_status).toBe('similar');
      expect(match.matched_organization_id).toBe('org-1');
    });

    it('resolves a full institution name against a known acronym as similar', () => {
      const existing = [{ id: 'org-1', name: 'USC' }];
      const match = resolveMatch('University of Southern California', existing);
      expect(match.match_status).toBe('similar');
      expect(match.matched_organization_id).toBe('org-1');
    });

    it('treats an unrelated new organization as new', () => {
      const existing = [{ id: 'org-1', name: 'University of Southern California' }];
      expect(resolveMatch('Rivian', existing).match_status).toBe('new');
    });
  });
});
