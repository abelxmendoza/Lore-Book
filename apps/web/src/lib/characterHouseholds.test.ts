import { describe, it, expect } from 'vitest';
import type { Organization } from '../components/organizations/OrganizationProfileCard';
import {
  characterHouseholdRole,
  formatHouseholdRoleLabel,
  householdArrangementCopy,
  otherHouseholdPeople,
  splitOrganizationsByHousehold,
} from './characterHouseholds';

const org = (partial: Partial<Organization> & { character_role?: string }): Organization & { character_role?: string } =>
  ({
    id: partial.id ?? 'h1',
    name: partial.name ?? "Mom's House",
    aliases: [],
    type: 'other',
    group_type: partial.group_type ?? 'household',
    membership_model: 'strict',
    user_relationship: 'aware_of',
    is_public_entity: false,
    status: 'active',
    member_count: partial.members?.length ?? 0,
    usage_count: 1,
    confidence: 0.9,
    last_seen: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    members: partial.members ?? [],
    ...partial,
  }) as Organization & { character_role?: string };

describe('characterHouseholds', () => {
  it('splits households out of groups, including house names', () => {
    const crew = org({ id: 'c', name: 'Eastside Crew', group_type: 'crew' });
    const house = org({ id: 'h', name: "Dad's Apartment", group_type: 'household' });
    const named = org({ id: 'n', name: 'Northwind Household', group_type: 'community' });
    const { households, groups } = splitOrganizationsByHousehold([crew, house, named]);
    expect(households.map((item) => item.id)).toEqual(['h', 'n']);
    expect(groups.map((item) => item.id)).toEqual(['c']);
  });

  it('labels split-time and weekend stays', () => {
    expect(formatHouseholdRoleLabel('splits time')).toBe('Splits time');
    expect(formatHouseholdRoleLabel('weekends')).toBe('Weekends');
    expect(formatHouseholdRoleLabel('member')).toBe('Lives here');
    expect(formatHouseholdRoleLabel('former resident')).toBe('Used to live here');
  });

  it('explains two-home arrangements without collapsing them', () => {
    const mom = org({
      id: 'mom',
      name: "Mom's House",
      members: [{ id: '1', character_name: 'Theo Whitfield', role: 'lives here', status: 'active' }],
    });
    const step = org({
      id: 'step',
      name: 'Morgan Household',
      members: [{ id: '2', character_name: 'Theo Whitfield', role: 'weekends', status: 'active' }],
    });
    expect(householdArrangementCopy([mom, step], undefined, 'Theo Whitfield')).toMatch(/More than one home/i);
    expect(otherHouseholdPeople(mom, undefined, 'Theo Whitfield')).toHaveLength(0);
    expect(characterHouseholdRole(step, undefined, 'Theo Whitfield')).toBe('weekends');
  });

  it('treats You as the self row when matching household members', () => {
    const home = org({
      id: 'home',
      name: 'Morgan Household',
      members: [
        { id: '1', character_name: 'You', role: 'lives here', status: 'active' },
        { id: '2', character_name: 'Mia Morgan', role: 'lives here', status: 'active' },
      ],
    });
    expect(characterHouseholdRole(home, 'self-synthetic', 'Alex Rivera', true)).toBe('lives here');
    expect(otherHouseholdPeople(home, 'self-synthetic', 'Alex Rivera', true).map((m) => m.character_name)).toEqual([
      'Mia Morgan',
    ]);
  });
});
