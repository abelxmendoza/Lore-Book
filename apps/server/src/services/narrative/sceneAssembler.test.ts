import { describe, expect, it } from 'vitest';

import {
  assembleScenesFromMoments,
  deriveSceneTitle,
  linkMomentGraph,
  shouldMergeMoments,
  type SceneMomentInput,
} from './sceneAssembler';
import { mayPromoteSceneToEvent } from './sceneSignificance';
import { mayPromoteMomentToEvent } from './eventSignificance';

function moment(
  id: string,
  summary: string,
  opts: Partial<SceneMomentInput> = {},
): SceneMomentInput {
  const score = mayPromoteMomentToEvent({ text: summary }).score.total;
  return {
    id,
    summary,
    occurredAt: opts.occurredAt ?? '2026-07-18T14:00:00.000Z',
    participants: opts.participants,
    location: opts.location,
    significanceScore: opts.significanceScore ?? score,
    emotions: opts.emotions,
  };
}

describe('sceneAssembler', () => {
  it('merges a Costco / Abuela / home day into one scene', () => {
    const moments = [
      moment('m1', 'I drove to Costco.', { occurredAt: '2026-07-18T14:00:00.000Z' }),
      moment('m2', 'We bought groceries.', {
        occurredAt: '2026-07-18T14:40:00.000Z',
        location: 'Costco',
      }),
      moment('m3', 'Spent $550.', { occurredAt: '2026-07-18T15:00:00.000Z' }),
      moment('m4', 'Hung out with Abuela.', {
        occurredAt: '2026-07-18T16:00:00.000Z',
        participants: ['Abuela'],
      }),
      moment('m5', 'Came home.', { occurredAt: '2026-07-18T18:00:00.000Z', location: 'home' }),
    ];

    expect(shouldMergeMoments(moments[0], moments[1])).toBe(true);
    const scenes = assembleScenesFromMoments(moments);
    expect(scenes).toHaveLength(1);
    expect(scenes[0].momentIds).toHaveLength(5);
    expect(scenes[0].title.toLowerCase()).toMatch(/costco|abuela|visit|trip/);
  });

  it('splits when narrative jumps across eras', () => {
    const a = moment('a', 'I met Jamie at Northwind Depot.', {
      occurredAt: '2026-01-01T12:00:00.000Z',
      participants: ['Jamie'],
      location: 'Northwind Depot',
    });
    const b = moment('b', 'Years later I started onboarding at Vanguard Robotics.', {
      occurredAt: '2026-07-01T12:00:00.000Z',
      location: 'Vanguard Robotics',
    });
    expect(shouldMergeMoments(a, b)).toBe(false);
    expect(assembleScenesFromMoments([a, b])).toHaveLength(2);
  });

  it('links previous/next moment graph in order', () => {
    const moments = [
      moment('m1', 'Arrived at Northwind Depot.', { occurredAt: '2026-07-18T10:00:00.000Z' }),
      moment('m2', 'Met Jamie.', { occurredAt: '2026-07-18T10:30:00.000Z' }),
      moment('m3', 'Came home.', { occurredAt: '2026-07-18T12:00:00.000Z' }),
    ];
    const links = linkMomentGraph(moments);
    expect(links[0]).toMatchObject({ id: 'm1', previousMomentId: null, nextMomentId: 'm2' });
    expect(links[1]).toMatchObject({ id: 'm2', previousMomentId: 'm1', nextMomentId: 'm3' });
    expect(links[2]).toMatchObject({ id: 'm3', previousMomentId: 'm2', nextMomentId: null });
  });

  it('derives an evidence-first scene title', () => {
    const title = deriveSceneTitle({
      summaries: [
        'I drove to Costco.',
        'Hung out with Abuela.',
        'Came home and worked on MemoVault.',
      ],
      location: "Abuela's house",
      participants: ['abuela'],
    });
    expect(title.length).toBeGreaterThan(0);
    expect(title.toLowerCase()).not.toContain('captured conversation');
  });
});

describe('sceneSignificance', () => {
  it('promotes a combined low-score day that none of the moments alone would promote', () => {
    const moments = [
      moment('m1', 'I worked on MemoVault today.', { significanceScore: 18 }),
      moment('m2', 'Went to Costco.', { significanceScore: 20, location: 'Costco' }),
      moment('m3', 'Spent the afternoon with Abuela.', {
        significanceScore: 26,
        participants: ['Abuela'],
      }),
      moment('m4', 'Came home and kept building.', { significanceScore: 22, location: 'home' }),
    ];
    // Individually below threshold
    for (const m of moments) {
      expect(m.significanceScore!).toBeLessThan(45);
    }
    const [scene] = assembleScenesFromMoments(moments);
    const decision = mayPromoteSceneToEvent(scene);
    expect(decision.breakdown.synergy).toBeGreaterThan(0);
    expect(decision.allow).toBe(true);
    expect(decision.score).toBeGreaterThanOrEqual(45);
  });
});
