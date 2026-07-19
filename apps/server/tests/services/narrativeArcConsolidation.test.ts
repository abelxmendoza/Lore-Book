/**
 * Narrative arc consolidation — clustering story events into life arc proposals.
 */
import { describe, expect, it } from 'vitest';

import {
  buildNarrativeChapterPlan,
  buildNarrativeChapterPlans,
  clusterStoryEvents,
  inferEmotionalArc,
  isEligibleStoryEvent,
  membershipRoleForEvent,
  proposeStoryArc,
  type StoryEventRecord,
} from '../../src/services/narrative/narrativeArcConsolidationBridge';

function storyEvent(
  id: string,
  start: string,
  overrides: Partial<StoryEventRecord['narrative']> = {},
  people: string[] = ['person-a'],
): StoryEventRecord {
  return {
    id,
    title: `Event ${id}`,
    summary: `Summary for ${id}`,
    start_time: start,
    people,
    locations: [],
    narrative: {
      detector: 'lexical',
      is_story_block: true,
      stages: [{ stage: 'SETUP', cue: 'it started', confidence: 0.8 }],
      ...overrides,
    },
  };
}

describe('narrativeArcConsolidationBridge', () => {
  it('isEligibleStoryEvent requires lexical detector and story signals', () => {
    expect(isEligibleStoryEvent(storyEvent('a', '2024-01-01'))).toBe(true);
    expect(
      isEligibleStoryEvent({
        ...storyEvent('b', '2024-01-01'),
        narrative: { detector: 'ai' },
      }),
    ).toBe(false);
    expect(
      isEligibleStoryEvent({
        ...storyEvent('c', '2024-01-01'),
        narrative: { detector: 'lexical', stages: [] },
      }),
    ).toBe(false);
  });

  it('clusters nearby events with shared people', () => {
    const events = [
      storyEvent('e1', '2024-03-01', { stages: [{ stage: 'SETUP', cue: 'start', confidence: 0.9 }] }),
      storyEvent('e2', '2024-03-10', { stages: [{ stage: 'CLIMAX', cue: 'then', confidence: 0.9 }] }),
    ];
    const clusters = clusterStoryEvents(events);
    expect(clusters).toHaveLength(1);
    expect(clusters[0].events).toHaveLength(2);
  });

  it('splits clusters when gap exceeds threshold', () => {
    const events = [
      storyEvent('e1', '2024-01-01', {
        stages: [{ stage: 'INCITING', cue: 'start', confidence: 0.9 }],
      }),
      storyEvent('e2', '2024-06-01', {
        stages: [{ stage: 'CLIMAX', cue: 'peak', confidence: 0.9 }],
      }),
    ];
    const clusters = clusterStoryEvents(events, 45);
    expect(clusters).toHaveLength(2);
  });

  it('does not cluster events with no shared entities when both have entities', () => {
    const events = [
      storyEvent('e1', '2024-03-01', {
        stages: [{ stage: 'INCITING', cue: 'start', confidence: 0.9 }],
      }, ['alice']),
      storyEvent('e2', '2024-03-05', {
        stages: [{ stage: 'CLIMAX', cue: 'peak', confidence: 0.9 }],
      }, ['bob']),
    ];
    const clusters = clusterStoryEvents(events);
    expect(clusters).toHaveLength(2);
  });

  it('discovers separate stories before generating a chapter thesis', () => {
    const sharedDay = '2026-06-03';
    const events: StoryEventRecord[] = [
      {
        ...storyEvent('build', `${sharedDay}T10:00:00Z`, {}, ['grandma-nell']),
        title: 'Building OrbitPad at Grandma Nell’s House',
        summary: 'Coded and tested the app from the kitchen table.',
        locations: ['nell-house'],
        activities: ['coding'],
      },
      {
        ...storyEvent('test', `${sharedDay}T14:00:00Z`, {}, ['grandma-nell']),
        title: 'Testing OrbitPad with an Alternate Account',
        summary: 'Verified the login flow and fixed the sync issue.',
        locations: ['nell-house'],
        activities: ['coding'],
      },
      {
        ...storyEvent('costco', `${sharedDay}T17:00:00Z`, {}, ['grandma-nell']),
        title: 'Costco with Grandma Nell',
        summary: 'Went shopping together before returning home.',
        locations: ['warehouse-store'],
        activities: ['shopping'],
      },
      {
        ...storyEvent('heartbreak', `${sharedDay}T19:00:00Z`, {}, ['quinn']),
        title: 'Quinn Blocked Me',
        summary: 'Recovering from the breakup and trying to move forward.',
        activities: ['relationship'],
      },
      {
        ...storyEvent('graduation', `${sharedDay}T08:00:00Z`, {}, []),
        title: 'Recently Graduated',
        summary: 'Graduated and currently looking for work.',
      },
    ];

    const clusters = clusterStoryEvents(events);
    const appCluster = clusters.find((cluster) => cluster.events.some((event) => event.id === 'build'));
    expect(appCluster?.events.map((event) => event.id)).toEqual(['build', 'test', 'costco']);
    expect(appCluster?.events.map((event) => event.id)).not.toContain('heartbreak');

    const chapter = buildNarrativeChapterPlan(appCluster!, events);
    expect(chapter.supportingEvents.map((event) => event.id)).toEqual(['build', 'test', 'costco']);
    expect(chapter.backgroundEvents.map((event) => event.id)).toEqual(
      expect.arrayContaining(['graduation', 'heartbreak']),
    );
    expect(chapter.contributions.find((item) => item.eventId === 'build')?.score).toBe(100);
    expect(chapter.contributions.find((item) => item.eventId === 'heartbreak')?.score).toBeLessThan(60);
  });

  it('reconsiders rejected bridge events as a separate chapter', () => {
    const events: StoryEventRecord[] = [
      {
        ...storyEvent('build', '2026-06-03T10:00:00Z', {
          stages: [{ stage: 'CLIMAX', cue: 'shipped', confidence: 0.95 }],
        }, ['grandma-nell']),
        title: 'Shipping OrbitPad at Grandma Nell’s House',
        summary: 'Finished the app release from the kitchen table.',
        locations: ['nell-house'],
        activities: ['coding'],
      },
      {
        ...storyEvent('costco', '2026-06-03T17:00:00Z', {}, ['grandma-nell', 'quinn']),
        title: 'Costco with Grandma Nell',
        summary: 'Went shopping together before returning home.',
        activities: ['shopping'],
      },
      {
        ...storyEvent('heartbreak', '2026-06-03T19:00:00Z', {}, ['quinn']),
        title: 'Relationship with Quinn Ended',
        summary: 'The breakup became final that evening.',
        activities: ['relationship'],
      },
    ];

    const cluster = clusterStoryEvents(events)[0];
    expect(cluster.events).toHaveLength(3);

    const chapters = buildNarrativeChapterPlans(cluster, events);
    expect(chapters).toHaveLength(2);
    expect(chapters[0].supportingEvents.map((event) => event.id)).toEqual(['build', 'costco']);
    expect(chapters[1].supportingEvents.map((event) => event.id)).toEqual(['heartbreak']);
  });

  it('proposeStoryArc derives emotional arc and confidence from stages', () => {
    const events = [
      storyEvent('e1', '2024-03-01', { stages: [{ stage: 'SETUP', cue: 'start', confidence: 0.9 }] }),
      storyEvent('e2', '2024-03-10', { stages: [{ stage: 'CLIMAX', cue: 'peak', confidence: 0.9 }] }),
    ];
    const cluster = clusterStoryEvents(events)[0];
    const proposal = proposeStoryArc(cluster);
    expect(proposal.emotional_arc).toBe('climax');
    expect(proposal.confidence).toBeGreaterThanOrEqual(0.65);
    expect(proposal.tags).toContain('narrative_consolidation');
  });

  it('inferEmotionalArc maps stages correctly', () => {
    expect(inferEmotionalArc(['CLIMAX'])).toBe('climax');
    expect(inferEmotionalArc(['REFLECTION'])).toBe('resolution');
    expect(inferEmotionalArc(['ESCALATION'])).toBe('building');
    expect(inferEmotionalArc(['SETUP'])).toBe('neutral');
  });

  it('membershipRoleForEvent prefers lexical arc role', () => {
    const event = storyEvent('e1', '2024-01-01', {
      primary_arc_membership_role: 'turning_point',
      stages: [{ stage: 'SETUP', cue: 'x', confidence: 0.8 }],
    });
    expect(membershipRoleForEvent(event)).toBe('turning_point');
  });

  it('keeps single-event cluster when it has inciting/climax stage', () => {
    const events = [
      storyEvent('solo', '2024-05-01', {
        stages: [{ stage: 'INCITING', cue: 'everything changed', confidence: 0.85 }],
      }),
    ];
    const clusters = clusterStoryEvents(events);
    expect(clusters).toHaveLength(1);
    expect(proposeStoryArc(clusters[0]).emotional_arc).toBe('building');
  });
});
