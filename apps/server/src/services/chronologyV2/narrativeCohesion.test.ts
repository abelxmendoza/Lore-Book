import { describe, it, expect } from 'vitest';
import {
  buildNarrativeAnchor,
  attachAnchorEntityNames,
  classifyCandidate,
  isBackgroundStatement,
  scoreCohesion,
  SCENE_THRESHOLD,
  type CohesionCandidate,
} from './narrativeCohesion';

// Fictional cast only (lore privacy): protagonist builds "OrbitPad" at
// Grandma Nell's house; ex "Quinn" belongs to a different narrative thread.
const NELL_ID = 'person-nell';
const NELL_HOUSE_ID = 'loc-nell-house';
const CODING_ID = 'act-coding';

const SEED = {
  title: "Building and Testing OrbitPad at Grandma Nell's House",
  summary: "Two-day sprint developing and testing the OrbitPad app at Grandma Nell's place.",
  tags: ['development'],
};

function ev(
  key: string,
  text: string,
  time: string,
  extra: Partial<CohesionCandidate> = {},
): CohesionCandidate {
  return { key, kind: 'event', text, time, ...extra };
}

function moment(key: string, text: string, time: string): CohesionCandidate {
  return { key, kind: 'moment', text, time };
}

const MEMBER_EVENTS: CohesionCandidate[] = [
  ev('event:build', "Building OrbitPad — long coding session at Grandma Nell's house", '2026-06-03T14:00:00Z', {
    peopleIds: [NELL_ID],
    locationIds: [NELL_HOUSE_ID],
    activityIds: [CODING_ID],
  }),
  ev('event:test', 'Testing OrbitPad with an alternate account', '2026-06-04T11:00:00Z', {
    locationIds: [NELL_HOUSE_ID],
    activityIds: [CODING_ID],
  }),
];

function buildAnchor(extraCandidates: CohesionCandidate[] = []) {
  const anchor = buildNarrativeAnchor(SEED, [...MEMBER_EVENTS, ...extraCandidates]);
  if (!anchor) throw new Error('expected anchor');
  attachAnchorEntityNames(anchor, ['Grandma Nell'], ["Grandma Nell's house"]);
  return anchor;
}

describe('buildNarrativeAnchor', () => {
  it('absorbs events matching the seed as members with their entities', () => {
    const anchor = buildAnchor();
    expect(anchor.memberKeys.has('event:build')).toBe(true);
    expect(anchor.memberKeys.has('event:test')).toBe(true);
    expect(anchor.peopleIds.has(NELL_ID)).toBe(true);
    expect(anchor.locationIds.has(NELL_HOUSE_ID)).toBe(true);
  });

  it('returns null when no candidate event matches the seed', () => {
    const anchor = buildNarrativeAnchor(SEED, [
      ev('event:x', 'Completely unrelated dentist appointment', '2026-06-03T09:00:00Z'),
    ]);
    expect(anchor).toBeNull();
  });

  it('returns null for an empty seed', () => {
    expect(buildNarrativeAnchor({ title: '' }, MEMBER_EVENTS)).toBeNull();
  });
});

describe('classifyCandidate — scene membership', () => {
  it('keeps anchor members in the scene', () => {
    const anchor = buildAnchor();
    for (const member of MEMBER_EVENTS) {
      expect(classifyCandidate(anchor, member).cls).toBe('scene');
    }
  });

  it('includes an errand with an anchor participant on the same afternoon', () => {
    const anchor = buildAnchor();
    const costcoLike = ev(
      'event:warehouse',
      'Warehouse store run with Grandma Nell',
      '2026-06-03T17:00:00Z',
      { peopleIds: [NELL_ID] },
    );
    const verdict = classifyCandidate(anchor, costcoLike);
    expect(verdict.cls).toBe('scene');
    expect(verdict.score).toBeGreaterThanOrEqual(SCENE_THRESHOLD);
  });

  it('includes a text-only moment that mentions the app and the house', () => {
    const anchor = buildAnchor();
    const verdict = classifyCandidate(
      anchor,
      moment('moment:debug', "Fixed the OrbitPad login bug from the couch at Grandma Nell's", '2026-06-03T20:00:00Z'),
    );
    expect(verdict.cls).toBe('scene');
  });

  it('rejects a same-week event from a different narrative thread', () => {
    const anchor = buildAnchor();
    const verdict = classifyCandidate(
      anchor,
      ev('event:blocked', 'Quinn blocked me on everything', '2026-06-03T21:00:00Z'),
    );
    expect(verdict.cls).toBe('excluded');
    expect(verdict.score).toBeLessThan(SCENE_THRESHOLD);
  });

  it('never stitches on temporal proximity alone', () => {
    const anchor = buildAnchor();
    // Same afternoon as a member, zero narrative overlap.
    const verdict = classifyCandidate(
      anchor,
      ev('event:random', 'Watched a documentary about deep sea fish', '2026-06-03T15:00:00Z'),
    );
    expect(verdict.cls).toBe('excluded');
    expect(verdict.breakdown.temporal).toBeGreaterThan(0);
  });

  it('honors user pinning regardless of score', () => {
    const anchor = buildAnchor();
    const verdict = classifyCandidate(
      anchor,
      ev('event:pinned', 'Quinn blocked me on everything', '2026-06-03T21:00:00Z'),
      { userPinned: true },
    );
    expect(verdict.cls).toBe('scene');
  });
});

describe('classifyCandidate — background context', () => {
  const anchor = () => buildAnchor();

  it.each([
    'Recently graduated with a CS degree',
    'Still unemployed and looking for work',
    'Living with six family members this summer',
    'Summer heartbreak — recovering from the breakup with Quinn',
    'Summer reflections on everything that changed',
  ])('routes persistent-state fact to background: %s', (text) => {
    const verdict = classifyCandidate(anchor(), moment('moment:bg', text, '2026-06-03T12:00:00Z'));
    expect(verdict.cls).toBe('background');
  });

  it('scene cohesion beats background phrasing', () => {
    // Mentions a background fact but is clearly inside the scene.
    const verdict = classifyCandidate(
      anchor(),
      moment(
        'moment:mixed',
        "Testing OrbitPad at Grandma Nell's house — funny doing this while unemployed",
        '2026-06-04T12:00:00Z',
      ),
    );
    expect(verdict.cls).toBe('scene');
  });
});

describe('isBackgroundStatement', () => {
  it('matches stative phrasing and not scene actions', () => {
    expect(isBackgroundStatement('Looking for a job while staying here')).toBe(true);
    expect(isBackgroundStatement('Debugged the sync layer and shipped a fix')).toBe(false);
  });
});

describe('scoreCohesion breakdown', () => {
  it('scores independent features, not a single similarity blob', () => {
    const anchor = buildAnchor();
    const breakdown = scoreCohesion(
      anchor,
      ev('event:warehouse', 'Warehouse store run with Grandma Nell', '2026-06-03T17:00:00Z', {
        peopleIds: [NELL_ID],
      }),
    );
    expect(breakdown.participants).toBeGreaterThan(0);
    expect(breakdown.temporal).toBeGreaterThan(0);
    expect(breakdown.total).toBe(
      Math.round(
        breakdown.participants + breakdown.location + breakdown.activity + breakdown.seed + breakdown.temporal,
      ),
    );
  });
});
