import { describe, it, expect } from 'vitest';
import { computeSubLanes, clusterEntries, clusterRangeLabel } from './swimlaneOverlap';
import type { LifeArc } from '../../hooks/useLifeArcs';
import type { ChronologyEntry } from '../../types/timelineV2';

const DAY_MS = 86_400_000;

function arc(id: string, start: string, end: string | null): LifeArc {
  return {
    id,
    title: id,
    arc_type: 'custom',
    track: 'career',
    dominant_emotion: null,
    emotional_arc: null,
    parent_id: null,
    start_date: start,
    end_date: end,
    is_active: !end,
    summary: null,
    confidence: 0.9,
    source: 'inferred',
    tags: [],
  };
}

function entry(id: string, startTime: string): ChronologyEntry {
  return {
    id,
    user_id: 'u1',
    journal_entry_id: `j-${id}`,
    start_time: startTime,
    time_precision: 'day',
    time_confidence: 1,
    content: `entry ${id}`,
    timeline_memberships: [],
  } as ChronologyEntry;
}

describe('computeSubLanes', () => {
  it('keeps sequential non-overlapping arcs in a single lane', () => {
    const { map, count } = computeSubLanes([
      arc('a', '2024-01-01', '2024-03-01'),
      arc('b', '2024-03-01', '2024-06-01'),
      arc('c', '2024-06-02', '2024-09-01'),
    ]);
    expect(count).toBe(1);
    expect(map.get('a')).toBe(0);
    expect(map.get('b')).toBe(0);
    expect(map.get('c')).toBe(0);
  });

  it('stacks overlapping arcs into separate lanes', () => {
    const { map, count } = computeSubLanes([
      arc('a', '2024-01-01', '2024-06-01'),
      arc('b', '2024-03-01', '2024-09-01'),
      arc('c', '2024-07-01', '2024-12-01'),
    ]);
    expect(count).toBe(2);
    expect(map.get('a')).toBe(0);
    expect(map.get('b')).toBe(1);
    expect(map.get('c')).toBe(0); // a has ended, lane 0 is free again
  });

  it('treats ongoing arcs as overlapping everything after their start', () => {
    const now = new Date('2026-07-01').getTime();
    const { count } = computeSubLanes(
      [arc('a', '2024-01-01', null), arc('b', '2025-01-01', '2025-02-01')],
      0,
      now,
    );
    expect(count).toBe(2);
  });

  it('widens short arcs by minSpanMs so rendered bars do not collide', () => {
    // Two 1-day arcs, 2 days apart: no date overlap, but at low zoom each bar
    // renders ≥ min pixel width. With a 5-day minimum span they must stack.
    const arcs = [arc('a', '2024-01-01', '2024-01-02'), arc('b', '2024-01-04', '2024-01-05')];
    expect(computeSubLanes(arcs).count).toBe(1);
    expect(computeSubLanes(arcs, 5 * DAY_MS).count).toBe(2);
  });

  it('ignores arcs without a start date and returns at least one lane', () => {
    const undated = { ...arc('a', '2024-01-01', '2024-02-01'), start_date: null };
    const { map, count } = computeSubLanes([undated]);
    expect(count).toBe(1);
    expect(map.size).toBe(0);
  });
});

describe('clusterEntries', () => {
  // 1px per day for easy math
  const xOf = (iso: string) => new Date(iso).getTime() / DAY_MS;

  it('keeps well-separated entries as single-member clusters', () => {
    const clusters = clusterEntries(
      [entry('a', '2024-01-01'), entry('b', '2024-03-01'), entry('c', '2024-06-01')],
      xOf,
      10,
    );
    expect(clusters).toHaveLength(3);
    expect(clusters.every(c => c.entries.length === 1)).toBe(true);
  });

  it('merges entries closer than the threshold into one counted cluster', () => {
    const clusters = clusterEntries(
      [
        entry('a', '2024-01-01'),
        entry('b', '2024-01-03'),
        entry('c', '2024-01-05'),
        entry('d', '2024-02-20'),
      ],
      xOf,
      10,
    );
    expect(clusters).toHaveLength(2);
    expect(clusters[0].entries.map(e => e.id)).toEqual(['a', 'b', 'c']);
    expect(clusters[1].entries.map(e => e.id)).toEqual(['d']);
  });

  it('chains: each member only needs to be near the previous one', () => {
    const clusters = clusterEntries(
      [entry('a', '2024-01-01'), entry('b', '2024-01-08'), entry('c', '2024-01-15')],
      xOf,
      10,
    );
    // a↔c are 14px apart (> threshold) but chained through b
    expect(clusters).toHaveLength(1);
    expect(clusters[0].entries).toHaveLength(3);
  });

  it('anchors the cluster at the midpoint of first and last member', () => {
    const [cluster] = clusterEntries(
      [entry('a', '2024-01-01'), entry('b', '2024-01-05')],
      xOf,
      10,
    );
    expect(cluster.x).toBeCloseTo((xOf('2024-01-01') + xOf('2024-01-05')) / 2);
  });

  it('returns an empty list for no entries', () => {
    expect(clusterEntries([], xOf, 10)).toEqual([]);
  });
});

describe('clusterRangeLabel', () => {
  const fmt = (iso: string) => iso.slice(0, 10);

  it('collapses same-day clusters to a single date', () => {
    const [cluster] = clusterEntries([entry('a', '2024-01-01')], () => 0, 10);
    expect(clusterRangeLabel(cluster, fmt)).toBe('2024-01-01');
  });

  it('shows a range for multi-day clusters', () => {
    const cluster = {
      key: 'a',
      x: 0,
      entries: [entry('a', '2024-01-01'), entry('b', '2024-01-05')],
    };
    expect(clusterRangeLabel(cluster, fmt)).toBe('2024-01-01 – 2024-01-05');
  });
});
