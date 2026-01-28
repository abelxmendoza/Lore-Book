/**
 * Hierarchy gap detection: empty time spans inside era/saga/arc containers.
 * Pure logic; no DB access. Uses ISO date strings; null end_date = ongoing.
 */

import type { HierarchyGap, HierarchyNodeInput, InsightTimelineLayer } from '../../types/timelineInsight';

/** Child shape for gap detection (id optional; start_date/end_date required for ordering). */
export type ChildNodeForGaps = { id?: string; start_date: string; end_date: string | null };

// Align with voidAwarenessService thresholds
const SHORT_GAP_DAYS = 30;
const MEDIUM_GAP_DAYS = 180;

/**
 * Classify gap size by duration.
 * < 30 days = short, < 180 = medium, else long.
 */
export function classifyGapSize(start: string, end: string): HierarchyGap['size'] {
  const days = daysBetween(start, end);
  if (days < SHORT_GAP_DAYS) return 'short';
  if (days < MEDIUM_GAP_DAYS) return 'medium';
  return 'long';
}

function daysBetween(start: string, end: string): number {
  const a = new Date(start).getTime();
  const b = new Date(end).getTime();
  return Math.ceil((b - a) / (1000 * 60 * 60 * 24));
}

/**
 * Build a single gap record. Used for no-children, before-first, between, and after-last.
 */
function buildGap(
  parent: { id: string; layer: InsightTimelineLayer },
  start: string,
  end: string
): HierarchyGap {
  return {
    parent_node_id: parent.id,
    parent_layer: parent.layer,
    start,
    end,
    duration_days: daysBetween(start, end),
    size: classifyGapSize(start, end),
    reason: 'no_children',
  };
}

/**
 * Detect empty time ranges inside a parent node.
 * - children.length === 0 and parent has no end: return [] (ongoing, no gap).
 * - children.length === 0 and parent has end: one gap from parent.start_date to parent.end_date.
 * - Else: sort children by start_date; gap before first, between consecutive, after last (skip after-last if parent.end_date is null).
 */
export function detectHierarchyGaps(
  parent: HierarchyNodeInput,
  children: ChildNodeForGaps[]
): HierarchyGap[] {
  const gaps: HierarchyGap[] = [];
  const parentStart = parent.start_date;
  const parentEnd = parent.end_date ?? null;

  if (children.length === 0) {
    if (!parentEnd) return [];
    gaps.push(buildGap(parent, parentStart, parentEnd));
    return gaps;
  }

  const sorted = [...children].sort(
    (a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime()
  );

  // Gap before first child
  if (sorted[0].start_date > parentStart) {
    gaps.push(buildGap(parent, parentStart, sorted[0].start_date));
  }

  // Gaps between consecutive children
  for (let i = 0; i < sorted.length - 1; i++) {
    const gapEnd = sorted[i].end_date ?? sorted[i].start_date;
    const nextStart = sorted[i + 1].start_date;
    if (nextStart > gapEnd) {
      gaps.push(buildGap(parent, gapEnd, nextStart));
    }
  }

  // Gap after last child (only if parent has end_date)
  if (parentEnd) {
    const last = sorted[sorted.length - 1];
    const lastEnd = last.end_date ?? last.start_date;
    if (parentEnd > lastEnd) {
      gaps.push(buildGap(parent, lastEnd, parentEnd));
    }
  }

  return gaps;
}
