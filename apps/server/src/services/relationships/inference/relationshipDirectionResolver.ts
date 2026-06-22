import type { RelationshipCandidate, RelationshipDirection } from './relationshipInferenceTypes';

const BIDIRECTIONAL_PREDICATES = new Set([
  'friend_of',
  'best_friend_of',
  'close_friend_of',
  'schoolmate_of',
  'bandmate_of',
  'coworker_of',
  'teammate_of',
  'classmate_of',
]);

export function resolveDirection(
  predicate: string,
  explicitBidirectional = false,
): RelationshipDirection {
  if (explicitBidirectional || BIDIRECTIONAL_PREDICATES.has(predicate)) return 'bidirectional';
  if (predicate.endsWith('_of') || predicate.includes('works_for') || predicate.includes('boss_of')) {
    return 'subject_to_object';
  }
  return 'unclear';
}

export function invertPredicateForUserWorksFor(org: string): {
  subject: string;
  predicate: string;
  object: string;
} {
  return {
    subject: 'user',
    predicate: 'works_for',
    object: org,
  };
}

export function normalizeWorkPredicate(role: string): string {
  const key = role.toLowerCase();
  if (key === 'boss' || key === 'manager' || key === 'supervisor') return 'boss_of';
  if (key === 'coworker' || key === 'colleague' || key === 'teammate') return 'coworker_of';
  if (key === 'recruiter' || key === 'interviewer') return `${key}_of`;
  if (key === 'mentor') return 'mentor_of';
  if (key === 'client' || key === 'vendor') return `${key}_of`;
  return 'coworker_of';
}

export function shouldNotInferManager(role: string, text: string): boolean {
  const key = role.toLowerCase();
  if (key !== 'coworker' && key !== 'colleague' && key !== 'teammate') return false;
  return !/\b(?:boss|manager|supervisor|reports?\s+to)\b/i.test(text);
}

export function makeRelationshipCandidate(
  base: Omit<RelationshipCandidate, 'direction'> & { direction?: RelationshipDirection },
): RelationshipCandidate {
  return {
    ...base,
    direction: base.direction ?? resolveDirection(base.predicate),
  };
}
