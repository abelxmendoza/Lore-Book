/**
 * Map chat/name kinship signals onto Character Info "Relationship to you".
 * Title-leading real kin ("Cousin James") auto-fills; trailing/stage personas
 * ("Goth Tio") and public-figure stage names do not — users can still correct
 * mistakes in the character modal.
 */

import { scoreKinshipInContext } from '../ontology/lexicalIntelligence';

const KINSHIP_TO_YOU: Record<string, string> = {
  uncle: 'uncle',
  tio: 'uncle',
  tío: 'uncle',
  aunt: 'aunt',
  tia: 'aunt',
  tía: 'aunt',
  auntie: 'aunt',
  cousin: 'cousin',
  primo: 'cousin',
  prima: 'cousin',
  mother: 'mother',
  mom: 'mother',
  mama: 'mother',
  mamá: 'mother',
  mommy: 'mother',
  father: 'father',
  dad: 'father',
  papa: 'father',
  papá: 'father',
  daddy: 'father',
  stepfather: 'step_parent',
  stepmother: 'step_parent',
  stepdad: 'step_parent',
  stepmom: 'step_parent',
  step_father: 'step_parent',
  step_mother: 'step_parent',
  step_parent: 'step_parent',
  sibling: 'sibling',
  brother: 'sibling',
  sister: 'sibling',
  hermana: 'sibling',
  hermano: 'sibling',
  grandparent: 'grandparent',
  grandmother: 'grandmother',
  grandfather: 'grandfather',
  grandma: 'grandmother',
  grandpa: 'grandfather',
  abuela: 'grandmother',
  abuelo: 'grandfather',
  parent: 'parent',
  child: 'child',
  son: 'son',
  daughter: 'daughter',
  grandchild: 'grandchild',
  grandson: 'grandson',
  granddaughter: 'granddaughter',
  niece: 'niece',
  nephew: 'nephew',
  family: 'family',
};

function normalizeKinKey(value: string): string {
  return value.trim().toLowerCase().replace(/[\s-]+/g, '_');
}

export function mapKinshipToRelationshipToYou(kinship: string): string | null {
  const key = normalizeKinKey(kinship);
  if (!key) return null;
  if (KINSHIP_TO_YOU[key]) return KINSHIP_TO_YOU[key];
  // "Step Dad" → step_dad after normalize → try without step_ prefix fold
  const folded = key.replace(/^step_?/, 'step_');
  if (KINSHIP_TO_YOU[folded]) return KINSHIP_TO_YOU[folded];
  return key;
}

export type RelationshipToYouKinshipDecision = {
  apply: boolean;
  value: string | null;
  reason: string;
};

/**
 * Decide whether a detected kinship term should write relationship_to_user.
 */
export function decideRelationshipToYouFromKinship(input: {
  kinship: string;
  characterName?: string | null;
  context?: string | null;
  metadata?: Record<string, unknown> | null;
  /** True when chat asserted "my cousin James" / focused kinship claim. */
  explicitClaim?: boolean;
}): RelationshipToYouKinshipDecision {
  const value = mapKinshipToRelationshipToYou(input.kinship);
  if (!value) return { apply: false, value: null, reason: 'empty kinship' };

  const meta = input.metadata ?? {};
  const source = String(meta.relationship_to_user_source ?? '');
  if (source === 'user' || source === 'user_confirmed') {
    return { apply: false, value, reason: 'user confirmed relationship_to_user' };
  }

  const excluded = meta.family_excluded;
  if (
    excluded === true ||
    (excluded && typeof excluded === 'object' && (excluded as { value?: unknown }).value === true)
  ) {
    return { apply: false, value, reason: 'family_excluded' };
  }

  if (
    meta.is_public_figure === true ||
    meta.name_kind === 'stage_name' ||
    meta.identity_type === 'stage_name' ||
    meta.title_type === 'stage_name' ||
    (typeof meta.display_title === 'object' &&
      meta.display_title !== null &&
      (meta.display_title as { titleType?: string }).titleType === 'stage_name')
  ) {
    return { apply: false, value, reason: 'stage/public-figure identity' };
  }

  if (input.explicitClaim) {
    return { apply: true, value, reason: 'explicit kinship claim in chat' };
  }

  const name = String(input.characterName ?? '').trim();
  if (!name) {
    // Label-only path without a name — still apply when kinship came from chat extraction.
    return { apply: true, value, reason: 'kinship label without name gate' };
  }

  const verdict = scoreKinshipInContext(name, input.context ?? '');
  if (!verdict.isKin) {
    return { apply: false, value, reason: verdict.reason || 'not title-leading kin' };
  }
  return { apply: true, value, reason: verdict.reason || 'title-leading kinship name' };
}
