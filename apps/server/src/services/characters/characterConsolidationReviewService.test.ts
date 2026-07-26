import { describe, expect, it } from 'vitest';

import {
  buildDuplicateReviewGroups,
  consolidationPairKey,
  planConsolidationRepairs,
  scoreConsolidationPair,
} from './characterConsolidationReviewService';
import { consolidationPairKey as pairKeyFromEvidence } from './characterNameEvidence';
import { validateAliasCandidate } from './aliasProvenanceValidation';
import {
  classifyCharacterLabel,
  parseSpatialOrEventDescriptor,
} from './characterLabelSemantics';

describe('character label semantics', () => {
  it('classifies scene alias + given name', () => {
    const c = classifyCharacterLabel('DJ Night', {
      aliases: ['Alex'],
      nameProfile: { nickname: 'DJ Night', givenName: 'Alex', kind: 'stage_name' },
    });
    expect(c.labelClass).toBe('NAMED_PERSON_WITH_ALIAS');
  });

  it('classifies kinship display labels', () => {
    const c = classifyCharacterLabel('Uncle Alex');
    expect(c.labelClass).toBe('NAMED_PERSON');
    expect(c.kinshipRole).toBe('uncle');
    expect(c.coreName).toBe('alex');
  });

  it('parses possessive relational descriptors with place', () => {
    const c = classifyCharacterLabel("Maya's Friend from The Venue");
    expect(c.labelClass).toBe('RELATIONAL_PERSON_DESCRIPTOR');
    expect(c.relational?.anchor).toBe('Maya');
    expect(c.relational?.relation).toBe('friend');
    expect(c.associatedPlace).toBe('The Venue');
  });

  it('resolves spatial descriptor head as Noah, not Evan', () => {
    const spatial = parseSpatialOrEventDescriptor("Noah Next to Evan's Desk");
    expect(spatial?.head).toBe('Noah');
    expect(spatial?.referencedPerson).toBe('Evan');
    expect(spatial?.context).toMatch(/desk/i);

    const c = classifyCharacterLabel("Noah Next to Evan's Desk");
    expect(c.labelClass).toBe('SPATIAL_OR_EVENT_DESCRIPTOR');
    expect(c.headPerson).toBe('Noah');
    expect(c.referencedPeople).toContain('Evan');
  });
});

describe('alias provenance validation', () => {
  it('rejects discourse / malformed aliases like Also Nights', () => {
    expect(validateAliasCandidate('Also Nights').accepted).toBe(false);
    expect(validateAliasCandidate('Also Mentions').accepted).toBe(false);
    expect(validateAliasCandidate('DJ Night').accepted).toBe(true);
  });
});

describe('shared first name — distinct people', () => {
  const djNight = {
    id: 'dj-night',
    name: 'DJ Night',
    alias: ['Alex', 'Also Nights'],
    metadata: {
      nameProfile: { nickname: 'DJ Night', givenName: 'Alex', kind: 'stage_name' },
    },
  };
  const uncleAlex = {
    id: 'uncle-alex',
    name: 'Uncle Alex',
    alias: ['Alex'],
    metadata: {},
  };

  it('recommends KEEP_SEPARATE for DJ Night vs Uncle Alex', () => {
    const scored = scoreConsolidationPair(djNight, uncleAlex);
    expect(scored).not.toBeNull();
    expect(scored!.recommendation).toBe('keep_separate');
    expect(scored!.reasonCode).toBe('SHARED_GIVEN_NAME_DISTINCT_IDENTITIES');
    expect(scored!.identityLikelihood).toBeLessThan(0.5);
    expect(scored!.actions).toContain('keep_separate');
    expect(scored!.actions).toContain('mark_distinct_people');
  });

  it('does not surface the pair as a merge group by default', () => {
    const groups = buildDuplicateReviewGroups([djNight, uncleAlex]);
    const mergeLike = groups.filter((g) =>
      ['merge', 'needs_identity_review', 'review', 'resolve_head_character'].includes(
        g.recommendation,
      ),
    );
    expect(mergeLike).toHaveLength(0);
  });

  it('still allows alias evidence for the same person with a confirmed unique alias', () => {
    const alexander = {
      id: 'alexander',
      name: 'Alexander Night',
      alias: ['DJ Night'],
      metadata: {},
    };
    const scored = scoreConsolidationPair(
      { ...djNight, alias: ['DJ Night'] },
      alexander,
    );
    expect(scored).not.toBeNull();
    expect(['merge', 'needs_identity_review', 'link_alias']).toContain(scored!.recommendation);
    expect(scored!.reasonCode).not.toBe('SHARED_GIVEN_NAME_DISTINCT_IDENTITIES');
  });
});

