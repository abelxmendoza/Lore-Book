/**
 * Bucket a character's connection edges into the kinship lists the Connections
 * tab shows: parents (biological / step / adoptive), children (biological /
 * step / adopted), and pets.
 *
 * Types are read from the related person's perspective — the same reading the
 * Connections rows already use ("`mother` describes how <them> relates to
 * <this character>"), so `mother` lands in Parents and `daughter` in Children.
 */

import type { DedupeableRelationship } from './dedupeCharacterRelationships';

export type KinshipGroupKey =
  | 'parents'
  | 'step_parents'
  | 'adopted_parents'
  | 'children'
  | 'step_children'
  | 'adopted_children'
  | 'pets';

export const KINSHIP_GROUP_LABELS: Record<KinshipGroupKey, string> = {
  parents: 'Biological parents',
  step_parents: 'Step parents',
  adopted_parents: 'Adoptive parents',
  children: 'Children',
  step_children: 'Step children',
  adopted_children: 'Adopted children',
  pets: 'Pets',
};

/** Render order: parents oldest-first, then children, then pets. */
export const KINSHIP_GROUP_ORDER: KinshipGroupKey[] = [
  'parents',
  'step_parents',
  'adopted_parents',
  'children',
  'step_children',
  'adopted_children',
  'pets',
];

/**
 * Ordered so the qualified forms win: `step_parent` and `adoptive_mother` both
 * contain a plain-parent word, so they must be tested before it.
 */
const RULES: Array<{ group: KinshipGroupKey; pattern: RegExp }> = [
  { group: 'adopted_parents', pattern: /^(adopt(ed|ive)_)(parent|mother|father|mom|dad|mum)$/ },
  { group: 'step_parents', pattern: /^step_?(parent|mother|father|mom|dad|mum)$/ },
  { group: 'adopted_children', pattern: /^(adopt(ed|ive)_)(child|kid|son|daughter)$/ },
  { group: 'step_children', pattern: /^step_?(child|kid|son|daughter)$/ },
  { group: 'parents', pattern: /^(bio(logical)?_|birth_)?(parent|mother|father|mom|dad|mum|mama|papa)$/ },
  { group: 'children', pattern: /^(bio(logical)?_|birth_)?(child|kid|son|daughter)$/ },
  { group: 'pets', pattern: /^(pet|dog|cat|puppy|kitten|bird|fish|rabbit|hamster|reptile|animal)$/ },
];

function normalizeType(type: string): string {
  return String(type ?? '')
    .toLowerCase()
    .trim()
    .replace(/[\s-]+/g, '_')
    // Graph edges are stored directionally (`parent_of`, `step_child_of`); the
    // suffix carries no extra meaning for grouping.
    .replace(/_of$/, '');
}

/** The kinship list a relationship type belongs in, or null when it isn't kin. */
export function classifyKinshipType(type: string): KinshipGroupKey | null {
  const normalized = normalizeType(type);
  if (!normalized) return null;
  return RULES.find((rule) => rule.pattern.test(normalized))?.group ?? null;
}

export type KinshipGroup<T> = {
  key: KinshipGroupKey;
  label: string;
  members: T[];
};

/** Non-empty kinship groups in display order; everything else is left out. */
export function groupKinshipConnections<T extends DedupeableRelationship>(
  relationships: T[],
): Array<KinshipGroup<T>> {
  const byGroup = new Map<KinshipGroupKey, T[]>();

  for (const relationship of relationships) {
    const group = classifyKinshipType(relationship.relationship_type);
    if (!group) continue;
    const bucket = byGroup.get(group);
    if (bucket) bucket.push(relationship);
    else byGroup.set(group, [relationship]);
  }

  return KINSHIP_GROUP_ORDER.filter((key) => (byGroup.get(key)?.length ?? 0) > 0).map((key) => ({
    key,
    label: KINSHIP_GROUP_LABELS[key],
    members: byGroup.get(key) ?? [],
  }));
}

/** True when this edge is shown in the kinship lists rather than the flat list. */
export function isKinshipConnection(relationship: DedupeableRelationship): boolean {
  return classifyKinshipType(relationship.relationship_type) !== null;
}
