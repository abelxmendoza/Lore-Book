import { describe, it, expect } from 'vitest';

import { buildAnchorsFromContext } from '../../../src/services/narrative/anchorClusterBuilder';
import { narrativeAnchorResolver } from '../../../src/services/narrative/narrativeAnchorResolver';
import type { AnchorBuildContext, EntityGravityInput } from '../../../src/services/narrative/narrativeAnchorTypes';

const USER = 'user-test';

function entity(overrides: Partial<EntityGravityInput> & { entityId: string; name: string }): EntityGravityInput {
  return {
    entityType: 'character',
    mentionCount: 5,
    threadCount: 2,
    daysMentioned: 3,
    emotionalWeight: 0.5,
    eventParticipation: 0.4,
    relationshipStrength: 0.5,
    communityMembership: 0.3,
    narrativeImportance: 0.5,
    ...overrides,
  };
}

function pair(a: string, b: string, count = 3) {
  return { a, b, count };
}

describe('narrativeAnchor clustering', () => {
  it('Bryan cluster creates School Era anchor', () => {
    const ctx: AnchorBuildContext = {
      userId: USER,
      entities: [
        entity({
          entityId: 'bryan',
          name: 'Bryan Oconner',
          mentionCount: 20,
          roles: ['best_friend', 'bandmate', 'schoolmate'],
          facts: ['best friend from middle school', 'practiced in the band every Wednesday'],
        }),
        entity({
          entityId: 'school',
          name: 'Whittier Christian Middle School',
          entityType: 'location',
          facts: ['middle school'],
        }),
        entity({
          entityId: 'band',
          name: 'School Band',
          facts: ['band practice'],
        }),
      ],
      coMentionPairs: [pair('bryan', 'school'), pair('bryan', 'band'), pair('school', 'band')],
      facts: [
        { entityId: 'bryan', text: 'best friend from middle school at Whittier Christian Middle School' },
        { entityId: 'bryan', text: 'practiced in the band every Wednesday' },
        { entityId: 'school', text: 'Whittier Christian Middle School' },
      ],
      relationships: [{ sourceId: 'bryan', targetId: 'school', type: 'schoolmate' }],
      organizations: [
        { id: 'band-org', name: 'School Band', type: 'band', memberIds: ['bryan'] },
      ],
      events: [],
      recurringPatterns: [],
    };

    const anchors = buildAnchorsFromContext(ctx);
    const schoolEra = anchors.find((a) => a.anchorType === 'school_era');

    expect(schoolEra).toBeDefined();
    expect(schoolEra!.entities.some((e) => e.name.includes('Bryan'))).toBe(true);
    expect(
      schoolEra!.title.match(/school|middle school/i) || schoolEra!.evidence.some((e) => /school|middle/i.test(e.label)),
    ).toBeTruthy();
  });

  it('Vanguard cluster creates Work Era anchor', () => {
    const ctx: AnchorBuildContext = {
      userId: USER,
      entities: [
        entity({ entityId: 'gary', name: 'Gary', facts: ['Vanguard Robotics coworker'] }),
        entity({ entityId: 'jeff', name: 'Jeff', facts: ['robot support at Vanguard'] }),
        entity({ entityId: 'dennys', name: "Denny's", entityType: 'location' }),
        entity({ entityId: 'aruco', name: 'ArUco', facts: ['gripper swaps'] }),
      ],
      coMentionPairs: [pair('gary', 'jeff'), pair('gary', 'dennys'), pair('jeff', 'aruco')],
      facts: [
        { entityId: 'gary', text: 'worked at Vanguard Robotics' },
        { entityId: 'jeff', text: 'daily robotics work at Vanguard' },
      ],
      relationships: [],
      organizations: [
        { id: 'vanguard', name: 'Vanguard Robotics', type: 'work', memberIds: ['gary', 'jeff'] },
      ],
      events: [],
      recurringPatterns: [],
    };

    const anchors = buildAnchorsFromContext(ctx);
    const workEra = anchors.find((a) => a.anchorType === 'work_era' && a.title === 'Vanguard Robotics Chapter');

    expect(workEra).toBeDefined();
    expect(workEra!.entities.length + workEra!.groups.length).toBeGreaterThanOrEqual(2);
    expect(workEra!.title).toBe('Vanguard Robotics Chapter');
    expect(workEra!.groups.map((group) => group.name)).toContain('Vanguard Robotics');
    expect(new Set(workEra!.evidence.map((item) => item.label.toLowerCase())).size).toBe(workEra!.evidence.length);
  });

  it('does not call repeated copies of one keyword a strong match', () => {
    const ctx: AnchorBuildContext = {
      userId: USER,
      entities: [
        entity({ entityId: 'a', name: 'Alex', facts: ['job job job job'] }),
        entity({ entityId: 'b', name: 'Blair' }),
      ],
      coMentionPairs: [pair('a', 'b')],
      facts: [{ entityId: 'a', text: 'job job job job' }],
      relationships: [],
      organizations: [],
      events: [],
      recurringPatterns: [],
    };

    const workEra = buildAnchorsFromContext(ctx).find((anchor) => anchor.anchorType === 'work_era');

    expect(workEra).toBeUndefined();
  });

  it('Sol cluster creates Relationship Arc', () => {
    const ctx: AnchorBuildContext = {
      userId: USER,
      entities: [
        entity({
          entityId: 'sol',
          name: 'Sol',
          facts: ['met at show', 'dating', 'ghosting', 'blocking', 'reappearance'],
        }),
        entity({ entityId: 'user', name: 'Me' }),
      ],
      coMentionPairs: [pair('sol', 'user', 5)],
      facts: [
        { entityId: 'sol', text: 'Met Sol at a show' },
        { entityId: 'sol', text: 'started dating Sol' },
        { entityId: 'sol', text: 'distancing and ghosting from Sol' },
        { entityId: 'sol', text: 'blocking Sol then reappearance' },
      ],
      relationships: [{
        sourceId: 'sol',
        targetId: 'user',
        type: 'dating',
        directEvidence: true,
        evidence: [
          { id: 'sol-1', label: 'Sol and I started dating', source: 'relationship', sourceRef: 'memory-1', confidence: 0.9 },
          { id: 'sol-2', label: 'Sol and I drifted apart after ghosting', source: 'relationship', sourceRef: 'memory-2', confidence: 0.9 },
        ],
      }],
      organizations: [],
      events: [],
      recurringPatterns: [],
    };

    const anchors = buildAnchorsFromContext(ctx);
    const relArc = anchors.find((a) => a.anchorType === 'relationship_arc');

    expect(relArc).toBeDefined();
    expect(relArc!.entities.some((e) => e.name === 'Sol')).toBe(true);
    expect(relArc!.evidence.some((e) => /dating|ghosting|met/i.test(e.label))).toBe(true);
  });

  it('a significant party remains a pivotal event, not a life era', () => {
    const ctx: AnchorBuildContext = {
      userId: USER,
      entities: [
        entity({ entityId: 'leslie', name: 'Leslie' }),
        entity({ entityId: 'ralph', name: 'Tio Ralph' }),
      ],
      coMentionPairs: [pair('leslie', 'ralph', 2)],
      facts: [],
      relationships: [],
      organizations: [],
      events: [
        {
          id: 'ev-grad',
          title: 'Leslie Graduation Party',
          entityIds: ['leslie', 'ralph'],
          significanceScore: 80,
          significanceLevel: 'major',
          evidence: [{ id: 'party-source', label: 'Leslie and Ralph celebrated graduation together.', source: 'event', sourceRef: 'entry-1', confidence: 0.9 }],
        },
      ],
      recurringPatterns: [],
    };

    const anchors = buildAnchorsFromContext(ctx);
    const family = anchors.find((a) => a.anchorType === 'pivotal_event');

    expect(family).toBeDefined();
    expect(family!.entities.some((e) => e.name.includes('Leslie'))).toBe(true);
    expect(anchors.some((anchor) => anchor.anchorType === 'life_era')).toBe(false);
  });

  it('does not turn an unsupported relationship row into an arc', () => {
    const ctx: AnchorBuildContext = {
      userId: USER,
      entities: [entity({ entityId: 'a', name: 'Alex' }), entity({ entityId: 'b', name: 'Blair' })],
      coMentionPairs: [pair('a', 'b', 10)],
      facts: [{ entityId: 'a', text: 'Alex attended a party' }],
      relationships: [{ sourceId: 'a', targetId: 'b', type: 'romantic' }],
      organizations: [], events: [], recurringPatterns: [],
    };
    expect(buildAnchorsFromContext(ctx).some((anchor) => anchor.anchorType === 'relationship_arc')).toBe(false);
  });

  it('does not infer an era from co-occurrence alone', () => {
    const ctx: AnchorBuildContext = {
      userId: USER,
      entities: [entity({ entityId: 'a', name: 'Alex' }), entity({ entityId: 'b', name: 'Blair' })],
      coMentionPairs: [pair('a', 'b', 20)], facts: [], relationships: [], organizations: [], events: [], recurringPatterns: [],
    };
    expect(buildAnchorsFromContext(ctx)).toEqual([]);
  });

  it('repeated Wednesday practice creates Recurring Activity Anchor', () => {
    const ctx: AnchorBuildContext = {
      userId: USER,
      entities: [
        entity({ entityId: 'bryan', name: 'Bryan Oconner' }),
        entity({ entityId: 'band', name: 'School Band' }),
      ],
      coMentionPairs: [pair('bryan', 'band')],
      facts: [{ entityId: 'bryan', text: 'practiced in the band every Wednesday' }],
      relationships: [],
      organizations: [],
      events: [],
      recurringPatterns: [],
    };

    const anchors = buildAnchorsFromContext(ctx);
    const recurring = anchors.find((a) => a.anchorType === 'recurring_activity');

    expect(recurring).toBeDefined();
    expect(recurring!.title).toMatch(/wednesday|practice|band/i);
  });

  it('unrelated entities do not cluster', () => {
    const ctx: AnchorBuildContext = {
      userId: USER,
      entities: [
        entity({ entityId: 'a', name: 'Alice' }),
        entity({ entityId: 'z', name: 'Zebra Farm' }),
      ],
      coMentionPairs: [],
      facts: [],
      relationships: [],
      organizations: [],
      events: [],
      recurringPatterns: [],
    };

    const anchors = buildAnchorsFromContext(ctx);
    const multiEntity = anchors.filter((a) => a.entities.length >= 2 && a.anchorType !== 'recurring_activity');

    expect(multiEntity.length).toBe(0);
  });

  it('entities can belong to multiple anchors', () => {
    const ctx: AnchorBuildContext = {
      userId: USER,
      entities: [
        entity({
          entityId: 'bryan',
          name: 'Bryan',
          facts: ['middle school band', 'best friend'],
        }),
        entity({ entityId: 'band', name: 'School Band', facts: ['every Wednesday'] }),
        entity({ entityId: 'school', name: 'Whittier Christian Middle School', entityType: 'location' }),
      ],
      coMentionPairs: [pair('bryan', 'band'), pair('bryan', 'school'), pair('band', 'school')],
      facts: [
        { entityId: 'bryan', text: 'best friend from middle school' },
        { entityId: 'bryan', text: 'practiced in the band every Wednesday' },
      ],
      relationships: [{ sourceId: 'bryan', targetId: 'school', type: 'schoolmate' }],
      organizations: [{ id: 'band-org', name: 'School Band', type: 'band', memberIds: ['bryan'] }],
      events: [],
      recurringPatterns: [],
    };

    const anchors = buildAnchorsFromContext(ctx);
    const withBryan = anchors.filter((a) => a.entities.some((e) => e.id === 'bryan'));

    expect(withBryan.length).toBeGreaterThanOrEqual(2);
  });

  it('retrieval uses anchor context', () => {
    const ctx: AnchorBuildContext = {
      userId: USER,
      entities: [
        entity({
          entityId: 'bryan',
          name: 'Bryan Oconner',
          mentionCount: 20,
          roles: ['best_friend', 'bandmate'],
          facts: ['middle school', 'band every Wednesday'],
        }),
        entity({ entityId: 'school', name: 'Whittier Christian Middle School', entityType: 'location' }),
        entity({ entityId: 'band', name: 'School Band' }),
      ],
      coMentionPairs: [pair('bryan', 'school'), pair('bryan', 'band'), pair('school', 'band')],
      facts: [
        { entityId: 'bryan', text: 'best friend from middle school' },
        { entityId: 'bryan', text: 'practiced in the band every Wednesday' },
      ],
      relationships: [],
      organizations: [],
      events: [],
      recurringPatterns: [],
    };

    const bryan = ctx.entities[0];
    const chain = narrativeAnchorResolver.resolveForEntityInContext(bryan, ctx);
    const text = narrativeAnchorResolver.formatRetrievalContext(chain);

    expect(chain.anchors.length).toBeGreaterThan(0);
    expect(text).toContain('Bryan');
    expect(text).toMatch(/school|band|middle/i);
  });
});