describe('relational + spatial false positives', () => {
  it('does not merge Maya with Maya\'s Friend from The Venue', () => {
    const maya = { id: 'maya', name: 'Maya', alias: [], metadata: {} };
    const friend = {
      id: 'friend',
      name: "Maya's Friend from The Venue",
      alias: ['Maya'],
      metadata: {},
    };
    const scored = scoreConsolidationPair(maya, friend);
    expect(scored!.recommendation).toBe('convert_descriptor');
    expect(scored!.reasonCode).toBe('RELATIONAL_DESCRIPTOR_NOT_ALIAS');
    expect(scored!.actions).toContain('keep_separate');
  });

  it('does not merge Evan with Noah Next to Evan\'s Desk; resolves head as Noah', () => {
    const evan = { id: 'evan', name: 'Evan', alias: [], metadata: {} };
    const noahDesk = {
      id: 'noah-desk',
      name: "Noah Next to Evan's Desk",
      alias: [],
      metadata: {},
    };
    const scored = scoreConsolidationPair(evan, noahDesk);
    expect(scored!.recommendation).toBe('resolve_head_character');
    expect(scored!.reasonCode).toBe('SPATIAL_DESCRIPTOR_HEAD_MISMATCH');
    expect(scored!.explanation.some((e) => /head person is noah/i.test(e))).toBe(true);
  });
});

describe('pair-order invariance + dry-run planner', () => {
  it('uses the same pair key for A/B and B/A', () => {
    expect(consolidationPairKey('b', 'a')).toBe(consolidationPairKey('a', 'b'));
    expect(pairKeyFromEvidence('x', 'y')).toBe('x:y');
  });

  it('plans repairs without mutating records', () => {
    const plan = planConsolidationRepairs([
      {
        id: 'dj-night',
        name: 'DJ Night',
        alias: ['Alex', 'Also Nights'],
        metadata: {
          nameProfile: { nickname: 'DJ Night', givenName: 'Alex', kind: 'stage_name' },
        },
      },
      { id: 'uncle-alex', name: 'Uncle Alex', alias: ['Alex'], metadata: {} },
      { id: 'maya', name: 'Maya', alias: [], metadata: {} },
      {
        id: 'friend',
        name: "Maya's Friend from The Venue",
        alias: [],
        metadata: {},
      },
    ]);
    expect(plan.some((p) => p.reasonCode === 'SHARED_GIVEN_NAME_DISTINCT_IDENTITIES')).toBe(true);
    expect(plan.some((p) => p.reasonCode === 'RELATIONAL_DESCRIPTOR_NOT_ALIAS')).toBe(true);
    expect(
      plan.some((p) => p.proposedActions.some((a) => a.startsWith('remove_invalid_alias:'))),
    ).toBe(true);
  });

  it('honors confirmed_distinct_from and does not re-suggest', () => {
    const a = {
      id: 'a',
      name: 'Alex',
      alias: [],
      metadata: { confirmed_distinct_from: ['b'] },
    };
    const b = { id: 'b', name: 'Alex', alias: [], metadata: {} };
    expect(scoreConsolidationPair(a, b)).toBeNull();
    expect(buildDuplicateReviewGroups([a, b])).toHaveLength(0);
  });
});
