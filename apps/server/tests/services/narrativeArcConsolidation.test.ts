/**
 * Narrative arc consolidation — clustering story events into life arc proposals.
 */
import { describe, expect, it } from 'vitest';

import {
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
