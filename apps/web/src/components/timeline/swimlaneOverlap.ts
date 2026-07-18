/**
 * Overlap layout helpers for the Omni Timeline swimlanes.
 *
 * Two overlap problems are solved here, both in pure functions so they can be
 * unit-tested independently of the canvas component:
 *
 * 1. Arc bars — overlapping arcs within the same track are stacked into
 *    sub-lanes via greedy interval scheduling. The scheduler is zoom-aware:
 *    bars render at a minimum pixel width, so at low zoom two short
 *    back-to-back arcs can collide even though their date ranges don't.
 *    `minSpanMs` widens each interval to the rendered minimum before packing.
 *
 * 2. Memory markers — entries closer together than a marker width at the
 *    current zoom are merged into clusters with a count, instead of drawing
 *    unreadable stacked markers.
 */

import type { LifeArc } from '../../hooks/useLifeArcs';
import type { ChronologyEntry } from '../../types/timelineV2';

export type SubLaneMap = Map<string, number>; // arcId → sub-lane index (0-based)

export interface SubLaneLayout {
  map: SubLaneMap;
  count: number;
}

/**
 * Assign overlapping arcs to stacked sub-lanes.
 *
 * Sort arcs by start date, then place each into the first sub-lane whose last
 * arc has already ended; open a new lane when all are occupied. O(n log n) for
 * the sort, O(n·lanes) for assignment — lanes is bounded by the maximum number
 * of simultaneously-active arcs (typically 1–3).
 *
 * @param minSpanMs widen each arc to at least this duration before packing,
 *   so bars drawn at a minimum pixel width don't visually collide.
 * @param now end-of-range for ongoing arcs (injectable for tests).
 */
export function computeSubLanes(
  arcs: LifeArc[],
  minSpanMs = 0,
  now = Date.now(),
): SubLaneLayout {
  const sorted = [...arcs]
    .filter(a => a.start_date)
    .sort((a, b) => new Date(a.start_date!).getTime() - new Date(b.start_date!).getTime());

  const laneMap: SubLaneMap = new Map();
  const laneEnds: number[] = []; // end-ms of the last arc assigned to each lane

  for (const arc of sorted) {
    const start = new Date(arc.start_date!).getTime();
    const rawEnd = arc.end_date ? new Date(arc.end_date).getTime() : now + 86_400_000;
    const end = Math.max(rawEnd, start + minSpanMs);

    let lane = laneEnds.findIndex(e => start >= e);
    if (lane === -1) lane = laneEnds.length; // all occupied → open new lane

    laneEnds[lane] = Math.max(laneEnds[lane] ?? 0, end);
    laneMap.set(arc.id, lane);
  }

  return { map: laneMap, count: Math.max(1, laneEnds.length) };
}

export interface EntryCluster {
  /** Stable key — the id of the first (earliest) member. */
  key: string;
  /** Pixel anchor: midpoint between first and last member positions. */
  x: number;
  /** Chronologically ordered members; length 1 = plain marker. */
  entries: ChronologyEntry[];
}

/**
 * Merge chronologically-sorted entries whose markers would collide at the
 * current zoom into clusters. An entry joins the open cluster while it is
 * within `thresholdPx` of the cluster's latest member (chain rule), so a dense
 * run of memories collapses into one counted marker instead of a smear.
 */
export function clusterEntries(
  sortedEntries: ChronologyEntry[],
  xOf: (date: string) => number,
  thresholdPx: number,
): EntryCluster[] {
  const clusters: EntryCluster[] = [];
  let lastMemberX = 0;

  for (const entry of sortedEntries) {
    const x = xOf(entry.start_time);
    const open = clusters[clusters.length - 1];

    if (open && x - lastMemberX < thresholdPx) {
      open.entries.push(entry);
      open.x = (xOf(open.entries[0].start_time) + x) / 2;
    } else {
      clusters.push({ key: entry.id, x, entries: [entry] });
    }
    lastMemberX = x;
  }

  return clusters;
}

/** Inclusive date-range label for a cluster, e.g. "Mar 3 – Apr 12". */
export function clusterRangeLabel(
  cluster: EntryCluster,
  formatDate: (iso: string) => string,
): string {
  const first = cluster.entries[0];
  const last = cluster.entries[cluster.entries.length - 1];
  const a = formatDate(first.start_time);
  const b = formatDate(last.start_time);
  return a === b ? a : `${a} – ${b}`;
}
