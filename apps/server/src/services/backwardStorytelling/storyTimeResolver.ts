/**
 * StoryTimeResolver
 * Resolves relative dates to absolute using temporal graph. Never uses narrative_order for time.
 */

import { logger } from '../../logger';

import type { LifeAnchors, StoryTimeInference } from './types';

type ResolvedInference = StoryTimeInference & { start_date?: string; end_date?: string };

function topologicalSort(inferences: StoryTimeInference[]): string[] {
  const idToInference = new Map(inferences.map(i => [i.segment_id, i]));
  const inDegree = new Map<string, number>();
  const outEdges = new Map<string, string[]>();

  for (const inf of inferences) {
    if (!inDegree.has(inf.segment_id)) inDegree.set(inf.segment_id, 0);
    if (inf.relative_to && idToInference.has(inf.relative_to)) {
      if (!inDegree.has(inf.relative_to)) inDegree.set(inf.relative_to, 0);
      if (inf.relation === 'before') {
        // inf.segment_id happens before inf.relative_to → edge inf -> relative_to
        const list = outEdges.get(inf.segment_id) ?? [];
        list.push(inf.relative_to);
        outEdges.set(inf.segment_id, list);
        inDegree.set(inf.relative_to, (inDegree.get(inf.relative_to) ?? 0) + 1);
      } else if (inf.relation === 'after') {
        // inf.segment_id happens after inf.relative_to → edge relative_to -> inf
        const list = outEdges.get(inf.relative_to) ?? [];
        list.push(inf.segment_id);
        outEdges.set(inf.relative_to, list);
        inDegree.set(inf.segment_id, (inDegree.get(inf.segment_id) ?? 0) + 1);
      }
      // "during" doesn't add a before/after edge for ordering
    }
  }

  const queue: string[] = [];
  inDegree.forEach((deg, id) => {
    if (deg === 0) queue.push(id);
  });
  const order: string[] = [];
  while (queue.length > 0) {
    const u = queue.shift()!;
    order.push(u);
    for (const v of outEdges.get(u) ?? []) {
      const d = (inDegree.get(v) ?? 1) - 1;
      inDegree.set(v, d);
      if (d === 0) queue.push(v);
    }
  }
  // Append any unreached (e.g. cycles or isolates)
  for (const id of inDegree.keys()) {
    if (!order.includes(id)) order.push(id);
  }
  return order;
}

/** Approximate "a few months before" / "a year after" as day delta; default ~1 year spacing when only relation known */
function offsetFromRelation(relation: 'before' | 'after', refDate: string, _reasoning?: string): string {
  const d = new Date(refDate);
  const oneYearMs = 365.25 * 24 * 60 * 60 * 1000;
  if (relation === 'before') {
    d.setTime(d.getTime() - oneYearMs);
  } else {
    d.setTime(d.getTime() + oneYearMs);
  }
  return d.toISOString().slice(0, 10);
}

/**
 * Resolve relative dates to absolute. Uses only explicit relations and anchors; never narrative order.
 * If unresolved, confidence is set < 0.5.
 */
export function resolveStoryDates(
  inferences: StoryTimeInference[],
  anchors: LifeAnchors = {}
): StoryTimeInference[] {
  const idToInf = new Map<string, ResolvedInference>();
  for (const i of inferences) {
    idToInf.set(i.segment_id, { ...i });
  }

  const orderedIds = topologicalSort(inferences);
  const anchorDates = (anchors.anchors ?? []).map(a => a.date).filter(Boolean);

  function getResolvedDate(segmentId: string): string | undefined {
    return idToInf.get(segmentId)?.start_date;
  }

  function setResolved(segmentId: string, start: string, end?: string) {
    const r = idToInf.get(segmentId);
    if (r) {
      r.start_date = start;
      if (end) r.end_date = end;
    }
  }

  // First pass: set any that already have start_date
  for (const id of orderedIds) {
    const r = idToInf.get(id)!;
    if (r.start_date) continue;
    if (r.relative_to && r.relation) {
      const ref = getResolvedDate(r.relative_to);
      if (ref) {
        const inferred = offsetFromRelation(r.relation, ref, r.reasoning);
        setResolved(id, inferred);
      }
    }
  }

  // Second pass: resolve remaining relative_to using now-established dates
  for (const id of orderedIds) {
    const r = idToInf.get(id)!;
    if (r.start_date) continue;
    if (r.relative_to && r.relation) {
      const ref = getResolvedDate(r.relative_to);
      if (ref) {
        const inferred = offsetFromRelation(r.relation, ref, r.reasoning);
        setResolved(id, inferred);
      }
    }
  }

  // Third pass: any still unresolved get a default from newest anchor or "today", and low confidence
  const fallback = anchorDates.length > 0
    ? anchorDates.sort().reverse()[0]
    : new Date().toISOString().slice(0, 10);
  for (const id of orderedIds) {
    const r = idToInf.get(id)!;
    if (!r.start_date) {
      r.start_date = fallback;
      r.confidence = Math.min(r.confidence, 0.4);
      r.reasoning = (r.reasoning || '') + ' [unresolved; default date used]';
    }
  }

  logger.debug({ resolved: idToInf.size }, 'Story dates resolved');
  return Array.from(idToInf.values());
}
