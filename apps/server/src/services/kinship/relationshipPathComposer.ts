/**
 * Composes a family relation from a walked sequence of primitive graph steps,
 * fixing a real mislabeling bug: the old tree builder labeled every node from
 * its single last-hop edge type, so "parent's sibling" (aunt/uncle) rendered
 * as a plain sibling, and "parent's sibling's child" (cousin) rendered as a
 * parent. This composes the whole path instead of just the last hop.
 *
 * Only decomposes the primitive edge types (parent_of/child_of/sibling_of
 * family/spouse_of) into steps. Compound/explicit edge types (aunt_of,
 * cousin_of, step_*, adopted_*, godparent/godchild, in_law_of) are already
 * correct as single-hop labels and are never decomposed here — this module
 * only touches the SIDE-inclusive multi-hop cases that are provably wrong
 * today.
 */
import type { FamilyRelationType } from '../familyTreeService';
import { normalizeFamilyEdgeType } from './familyEdgeWriter';

export type PathStep = 'UP' | 'DOWN' | 'SIDE' | 'MARRY';

export type InferredSex = 'male' | 'female';

const PRIMITIVE_SIDE_TYPES = new Set(['sibling_of', 'twin_of', 'half_sibling_of', 'step_sibling_of']);

/**
 * Classify a single edge into a primitive step, given the direction of travel
 * (forward = current is the edge's source; backward = current is the target).
 * Returns null for compound/explicit edge types — those are not decomposed.
 */
export function stepFromEdge(type: string, direction: 'forward' | 'backward'): PathStep | null {
  const t = normalizeFamilyEdgeType(type);
  if (t === 'parent_of') return direction === 'forward' ? 'DOWN' : 'UP';
  if (t === 'child_of') return direction === 'forward' ? 'UP' : 'DOWN';
  if (PRIMITIVE_SIDE_TYPES.has(t)) return 'SIDE';
  if (t === 'spouse_of') return 'MARRY';
  return null;
}

/** Number of SIDE/MARRY steps in a path — used to tie-break equal-length BFS paths. */
export function sidewaysStepCount(steps: PathStep[]): number {
  return steps.filter((s) => s === 'SIDE' || s === 'MARRY').length;
}

/**
 * Compose a relation from a walked step path. `sex` is the already-resolved
 * sex of the target node (from metadata, or a name-based guess) — this
 * function stays pure and never itself looks anything up. When a relation's
 * correct label genuinely depends on sex and none is known, falls back to
 * `'related'` rather than guessing wrong — the same honesty-first fallback
 * the rest of this app already uses for unknown fields.
 */
export function composeRelation(steps: PathStep[], sex: InferredSex | null): FamilyRelationType {
  const key = steps.join(',');
  switch (key) {
    case '':
      return 'related';
    case 'UP':
      return 'parent';
    case 'DOWN':
      return 'child';
    case 'SIDE':
      return 'sibling';
    case 'MARRY':
      return 'spouse';
    case 'UP,UP':
      return 'grandparent';
    case 'DOWN,DOWN':
      return 'grandchild';
    case 'UP,DOWN':
      // A parent's other child, reached without a direct sibling_of edge
      // (e.g. only two separate parent_of edges on record) — still a sibling.
      return 'sibling';
    case 'UP,SIDE':
      if (sex === 'male') return 'uncle';
      if (sex === 'female') return 'aunt';
      return 'related';
    case 'SIDE,DOWN':
      if (sex === 'male') return 'nephew';
      if (sex === 'female') return 'niece';
      return 'related';
    case 'UP,SIDE,DOWN':
      return 'cousin';
    default:
      return 'related';
  }
}

/** True when the given step sequence needs a resolved sex to label correctly. */
export function relationNeedsSex(steps: PathStep[]): boolean {
  const key = steps.join(',');
  return key === 'UP,SIDE' || key === 'SIDE,DOWN';
}
