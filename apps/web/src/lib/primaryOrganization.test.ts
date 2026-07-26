import { describe, expect, it } from 'vitest';
import { pickPrimaryOrganization, withPrimaryOrganizations } from './primaryOrganization';

describe('primaryOrganization', () => {
  const orgs = [
    {
      id: 'org-work',
      name: 'Vanguard Robotics',
      group_type: 'company',
      usage_count: 2,
      members: [{ character_id: 'c1', character_name: 'Marcus', role: 'member', status: 'active' }],
    },
    {
      id: 'org-home',
      name: 'Whittier Hometown Family Household',
      group_type: 'family',
      usage_count: 8,
      members: [
        { character_id: 'c2', character_name: 'Ben Lopez', role: 'head_of_household', status: 'active' },
        { character_id: 'c1', character_name: 'Marcus', role: 'former_member', status: 'former' },
      ],
    },
  ];

  it('picks the strongest active affiliation', () => {
    const primary = pickPrimaryOrganization({ id: 'c2', name: 'Ben Lopez' }, orgs);
    expect(primary?.name).toBe('Whittier Hometown Family Household');
    expect(primary?.role).toBe('head_of_household');
  });

  it('prefers company over former household membership', () => {
    const primary = pickPrimaryOrganization({ id: 'c1', name: 'Marcus' }, orgs);
    expect(primary?.name).toBe('Vanguard Robotics');
  });

  it('honors metadata primary_organization_id', () => {
    const primary = pickPrimaryOrganization(
      {
        id: 'c1',
        name: 'Marcus',
        metadata: { primary_organization_id: 'org-home' },
      },
      orgs,
    );
    expect(primary?.id).toBe('org-home');
  });

  it('enriches a character list in place', () => {
    const enriched = withPrimaryOrganizations([{ id: 'c2', name: 'Ben Lopez' }], orgs);
    expect(enriched[0].primary_organization?.name).toBe('Whittier Hometown Family Household');
  });
});
