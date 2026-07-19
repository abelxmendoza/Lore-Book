import { describe, expect, it } from 'vitest';

import {
  deriveNarrativeThreads,
  formatThreadsPromptBlock,
  type ThreadActivityItem,
  type ThreadArcInput,
} from './narrativeThreadEngine';

const NOW = new Date('2026-07-19T12:00:00.000Z');

function daysAgo(n: number): string {
  return new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000).toISOString();
}

function arc(id: string, title: string, category: string, tags: string[] = []): ThreadArcInput {
  return { id, title, category, tags, summary: null, updatedAt: daysAgo(1), isActive: true };
}

function activity(
  text: string,
  at: string,
  participants: string[] = [],
  significance = 50,
): ThreadActivityItem {
  return { text, participants, at, significance };
}

/**
 * Three storylines: a project moving daily, a music scene gone quiet but with
 * a live conflict, and a friendship with moderate recent motion.
 */
const ARCS: ThreadArcInput[] = [
  arc('t-build', 'Building MemoVault', 'creative', ['memovault']),
  arc('t-scene', 'Harbor City ska scene', 'custom', ['ska']),
  arc('t-friend', 'Friendship with Devon', 'relationships', ['devon']),
];

const ACTIVITY: ThreadActivityItem[] = [
  activity('Shipped a new MemoVault retrieval feature', daysAgo(0), [], 60),
  activity('Worked on MemoVault chapter assembly', daysAgo(2), [], 55),
  activity('MemoVault schema migration applied', daysAgo(5), [], 50),
  // Ska scene: nothing recent except a conflict flare-up well past active window
  activity('Got blocked after accusations in the ska scene fallout', daysAgo(20), ['ren'], 70),
  // Friendship: one recent hangout
  activity('Caught up with Devon over coffee', daysAgo(10), ['devon'], 45),
];

describe('deriveNarrativeThreads', () => {
  it('derives status from real activity recency', () => {
    const threads = deriveNarrativeThreads({ arcs: ARCS, activity: ACTIVITY, now: NOW });
    const byId = Object.fromEntries(threads.map((t) => [t.id, t]));

    expect(byId['t-build'].status).toBe('active');
    expect(byId['t-build'].daysSinceActivity).toBe(0);
    expect(byId['t-build'].activityCount30d).toBe(3);

    expect(byId['t-scene'].status).toBe('cooling');
    expect(byId['t-friend'].status).toBe('cooling');
  });

  it('ranks the most alive thread first', () => {
    const threads = deriveNarrativeThreads({ arcs: ARCS, activity: ACTIVITY, now: NOW });
    expect(threads[0].id).toBe('t-build');
    expect(threads[0].priority).toBeGreaterThan(threads[2].priority);
  });

  it('keeps a conflict live on a quiet thread', () => {
    const threads = deriveNarrativeThreads({ arcs: ARCS, activity: ACTIVITY, now: NOW });
    const scene = threads.find((t) => t.id === 't-scene')!;
    expect(scene.conflictActive).toBe(true);
    expect(scene.people).toContain('ren');
  });

  it('marks arcs with no matching activity dormant', () => {
    const threads = deriveNarrativeThreads({
      arcs: [arc('t-idle', 'Learning woodworking', 'creative', ['woodworking'])],
      activity: ACTIVITY,
      now: NOW,
    });
    expect(threads[0].status).toBe('dormant');
    expect(threads[0].lastActivityAt).toBeNull();
    expect(threads[0].priority).toBe(0);
  });
});

describe('formatThreadsPromptBlock', () => {
  it('renders unfolding threads and hides conflict-free dormant ones', () => {
    const threads = deriveNarrativeThreads({
      arcs: [...ARCS, arc('t-idle', 'Learning woodworking', 'creative', ['woodworking'])],
      activity: ACTIVITY,
      now: NOW,
    });
    const block = formatThreadsPromptBlock(threads)!;

    expect(block).toContain('Building MemoVault');
    expect(block).toContain('ACTIVE — active today');
    expect(block).toContain('CONFLICT STILL LIVE');
    expect(block).not.toContain('woodworking');
    expect(block).toContain('answer from these threads');
  });

  it('keeps a dormant thread visible when its conflict is live', () => {
    const threads = deriveNarrativeThreads({
      arcs: [arc('t-scene', 'Harbor City ska scene', 'custom', ['ska'])],
      activity: [activity('Blocked after accusations in the ska scene', daysAgo(45), ['ren'], 70)],
      now: NOW,
    });
    expect(threads[0].status).toBe('dormant');
    expect(threads[0].conflictActive).toBe(true);
    const block = formatThreadsPromptBlock(threads)!;
    expect(block).toContain('Harbor City ska scene');
  });

  it('returns null when nothing is unfolding', () => {
    const threads = deriveNarrativeThreads({
      arcs: [arc('t-idle', 'Learning woodworking', 'creative', ['woodworking'])],
      activity: [],
      now: NOW,
    });
    expect(formatThreadsPromptBlock(threads)).toBeNull();
  });
});
