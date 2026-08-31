import { describe, expect, it } from 'vitest';
import type { OrganizationQueryRequest } from '@lorebook/api-contracts';

import type { Organization } from '../organizationService';
import {
  compileOrganizationQuery,
  deriveOrganizationQueryHints,
  resolveOrganizationQueryStance,
} from './organizationQueryService';

const baseOrganization = (overrides: Partial<Organization>): Organization => ({
  id: crypto.randomUUID(),
  user_id: 'synthetic-user',
  name: 'Vanguard Robotics',
  aliases: [],
  type: 'company',
  group_type: 'company',
  membership_model: 'strict',
  user_relationship: 'member',
  is_public_entity: false,
  status: 'active',
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-02T00:00:00.000Z',
  members: [],
  stories: [],
  events: [],
  locations: [],
  ...overrides,
});

const request = (query: string): OrganizationQueryRequest => ({
  query,
  filters: {},
  sort: 'relevance',
  limit: 20,
  offset: 0,
  includeFacets: true,
});

describe('organizationQueryService', () => {
  it('uses the same four stance buckets as the Organizations Book', () => {
    expect(resolveOrganizationQueryStance(baseOrganization({ user_relationship: 'founder' }))).toBe('mine');
    expect(resolveOrganizationQueryStance(baseOrganization({ user_relationship: 'adjacent' }))).toBe('close_to');
    expect(resolveOrganizationQueryStance(baseOrganization({
      user_relationship: 'aware_of',
      members: [{ id: 'member-1', organization_id: 'org-1', character_id: 'char-1', character_name: 'Marcus', status: 'active' }],
    }))).toBe('their_world');
    expect(resolveOrganizationQueryStance(baseOrganization({ user_relationship: 'referenced', is_public_entity: true }))).toBe('mentioned');
    expect(resolveOrganizationQueryStance(baseOrganization({
      user_relationship: 'aware_of',
      metadata: { user_relationship_source: 'user_confirmed' },
      members: [],
    }))).toBe('their_world');
    expect(resolveOrganizationQueryStance(baseOrganization({
      user_relationship: 'referenced',
      metadata: { user_relationship_source: 'user_confirmed' },
      members: [{ id: 'member-2', organization_id: 'org-1', character_id: 'char-2', character_name: 'Jamie', status: 'active' }],
    }))).toBe('mentioned');
  });

  it('extracts membership, quality, and type hints from natural language', () => {
    expect(deriveOrganizationQueryHints('Which organizations is Marcus connected to?')).toMatchObject({
      intent: 'membership',
      memberNames: ['Marcus'],
    });
    expect(deriveOrganizationQueryHints('Show unlinked bands')).toMatchObject({
      intent: 'quality',
      groupTypes: ['band'],
      hasUnlinkedMembers: true,
    });
  });

  it('finds an organization through a roster member and explains why', () => {
    const organizations = [
      baseOrganization({
        id: '11111111-1111-4111-8111-111111111111',
        members: [{
          id: 'member-1',
          organization_id: '11111111-1111-4111-8111-111111111111',
          character_id: 'character-1',
          character_name: 'Marcus',
          status: 'active',
        }],
      }),
      baseOrganization({
        id: '22222222-2222-4222-8222-222222222222',
        name: 'MemoVault',
        user_relationship: 'referenced',
      }),
    ];

    const result = compileOrganizationQuery(
      organizations,
      request('Which organizations is Marcus connected to?'),
    );

    expect(result.total).toBe(1);
    expect(result.results[0]).toMatchObject({
      organizationId: '11111111-1111-4111-8111-111111111111',
      memberCount: 1,
      linkedMemberCount: 1,
    });
    expect(result.results[0].matchedReasons).toContain('Roster includes Marcus');
  });

  it('treats "which groups am I in" as the Mine stance', () => {
    const mine = baseOrganization({ id: '11111111-1111-4111-8111-111111111111' });
    const mentioned = baseOrganization({
      id: '22222222-2222-4222-8222-222222222222',
      name: 'MemoVault',
      user_relationship: 'referenced',
      is_public_entity: true,
    });
    const result = compileOrganizationQuery([mine, mentioned], request('Which groups am I in?'));
    expect(result.results.map((item) => item.organizationId)).toEqual([mine.id]);
    expect(result.appliedFilters.stances).toEqual(['mine']);
  });

  it('filters groups that have unresolved roster entries', () => {
    const org = baseOrganization({
      id: '11111111-1111-4111-8111-111111111111',
      group_type: 'band',
      members: [{
        id: 'member-1',
        organization_id: '11111111-1111-4111-8111-111111111111',
        character_name: 'Jamie',
        status: 'active',
      }],
    });
    const result = compileOrganizationQuery([org], request('Show unlinked bands'));
    expect(result.total).toBe(1);
    expect(result.results[0].unlinkedMemberCount).toBe(1);
    expect(result.facets.groupTypes).toEqual([{ value: 'band', count: 1 }]);
  });

  it('hides pending imported organizations while retaining confirmed ones', () => {
    const pending = baseOrganization({
      id: 'pending-org',
      name: 'Pending Employer',
      metadata: { review_required: true, review_state: 'pending' },
    });
    const confirmed = baseOrganization({
      id: 'confirmed-org',
      name: 'Confirmed Employer',
      metadata: { review_required: true, review_state: 'user_confirmed' },
    });
    const result = compileOrganizationQuery([pending, confirmed], request(''));

    expect(result.results.map((item) => item.organizationId)).toEqual(['confirmed-org']);
  });
});
