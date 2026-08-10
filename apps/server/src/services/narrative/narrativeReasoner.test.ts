import { describe, it, expect } from 'vitest';

import { detectCognitionQuestion, detectRecentChanges } from './narrativeReasoner';
import type { NarrativeCognitionContext } from './narrativeCognitionTypes';

function emptyContext(overrides: Partial<NarrativeCognitionContext> = {}): NarrativeCognitionContext {
  return {
    graph: {
      userId: 'user-1',
      entities: [],
      coMentionPairs: [],
      facts: [],
      relationships: [],
      organizations: [],
      events: [],
      recurringPatterns: [],
    },
    work: null,
    recencyByEntity: new Map(),
    firstSeenByEntity: new Map(),
    now: '2026-08-10T00:00:00.000Z',
    ...overrides,
  };
}

describe('detectCognitionQuestion — what_changed phrasing', () => {
  // Production bug: this exact message fell through to mode routing (which
  // matched "goals/priorities" to QUEST_QUERY and searched an empty Quests
  // table) because the old regex only matched "changed recently/lately".
  it('matches "plans, opinions, goals, or priorities ... changed over time ... before and after"', () => {
    const kind = detectCognitionQuestion(
      'What plans, opinions, goals, or priorities of mine have changed over time? Show me the before and after',
    );
    expect(kind).toBe('what_changed');
  });

  it.each([
    'what changed recently',
    'how have I changed',
    "how has my career evolved",
    'what is different in my life',
    'what changed about my goals over time',
  ])('still matches existing phrasing: %s', (text) => {
    expect(detectCognitionQuestion(text)).toBe('what_changed');
  });

  it('does not false-positive on an unrelated goals question', () => {
    expect(detectCognitionQuestion('What are my plans for this weekend?')).toBeNull();
  });
});

describe('detectCognitionQuestion — all 8 cognition kinds still route (post-gate-fix regression)', () => {
  // The gate fix in omegaChatService.ts (removing the `!workingMemoryPrimary`
  // condition) makes ALL of these reachable in production for the first time,
  // not just what_changed. One representative phrasing per kind, confirming
  // none of the existing regexes were accidentally touched.
  it.each([
    ['who matters most to me', 'who_matters'],
    ["who's becoming more important in my life", 'rising_people'],
    ['what era am I in', 'current_era'],
    ['what arcs am I in right now', 'active_arcs'],
    ['what changed recently', 'what_changed'],
    ['what has my attention lately', 'attention'],
    ["what's my life about right now", 'life_summary'],
    ['what am I struggling with', 'struggles'],
  ] as const)('%s -> %s', (text, expectedKind) => {
    expect(detectCognitionQuestion(text)).toBe(expectedKind);
  });
});

describe('detectRecentChanges — goals and priorities', () => {
  it('surfaces a completed goal within the change window', () => {
    const cctx = emptyContext({
      goals: [
        { id: 'g1', title: 'Ship LoreBook v1', status: 'COMPLETED', created_at: '2026-01-01', ended_at: '2026-07-01' },
      ],
    });
    const changes = detectRecentChanges(cctx, [], []);
    expect(changes).toEqual(
      expect.arrayContaining([expect.objectContaining({ kind: 'goal_completed', label: expect.stringContaining('Ship LoreBook v1') })]),
    );
  });

  it('surfaces an abandoned goal distinctly from a completed one', () => {
    const cctx = emptyContext({
      goals: [
        { id: 'g1', title: 'Learn guitar', status: 'ABANDONED', created_at: '2026-01-01', ended_at: '2026-07-01' },
      ],
    });
    const changes = detectRecentChanges(cctx, [], []);
    expect(changes[0]).toMatchObject({ kind: 'goal_abandoned' });
  });

  it('does not surface a goal that ended outside the change window', () => {
    const cctx = emptyContext({
      goals: [
        { id: 'g1', title: 'Old goal', status: 'COMPLETED', created_at: '2020-01-01', ended_at: '2020-02-01' },
      ],
    });
    const changes = detectRecentChanges(cctx, [], []);
    expect(changes.find((c) => c.kind === 'goal_completed')).toBeUndefined();
  });

  it('surfaces a priority shift with direction and before/after values', () => {
    const cctx = emptyContext({
      priorityShifts: [
        { valueName: 'Craftsmanship', oldPriority: 0.5, newPriority: 0.85, createdAt: '2026-07-01' },
      ],
    });
    const changes = detectRecentChanges(cctx, [], []);
    expect(changes[0]).toMatchObject({
      kind: 'priority_shift',
      label: expect.stringContaining('grew in importance'),
      detail: '0.50 → 0.85',
    });
  });

  it('reports a decreasing priority as "became less central", not "grew"', () => {
    const cctx = emptyContext({
      priorityShifts: [
        { valueName: 'Status', oldPriority: 0.8, newPriority: 0.3, createdAt: '2026-07-01' },
      ],
    });
    const changes = detectRecentChanges(cctx, [], []);
    expect(changes[0].label).toContain('became less central');
  });
});
