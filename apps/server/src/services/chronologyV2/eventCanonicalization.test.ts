import { describe, it, expect } from 'vitest';
import {
  clusterDuplicateEvents,
  fingerprintSimilarity,
  findBestDuplicate,
  buildMergeLog,
  MERGE_THRESHOLD,
  type CanonicalizableEvent,
} from './eventCanonicalization';

// Fictional cast only (lore privacy): OrbitPad app, Grandma Nell, ex "Quinn".
const NELL_ID = 'person-nell';
const HOUSE_ID = 'loc-nell-house';

function ev(
  id: string,
  title: string,
  summary: string,
  time: string,
  extra: Partial<CanonicalizableEvent> = {},
): CanonicalizableEvent {
  return { id, title, summary, time, ...extra };
}

// Four AI summaries of the same afternoon — the duplication pattern from the
// bug report: same evidence, different generated wording.
const DUPLICATES: CanonicalizableEvent[] = [
  ev(
    'e-b',
    "Testing OrbitPad at Grandma Nell's House",
    "Spent the day testing the OrbitPad app at Grandma Nell's house.",
    '2026-06-03T14:00:00Z',
    { peopleIds: [NELL_ID], locationIds: [HOUSE_ID] },
  ),
  ev(
    'e-a',
    "Building OrbitPad at Grandma Nell's House",
    "Worked on building the OrbitPad app at Grandma Nell's house.",
    '2026-06-03T15:00:00Z',
    { peopleIds: [NELL_ID], locationIds: [HOUSE_ID] },
  ),
  ev(
    'e-c',
    'Testing App and Upcoming Interview',
    'Testing the OrbitPad app and scheduling an upcoming interview.',
    '2026-06-03T16:00:00Z',
  ),
  ev(
    'e-d',
    'Rey Solano Testing App and Upcoming Interview',
    'Rey testing the OrbitPad app and preparing for an upcoming interview.',
    '2026-06-03T16:30:00Z',
  ),
];

const UNRELATED = ev(
  'e-z',
  'Quinn blocked me on everything',
  'Found out Quinn blocked me on every platform.',
  '2026-06-03T21:00:00Z',
);

describe('fingerprintSimilarity', () => {
  it('scores paraphrases of the same occurrence above the merge threshold', () => {
    expect(fingerprintSimilarity(DUPLICATES[0], DUPLICATES[1])).toBeGreaterThanOrEqual(MERGE_THRESHOLD);
    expect(fingerprintSimilarity(DUPLICATES[2], DUPLICATES[3])).toBeGreaterThanOrEqual(MERGE_THRESHOLD);
  });

  it('scores a different narrative thread below the threshold despite same-day timing', () => {
    for (const dup of DUPLICATES) {
      expect(fingerprintSimilarity(dup, UNRELATED)).toBeLessThan(MERGE_THRESHOLD);
    }
  });

  it('treats missing entity arrays as unknown, not as a mismatch', () => {
    // e-c has no entity IDs; wording + timing alone should still connect it
    // to its own near-duplicate e-d.
    expect(fingerprintSimilarity(DUPLICATES[2], DUPLICATES[3])).toBeGreaterThanOrEqual(MERGE_THRESHOLD);
  });

  it('returns 0 for events more than a week apart', () => {
    const far = { ...DUPLICATES[1], id: 'e-far', time: '2026-08-01T15:00:00Z' };
    expect(fingerprintSimilarity(DUPLICATES[0], far)).toBe(0);
  });
});

describe('clusterDuplicateEvents', () => {
  it('collapses paraphrase chains into clusters and keeps unrelated events out', () => {
    const clusters = clusterDuplicateEvents([...DUPLICATES, UNRELATED]);
    const sizes = clusters.map((c) => c.members.length).sort((a, b) => b - a);
    // The four duplicates chain into one cluster (single-link via shared
    // vocabulary); the unrelated event stays alone.
    expect(sizes[0]).toBeGreaterThanOrEqual(2);
    expect(clusters.some((c) => c.members.some((m) => m.id === 'e-z') && c.members.length === 1)).toBe(true);
    const total = clusters.reduce((n, c) => n + c.members.length, 0);
    expect(total).toBe(5);
  });

  it('uses the lexicographically smallest member id as a stable canonical id', () => {
    const clusters = clusterDuplicateEvents(DUPLICATES.slice(0, 2));
    expect(clusters).toHaveLength(1);
    expect(clusters[0].canonicalId).toBe('e-a');
  });

  it('unions entity ids and keeps the richest summary', () => {
    const clusters = clusterDuplicateEvents(DUPLICATES.slice(0, 2));
    const c = clusters[0];
    expect(c.peopleIds).toContain(NELL_ID);
    expect(c.locationIds).toContain(HOUSE_ID);
    expect(c.summary.length).toBeGreaterThan(0);
  });

  it('records merged-away titles for the merge log', () => {
    const clusters = clusterDuplicateEvents(DUPLICATES.slice(0, 2));
    const c = clusters[0];
    expect(c.mergedTitles.length).toBe(1);
    expect(c.mergedTitles[0]).not.toBe(c.title);
  });

  it('leaves singletons untouched', () => {
    const clusters = clusterDuplicateEvents([UNRELATED]);
    expect(clusters).toHaveLength(1);
    expect(clusters[0].title).toBe(UNRELATED.title);
    expect(clusters[0].mergedTitles).toEqual([]);
  });
});

describe('findBestDuplicate', () => {
  const incoming = ev(
    'incoming',
    "Testing OrbitPad at Grandma Nell's",
    "Another pass testing the OrbitPad app over at Grandma Nell's house.",
    '2026-06-03T17:00:00Z',
    { peopleIds: [NELL_ID], locationIds: [HOUSE_ID] },
  );

  it('returns the best-matching existing event above the merge threshold', () => {
    const result = findBestDuplicate(incoming, [...DUPLICATES, UNRELATED]);
    expect(result).not.toBeNull();
    expect(result!.similarity).toBeGreaterThanOrEqual(MERGE_THRESHOLD);
    expect(['e-a', 'e-b']).toContain(result!.match.id);
  });

  it('returns null when nothing clears the threshold', () => {
    expect(findBestDuplicate(incoming, [UNRELATED])).toBeNull();
  });

  it('never matches an event against itself', () => {
    expect(findBestDuplicate(DUPLICATES[0], [DUPLICATES[0]])).toBeNull();
  });
});

describe('buildMergeLog', () => {
  it('reports only real merges, with canonical and merged ids', () => {
    const clusters = clusterDuplicateEvents([...DUPLICATES.slice(0, 2), UNRELATED]);
    const log = buildMergeLog(clusters);
    expect(log).toHaveLength(1);
    expect(log[0].canonical_id).toBe('e-a');
    expect(log[0].merged_ids).toEqual(['e-b']);
    expect(log[0].merged_titles).toHaveLength(1);
  });
});
