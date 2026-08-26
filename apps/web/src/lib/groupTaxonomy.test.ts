import { describe, expect, it } from 'vitest';

import {
  computeChildHouseholds,
  inferHouseholdFamilyPartOfLinks,
  isFamilyGroup,
  isHouseholdGroup,
} from './groupTaxonomy';
import type { Organization } from '../components/organizations/OrganizationProfileCard';

function org(partial: Partial<Organization> & Pick<Organization, 'id' | 'name'>): Organization {
  return {
    user_id: 'demo',
    group_type: 'community',
    usage_count: 1,
    created_at: '',
    updated_at: '',
    ...partial,
  } as Organization;
}

describe('groupTaxonomy household/family links', () => {
  it('treats names ending in Family as family groups', () => {
    expect(isFamilyGroup(org({ id: 'f', name: "Jamie's Family", group_type: 'community' }))).toBe(true);
  });

  it('treats House names as households without matching warehouses', () => {
    expect(isHouseholdGroup(org({ id: 'h', name: "Jamie's House", group_type: 'community' }))).toBe(true);
    expect(isHouseholdGroup(org({ id: 'w', name: 'Northwind Warehouse', group_type: 'community' }))).toBe(false);
  });

  it('pairs a possessive household with the matching family, not every family', () => {
    const family = org({ id: 'family-jamie', name: "Jamie's Family", group_type: 'family' });
    const otherFamily = org({ id: 'family-other', name: 'The Whitmore-Chen Family', group_type: 'family' });
    const household = org({ id: 'house-jamie', name: "Jamie's Household", group_type: 'household' });
    const otherHouse = org({ id: 'house-nana', name: "Nana Elena's Household", group_type: 'household' });

    expect(computeChildHouseholds(family, [household, otherHouse, otherFamily]).map((o) => o.id)).toEqual([
      'house-jamie',
    ]);
    expect(inferHouseholdFamilyPartOfLinks(family, [household, otherHouse, otherFamily])).toEqual([
      { fromId: 'house-jamie', toId: 'family-jamie' },
    ]);
  });

  it('nests households already linked by parent_group_id', () => {
    const family = org({ id: 'family-1', name: 'The Whitmore-Chen Family', group_type: 'family' });
    const household = org({
      id: 'house-1',
      name: "Nana Elena's Household",
      group_type: 'household',
      parent_group_id: 'family-1',
    });
    expect(inferHouseholdFamilyPartOfLinks(family, [household])).toEqual([
      { fromId: 'house-1', toId: 'family-1' },
    ]);
  });
});
