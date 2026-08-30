import { describe, it, expect } from 'vitest';
import {
  resolveOrganizationStance,
  organizationMatchesStance,
  countOrganizationsByStance,
  getOrganizationTimelineVoice,
} from './organizationStance';
import type { Organization } from '../components/organizations/OrganizationProfileCard';

function org(partial: Partial<Organization>): Organization {
  return {
    id: partial.id ?? 'org-1',
    name: partial.name ?? 'Group',
    aliases: [],
    type: 'other',
    group_type: 'other',
    membership_model: 'strict',
    user_relationship: 'referenced',
    is_public_entity: false,
    status: 'active',
    member_count: 0,
    usage_count: 0,
    confidence: 1,
    last_seen: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...partial,
  } as Organization;
}

describe('organizationStance', () => {
  it('buckets membership roles as Mine', () => {
    expect(resolveOrganizationStance(org({ user_relationship: 'member' }))).toBe('mine');
    expect(resolveOrganizationStance(org({ user_relationship: 'founder' }))).toBe('mine');
    expect(resolveOrganizationStance(org({ user_relationship: 'alumnus' }))).toBe('mine');
  });

  it('buckets adjacent/collaborator as Close to', () => {
    expect(resolveOrganizationStance(org({ user_relationship: 'adjacent' }))).toBe('close_to');
    expect(resolveOrganizationStance(org({ user_relationship: 'collaborator' }))).toBe('close_to');
  });

  it('buckets linked Character Book roster (not mine) as Their world', () => {
    expect(
      resolveOrganizationStance(
        org({
          user_relationship: 'aware_of',
          members: [
            {
              id: 'm1',
              character_id: 'char-jamie',
              character_name: 'Jamie',
              status: 'active',
            },
          ],
        }),
      ),
    ).toBe('their_world');
  });

  it('honors a confirmed Their world / Mentioned correction over roster heuristics', () => {
    expect(
      resolveOrganizationStance(
        org({
          user_relationship: 'aware_of',
          metadata: { user_relationship_source: 'user_confirmed' },
          members: [],
        }),
      ),
    ).toBe('their_world');
    expect(
      resolveOrganizationStance(
        org({
          user_relationship: 'referenced',
          metadata: { user_relationship_source: 'user_confirmed' },
          members: [{ id: 'm1', character_id: 'char-jamie', character_name: 'Jamie', status: 'active' }],
        }),
      ),
    ).toBe('mentioned');
  });

  it('buckets empty/public references as Mentioned', () => {
    expect(
      resolveOrganizationStance(
        org({ user_relationship: 'referenced', is_public_entity: true, members: [] }),
      ),
    ).toBe('mentioned');
    expect(resolveOrganizationStance(org({ user_relationship: 'fan', members: [] }))).toBe(
      'mentioned',
    );
  });

  it('filters and counts by stance', () => {
    const list = [
      org({ id: 'a', user_relationship: 'member' }),
      org({ id: 'b', user_relationship: 'adjacent' }),
      org({
        id: 'c',
        user_relationship: 'aware_of',
        members: [{ id: 'm', character_id: 'c1', character_name: 'Marcus', status: 'active' }],
      }),
      org({ id: 'd', user_relationship: 'referenced', members: [] }),
    ];
    expect(list.filter((o) => organizationMatchesStance(o, 'mine'))).toHaveLength(1);
    expect(countOrganizationsByStance(list)).toEqual({
      all: 4,
      mine: 1,
      close_to: 1,
      their_world: 1,
      mentioned: 1,
    });
  });

  describe('getOrganizationTimelineVoice', () => {
    it('frames Mine groups as with you / without you', () => {
      const voice = getOrganizationTimelineVoice(
        org({ name: 'Northwind Crew', user_relationship: 'member' }),
      );
      expect(voice.stance).toBe('mine');
      expect(voice.withLabel).toBe('With you');
      expect(voice.withoutLabel).toBe('Without you');
      expect(voice.description).toMatch(/part of with Northwind Crew/i);
    });

    it('frames Their world with crossed paths / their world lanes', () => {
      const voice = getOrganizationTimelineVoice(
        org({
          name: 'Vanguard Robotics',
          user_relationship: 'aware_of',
          members: [
            { id: 'm1', character_id: 'c1', character_name: 'Gary', status: 'active' },
          ],
        }),
      );
      expect(voice.stance).toBe('their_world');
      expect(voice.withLabel).toBe('Crossed paths');
      expect(voice.withoutLabel).toBe('Their world');
      expect(voice.description).toMatch(/their world/i);
    });

    it('frames Mentioned as background lore', () => {
      const voice = getOrganizationTimelineVoice(
        org({ name: 'MemoVault', user_relationship: 'referenced', is_public_entity: true }),
      );
      expect(voice.stance).toBe('mentioned');
      expect(voice.withLabel).toBe('In your story');
      expect(voice.withoutLabel).toBe('Background');
    });
  });
});
