import { describe, it, expect } from 'vitest';
import { getMockOrganizationDerivedEvents } from './organizationTimeline';
import type { Organization } from '../components/organizations/OrganizationProfileCard';

function makeOrg(partial: Partial<Organization>): Organization {
  return {
    id: 'mock-9',
    name: 'Eastside BJJ',
    aliases: ['The gym'],
    type: 'martial_arts',
    group_type: 'martial_arts',
    membership_model: 'strict',
    user_relationship: 'member',
    is_public_entity: false,
    member_count: 3,
    usage_count: 10,
    confidence: 0.9,
    last_seen: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    status: 'active',
    members: [
      { id: 'm1', character_name: 'Coach Lima', role: 'Head instructor', status: 'active' },
      { id: 'm2', character_name: 'Andre', role: 'Training partner', status: 'active' },
      { id: 'm3', character_name: 'Tanya', role: 'Purple belt', status: 'active' },
    ],
    events: [
      { id: 'e1', title: 'Tuesday class', date: new Date().toISOString(), type: 'other' },
    ],
    stories: [],
    ...partial,
  } as Organization;
}

describe('getMockOrganizationDerivedEvents', () => {
  it('pads sparse martial-arts orgs into a fuller year of moments', () => {
    const events = getMockOrganizationDerivedEvents(makeOrg({}));
    expect(events.length).toBeGreaterThanOrEqual(12);
    expect(events.some((e) => /with you|Tuesday|stripe|open mat/i.test(e.title))).toBe(true);
    expect(events.some((e) => e.audience === 'with_user')).toBe(true);
    expect(events.some((e) => e.audience === 'without_user' || e.audience === 'group_wide')).toBe(
      true,
    );
    const dates = events.map((e) => (e.date ? new Date(e.date).getTime() : 0)).filter(Boolean);
    expect(Math.max(...dates) - Math.min(...dates)).toBeGreaterThan(1000 * 60 * 60 * 24 * 60);
  });
});
