import { describe, it, expect } from 'vitest';

import { dummyLocations } from '../components/locations/LocationBook';
import {
  getMockLocationFacts,
  getMockMemberAffiliations,
  getMockOrganizationRelationships,
  mergeQuestHistoryWithReflections,
  enrichOrganizationForDemo,
} from './modalDemoData';
import { MOCK_QUESTS } from './quests';
import type { Organization } from '../components/organizations/OrganizationProfileCard';

function testOrganization(overrides: Partial<Organization>): Organization {
  const now = new Date().toISOString();
  return {
    id: 'test-org',
    name: 'Test Org',
    aliases: [],
    type: 'other',
    group_type: 'other',
    membership_model: 'strict',
    user_relationship: 'member',
    is_public_entity: false,
    status: 'active',
    member_count: 0,
    usage_count: 0,
    confidence: 0.8,
    last_seen: now,
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

describe('modalDemoData', () => {
  it('builds location knowledge facts from profile fields', () => {
    const location = dummyLocations[0];
    const facts = getMockLocationFacts(location);
    expect(facts.length).toBeGreaterThan(0);
    expect(facts.some((f) => f.category === 'experience')).toBe(true);
  });

  it('merges quest history with demo reflections', () => {
    const quest = MOCK_QUESTS[0];
    const merged = mergeQuestHistoryWithReflections(quest, [
      {
        id: 'r1',
        quest_id: quest.id,
        event_type: 'reflection',
        notes: 'Felt good today',
        created_at: new Date().toISOString(),
      },
    ]);
    expect(merged.some((e) => e.event_type === 'reflection')).toBe(true);
    expect(merged.some((e) => e.event_type === 'created')).toBe(true);
  });

  it('builds organization relationships and member affiliations', () => {
    const orgA = testOrganization({
      id: 'mock-1',
      name: 'The Thursday Crew',
      type: 'other',
      group_type: 'crew',
      members: [{ id: 'm1', character_name: 'Marcus Johnson', status: 'active' }],
    });
    const orgB = testOrganization({
      id: 'mock-4',
      name: 'The Midnight Circuit',
      type: 'other',
      group_type: 'band',
      members: [{ id: 'm2', character_name: 'Marcus Johnson', status: 'active' }],
    });
    const allOrgs = [orgA, orgB];
    const { relationships, relatedOrgs } = getMockOrganizationRelationships(orgA, allOrgs);
    expect(relationships.length).toBeGreaterThan(0);
    expect(relatedOrgs).toHaveLength(1);
    const affiliations = getMockMemberAffiliations(orgA, allOrgs);
    expect(affiliations.m1?.some((a) => a.id === 'mock-4')).toBe(true);
  });

  it('enriches sparse demo organizations with profile and analytics', () => {
    const sparse: Organization = {
      id: 'mock-11',
      name: 'Novara Systems',
      aliases: [],
      type: 'company',
      group_type: 'company',
      membership_model: 'strict',
      user_relationship: 'member',
      is_public_entity: false,
      description: 'A growing tech company where you work on product.',
      status: 'active',
      member_count: 3,
      usage_count: 12,
      confidence: 0.82,
      last_seen: new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    const enriched = enrichOrganizationForDemo(sparse);
    expect(enriched.profile?.mission).toBeTruthy();
    expect(enriched.analytics?.importance_score).toBeGreaterThan(0);
    expect(enriched.metadata?.demo_enriched).toBe(true);
  });
});
