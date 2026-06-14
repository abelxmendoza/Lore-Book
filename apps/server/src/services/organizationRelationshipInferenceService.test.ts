import { describe, it, expect } from 'vitest';
import { OrganizationRelationshipInferenceService } from './organizationRelationshipInferenceService';
import type { Organization } from './organizationService';

const svc = new OrganizationRelationshipInferenceService();

const org = (id: string, name: string, group_type?: Organization['group_type']): Organization => ({
  id,
  user_id: 'u1',
  name,
  aliases: [],
  type: 'other',
  group_type: group_type ?? 'other',
  membership_model: 'strict',
  status: 'active',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
});

describe('OrganizationRelationshipInferenceService', () => {
  it('infers part_of from chat text', () => {
    const orgs = [
      org('1', "Tia Grace's Household", 'family'),
      org('2', 'My Family', 'family'),
    ];
    const links = svc.inferLinksFromText('u1', "Tia Grace's Household is part of My Family", orgs);
    expect(links.some(l => l.fromOrgId === '1' && l.toOrgId === '2' && l.relationshipType === 'part_of')).toBe(true);
  });

  it('infers part_of from name nesting', () => {
    const orgs = [
      org('1', 'Los Goths Inner Circle', 'crew'),
      org('2', 'Los Goths', 'scene'),
    ];
    const links = svc.inferLinksFromNameNesting(orgs);
    expect(links.some(l => l.fromOrgId === '1' && l.toOrgId === '2')).toBe(true);
  });

  it('infers affiliated_with for scene suffix', () => {
    const orgs = [
      org('1', 'Los Goths Scene', 'scene'),
      org('2', 'Los Goths', 'community'),
    ];
    const links = svc.inferLinksFromNameNesting(orgs);
    expect(links.some(l => l.relationshipType === 'affiliated_with')).toBe(true);
  });

  it('links family households to My Family', () => {
    const orgs = [
      org('1', "Tía Grace's Household", 'family'),
      org('2', 'My Family', 'family'),
    ];
    const links = svc.inferFamilyHouseholdLinks(orgs);
    expect(links.some(l => l.fromOrgId === '1' && l.toOrgId === '2' && l.relationshipType === 'part_of')).toBe(true);
  });
});
