// =====================================================
// FAMILY TREE SERVICE
// Purpose: Build visual family trees from character_relationships
//          and conversation-inferred kinship — centered on the user,
//          a specific character, or a family-type organization roster.
// =====================================================

import { randomUUID } from 'node:crypto';

import { logger } from '../logger';
import { organizationService } from './organizationService';
import { relationshipTreeBuilder } from './conversationCentered/relationshipTreeBuilder';
import { supabaseAdmin } from './supabaseClient';
import {
  inverseFamilyEdgeType as inverseFamilyEdgeTypeShared,
  normalizeFamilyEdgeType,
  syncSiblingsUnderParent as syncSiblingsUnderParentShared,
  upsertBidirectionalFamilyEdge,
  TREE_RELATION_GENERATION,
  normalizeTreeRelation,
} from './kinship/familyEdgeWriter';
import {
  composeRelation,
  relationNeedsSex,
  sidewaysStepCount,
  stepFromEdge,
  type PathStep,
} from './kinship/relationshipPathComposer';
import { sexFromFirstName, type InferredSex } from './kinship/sexFromName';

export type FamilyRelationType =
  | 'parent' | 'child' | 'sibling' | 'twin' | 'grandparent' | 'grandchild'
  | 'aunt' | 'uncle' | 'niece' | 'nephew' | 'cousin' | 'spouse' | 'in_law'
  | 'step_parent' | 'step_child' | 'step_sibling' | 'half_sibling'
  | 'adopted_parent' | 'adopted_child' | 'godparent' | 'godchild' | 'related';

export interface FamilyMemberDTO {
  id: string;
  name: string;
  first_name?: string;
  last_name?: string;
  /** The kinship term the user actually uses for them, e.g. "Abuela" — shown
   *  alongside the real name. Preserved even after the real name is learned. */
  kinship_title?: string;
  relation: FamilyRelationType;
  relation_label: string;
  generation: number;
  closeness?: number;
  is_self?: boolean;
  /** True when this node is the account owner's protagonist on another ego's tree. */
  is_account_self?: boolean;
  is_placeholder?: boolean;
  inference_status?: 'asserted' | 'inferred' | 'placeholder';
  side?: 'maternal' | 'paternal' | 'both' | 'other';
  notes?: string;
  /** True when this node maps to a real, saved character row (not a name-only
   *  org member or a synthetic placeholder). Drives the "open card" path. */
  has_card?: boolean;
  /** Explicit parent this node connects to in the graph (user-asserted). When
   *  set, the connector is drawn to this member instead of the inferred guess.
   *  Empty = let LoreBook infer the edge. */
  parent_id?: string;
  /** Set when the node looks like it may not belong in the family tree
   *  (stage name/handle, public figure, or no clear kinship). The UI surfaces
   *  a one-tap review affordance; the user decides. */
  needs_review?: boolean;
  review_reason?: string;
  /** Id of this member's confirmed spouse_of partner in the same tree, when
   *  known from the raw edge graph. Drives display clustering (a step-parent
   *  sorts next to their actual spouse, not just whoever shares their side —
   *  side alone is ambiguous when multiple same-side relatives share a
   *  generation, e.g. an uncle and a mother). */
  paired_with_id?: string;
  /** User-dragged left-right position within this member's generation row
   *  (see reorderMembers). Lower sorts first. Only present once the user has
   *  manually reordered that row at least once — otherwise the automatic
   *  sort (see sortFamilyMembersForDisplay) decides order. */
  family_display_order?: number;
}

export interface FamilyBranchDTO {
  side: 'maternal' | 'paternal' | 'partner' | 'other';
  label: string;
  color: string;
}

export interface FamilyTreeDTO {
  members: FamilyMemberDTO[];
  branches: FamilyBranchDTO[];
  self_id: string;
}

const FAMILY_TYPES = new Set([
  'parent_of', 'child_of', 'sibling_of', 'spouse_of', 'grandparent_of', 'grandchild_of',
  'aunt_of', 'uncle_of', 'niece_of', 'nephew_of', 'cousin_of', 'in_law_of',
  'step_parent_of', 'step_child_of', 'step_sibling_of', 'half_sibling_of',
  'adopted_parent_of', 'adopted_child_of', 'godparent_of', 'godchild_of', 'related_to',
  'mother', 'father', 'parent', 'child', 'sibling', 'brother', 'sister', 'cousin',
  'grandmother', 'grandfather', 'grandparent', 'grandchild', 'aunt', 'uncle', 'spouse',
  'family',
]);

const VIRTUAL_USER_ID = '__user__';
const INFERRED_PARENT_ID = '__inferred_parent_unknown__';

/** Generation delta when traversing edge from `atId` toward neighbor. */
const GEN_DELTA: Record<string, { forward: number; backward: number }> = {
  parent_of: { forward: 1, backward: -1 },
  child_of: { forward: -1, backward: 1 },
  grandparent_of: { forward: 2, backward: -2 },
  grandchild_of: { forward: -2, backward: 2 },
  sibling_of: { forward: 0, backward: 0 },
  twin_of: { forward: 0, backward: 0 },
  half_sibling_of: { forward: 0, backward: 0 },
  step_sibling_of: { forward: 0, backward: 0 },
  spouse_of: { forward: 0, backward: 0 },
  in_law_of: { forward: 0, backward: 0 },
  aunt_of: { forward: 1, backward: -1 },
  uncle_of: { forward: 1, backward: -1 },
  niece_of: { forward: -1, backward: 1 },
  nephew_of: { forward: -1, backward: 1 },
  cousin_of: { forward: 0, backward: 0 },
  step_parent_of: { forward: 1, backward: -1 },
  step_child_of: { forward: -1, backward: 1 },
  adopted_parent_of: { forward: 1, backward: -1 },
  adopted_child_of: { forward: -1, backward: 1 },
  godparent_of: { forward: 1, backward: -1 },
  godchild_of: { forward: -1, backward: 1 },
  related_to: { forward: 0, backward: 0 },
  mother: { forward: 1, backward: -1 },
  father: { forward: 1, backward: -1 },
  parent: { forward: 1, backward: -1 },
  grandmother: { forward: 2, backward: -2 },
  grandfather: { forward: 2, backward: -2 },
  grandparent: { forward: 2, backward: -2 },
  aunt: { forward: 1, backward: -1 },
  uncle: { forward: 1, backward: -1 },
  cousin: { forward: 0, backward: 0 },
  brother: { forward: 0, backward: 0 },
  sister: { forward: 0, backward: 0 },
  sibling: { forward: 0, backward: 0 },
};

/** "_of" edge types where the source is definitionally older/senior to the
 *  target (source can never legitimately be the tree's own root). Used to
 *  detect and correct backwards-written generic-family+kinship rows. */
const ASCENDING_KIN_EDGE_TYPES = new Set([
  'parent_of', 'step_parent_of', 'adopted_parent_of', 'godparent_of',
  'aunt_of', 'uncle_of', 'grandparent_of',
]);

const GENERIC_FAMILY_BUCKET_TYPES = new Set(['family', 'related_to', 'related']);

/**
 * A properly-typed row follows "source IS the <kin> of target" (Mom
 * parent_of You). A generic "family" row carries no such guarantee — its
 * fromId/toId order just reflects whichever character got extracted first.
 * When one of those rows has rootId as the source AND resolves to an
 * ascending relation (aunt, uncle, parent, grandparent, ...), rootId can't
 * actually BE the elder party of their own tree, so it was written
 * backwards. Flip it so generation math (GEN_DELTA) sees the same
 * source=kin/target=root shape every correctly-typed edge already uses.
 */
export function resolveFamilyEdgeDirection(
  rootId: string,
  sourceId: string,
  targetId: string,
  rawRelationshipType: string,
  normalizedType: string,
): { fromId: string; toId: string } {
  const wasGenericBucket = GENERIC_FAMILY_BUCKET_TYPES.has((rawRelationshipType ?? '').toLowerCase());
  const shouldFlip = wasGenericBucket && sourceId === rootId && ASCENDING_KIN_EDGE_TYPES.has(normalizedType);
  return shouldFlip ? { fromId: targetId, toId: sourceId } : { fromId: sourceId, toId: targetId };
}

const RELATION_LABEL: Record<string, string> = {
  parent_of: 'Parent', child_of: 'Child', sibling_of: 'Sibling', spouse_of: 'Spouse',
  grandparent_of: 'Grandparent', grandchild_of: 'Grandchild', aunt_of: 'Aunt', uncle_of: 'Uncle',
  cousin_of: 'Cousin', in_law_of: 'In-law', step_parent_of: 'Step-parent', step_sibling_of: 'Step-sibling',
  half_sibling_of: 'Half-sibling', related_to: 'Relative',
};

/** Generation of a member relative to the user (gen 0), keyed by the base
 *  relation the user picks in the editor ("member is my <relation>"). Also the
 *  allow-list of editable relations. */
const RELATION_GENERATION: Record<string, number> = { ...TREE_RELATION_GENERATION };

export type CharacterKinshipRow = {
  id: string;
  name: string;
  alias?: string[] | null;
  role?: string | null;
  archetype?: string | null;
  metadata?: Record<string, unknown> | null;
};

const ROMANTIC_OR_CRUSH_ARCHETYPES = new Set([
  'romantic',
  'crush',
  'unrequited_crush',
  'romantic_interest',
  'past_romantic',
  'one_night_stand',
]);

const KIN_RELATIONSHIP_TYPES =
  /^(parent|mother|father|sibling|brother|sister|cousin|aunt|uncle|grand|step|niece|nephew|in_law)/;

const EXPLICIT_KIN_IN_TEXT =
  /\b(?:my|his|her|their|our)\s+(?:grandmother|grandfather|mom|dad|mother|father|sister|brother|cousin|aunt|uncle|grandma|grandpa|abuela|abuelo|t[ií]o|t[ií]a|family)\b/;

function displayNameHasFamilyTitle(name: string): boolean {
  const normalized = String(name ?? '').toLowerCase().replace(/[._@-]+/g, ' ').trim();
  return /^(?:my\s+)?(?:t[ií]o|t[ií]a|uncle|aunt|mom|mother|dad|father|grandma|grandpa|abuela|abuelo|cousin|sister|brother)(?:\s|$)/i.test(
    normalized,
  );
}

function hasExplicitKinPhrase(...values: unknown[]): boolean {
  return values.some((value) => {
    if (Array.isArray(value)) {
      return value.some((item) => EXPLICIT_KIN_IN_TEXT.test(String(item ?? '').toLowerCase()));
    }
    return EXPLICIT_KIN_IN_TEXT.test(String(value ?? '').toLowerCase());
  });
}

function isUserPinnedBookCategory(metadata: Record<string, unknown>, category: string): boolean {
  const source = String(metadata.book_category_source ?? '').toLowerCase();
  if (source !== 'user' && source !== 'user_confirmed') return false;
  return String(metadata.book_category ?? '').toLowerCase().trim() === category;
}

function isGenericFamilyEdgeType(type: string): boolean {
  return GENERIC_FAMILY_BUCKET_TYPES.has((type ?? '').toLowerCase());
}

/** True when this card is allowed on the family tree (and therefore the Family tab). */
export function isFamilyTreeEligibleCharacter(row: CharacterKinshipRow): boolean {
  const metadata = row.metadata ?? {};
  if (isFamilyExcluded(metadata)) return false;
  const categorySource = String(metadata.book_category_source ?? '').toLowerCase();
  const pinnedCategory = String(metadata.book_category ?? '').toLowerCase().trim();
  if ((categorySource === 'user' || categorySource === 'user_confirmed') && pinnedCategory && pinnedCategory !== 'family') {
    return false;
  }
  const archetype = String(row.archetype ?? '').split(',')[0]?.trim().toLowerCase();
  if (
    ROMANTIC_OR_CRUSH_ARCHETYPES.has(archetype) &&
    metadata.family_reviewed !== true &&
    !metadata.family_override &&
    !metadata.kinship_label &&
    pinnedCategory !== 'family'
  ) {
    return false;
  }
  return true;
}

/**
 * Strong kinship / user pin — used for name inference and for generic
 * `family` / `related_to` edges. Typed kin edges (`cousin_of`, …) can still
 * admit an eligible card that fails this bar.
 */
export function characterHasFamilyTreeSignal(row: CharacterKinshipRow): boolean {
  return hasFamilySignal(row);
}

function shouldAdmitRootFamilyEdge(
  rootId: string,
  sourceId: string,
  targetId: string,
  rawType: string,
  normalizedType: string,
  charactersById: Map<string, CharacterKinshipRow>,
): boolean {
  const otherId = sourceId === rootId ? targetId : targetId === rootId ? sourceId : null;
  if (!otherId) return true;
  const other = charactersById.get(otherId);
  if (!other) return false;
  const generic = isGenericFamilyEdgeType(rawType) && isGenericFamilyEdgeType(normalizedType);
  if (generic && !hasFamilySignal(other)) return false;
  return true;
}

function isFamilyType(type: string): boolean {
  const t = (type ?? '').toLowerCase();
  // possible_family is suggest-only and must not enter tree edge walks.
  if (t === 'possible_family') return false;
  return FAMILY_TYPES.has(t) || t.includes('parent') || t.includes('sibling') || t === 'family';
}

function normalizeRelationshipType(type: string): string {
  return normalizeFamilyEdgeType(type);
}

function relationFromType(type: string, delta: number): FamilyRelationType {
  const t = type.toLowerCase();
  if (t.includes('aunt')) return 'aunt';
  if (t.includes('uncle')) return 'uncle';
  if (t.includes('cousin')) return 'cousin';
  if (t.includes('grandparent') || t === 'grandmother' || t === 'grandfather' || delta <= -2) return 'grandparent';
  if (t.includes('grandchild') || t === 'grandson' || t === 'granddaughter' || t === 'nieto' || t === 'nieta' || delta >= 2) return 'grandchild';
  if (t.includes('half_sibling')) return 'half_sibling';
  if (t.includes('step_sibling')) return 'step_sibling';
  if (t.includes('step_parent')) return 'step_parent';
  if (t.includes('adopted_parent')) return 'adopted_parent';
  if (t.includes('adopted_child')) return 'adopted_child';
  if (t.includes('godparent')) return 'godparent';
  if (t.includes('godchild')) return 'godchild';
  if (t.includes('in_law')) return 'in_law';
  if (t.includes('sibling') || t === 'brother' || t === 'sister') return 'sibling';
  if (t.includes('parent') || t === 'mother' || t === 'father' || delta === -1) return 'parent';
  if (t.includes('child') || delta === 1) return 'child';
  if (t.includes('spouse')) return 'spouse';
  return 'related';
}

function labelForRelation(relation: FamilyRelationType, name: string, evidence?: string): string {
  if (evidence?.trim()) {
    const short = evidence.trim().slice(0, 40);
    if (/^(my|our|mi)\s/i.test(short)) return short.replace(/^(my|our|mi)\s/i, '').trim() || relation;
  }
  const map: Record<FamilyRelationType, string> = {
    parent: 'Parent', child: 'Child', sibling: 'Sibling', twin: 'Twin',
    grandparent: 'Grandparent', grandchild: 'Grandchild', aunt: 'Aunt', uncle: 'Uncle',
    cousin: 'Cousin', spouse: 'Spouse', in_law: 'In-law', step_parent: 'Step-parent',
    step_child: 'Step-child', step_sibling: 'Step-sibling', half_sibling: 'Half-sibling',
    adopted_parent: 'Adoptive parent', adopted_child: 'Adopted child',
    godparent: 'Godparent', godchild: 'Godchild', niece: 'Niece', nephew: 'Nephew',
    related: 'Relative',
  };
  return map[relation] ?? name.split(' ')[0];
}

function searchableKinshipText(row: CharacterKinshipRow): string {
  const metadata = row.metadata ?? {};
  return [
    row.name,
    ...(row.alias ?? []),
    row.role,
    row.archetype,
    metadata.relationship_type,
    metadata.context,
    metadata.relationship_categories,
  ]
    .flat()
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function primaryKinshipText(row: CharacterKinshipRow): string {
  const metadata = row.metadata ?? {};
  return [
    row.name,
    row.role,
    row.archetype,
    metadata.relationship_type,
    metadata.relationship_categories,
  ]
    .flat()
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function hasFamilySignal(row: CharacterKinshipRow): boolean {
  const metadata = row.metadata ?? {};
  if (isFamilyExcluded(metadata)) return false;

  if (isUserPinnedBookCategory(metadata, 'family')) return true;
  const categorySource = String(metadata.book_category_source ?? '').toLowerCase();
  const pinnedCategory = String(metadata.book_category ?? '').toLowerCase().trim();
  if ((categorySource === 'user' || categorySource === 'user_confirmed') && pinnedCategory) {
    return false;
  }

  const archetype = String(row.archetype ?? '').split(',')[0]?.trim().toLowerCase();
  if (
    ROMANTIC_OR_CRUSH_ARCHETYPES.has(archetype) &&
    metadata.family_reviewed !== true &&
    !metadata.family_override &&
    !metadata.kinship_label
  ) {
    return false;
  }

  const isPublicFigure = metadata.public_figure === true;
  const nameKind = (metadata.nameProfile as { kind?: string } | undefined)?.kind;
  const role = String(row.role ?? '').toLowerCase().trim();
  const explicitKin =
    Boolean(String(metadata.kinship_label ?? metadata.kinship_role ?? '').trim()) ||
    displayNameHasFamilyTitle(row.name) ||
    KIN_RELATIONSHIP_TYPES.test(role) ||
    KIN_RELATIONSHIP_TYPES.test(String(metadata.relationship_type ?? '').toLowerCase()) ||
    KIN_RELATIONSHIP_TYPES.test(String(metadata.relationship_to_user ?? '').toLowerCase()) ||
    hasExplicitKinPhrase(row.name, row.alias, row.role, metadata.context);

  // A card the user confirmed DISTINCT from another character must not enter
  // the family tree on bare relationship_type metadata alone — that's how a
  // shared given name (Oscuridad's "Juan" vs Tío Juan) cross-wires kin. It
  // needs a real kinship anchor: a kinship_label, family archetype, or a
  // kinship word in its own name/story.
  const confirmedDistinct = Array.isArray(metadata.confirmed_distinct_from) && metadata.confirmed_distinct_from.length > 0;
  if (confirmedDistinct && !explicitKin) {
    return false;
  }

  if (isPublicFigure && !explicitKin) {
    return false;
  }

  // Stage-name / handle profiles are social identities, not kin labels.
  if ((nameKind === 'stage_name' || nameKind === 'handle') && !explicitKin) {
    return false;
  }

  return explicitKin;
}

// Kinship terms a user might use as the person's name/alias. Longer/more
// specific terms first so "abuelita" wins over "abuela".
const KINSHIP_TERMS = [
  'abuelita', 'abuelito', 'abuela', 'abuelo', 'grandmother', 'grandma', 'grandfather', 'grandpa',
  'auntie', 'tía', 'tia', 'aunt', 'tío', 'tio', 'uncle', 'prima', 'primo', 'cousin',
  'mamá', 'mama', 'mom', 'mother', 'papá', 'papa', 'dad', 'father',
  'hermano', 'hermana', 'brother', 'sister',
];

function titleCaseTerm(term: string): string {
  return term.charAt(0).toUpperCase() + term.slice(1);
}

/** The kinship term the user calls this person (from name/aliases), e.g. "Abuela". */
function kinshipTermFor(row: CharacterKinshipRow): string | undefined {
  const candidates = [row.name, ...(row.alias ?? [])].filter(Boolean) as string[];
  for (const candidate of candidates) {
    const lc = candidate.toLowerCase();
    for (const term of KINSHIP_TERMS) {
      if (new RegExp(`\\b${term}\\b`, 'i').test(lc)) return titleCaseTerm(term);
    }
  }
  return undefined;
}

function classifyKinship(row: CharacterKinshipRow): { relation: FamilyRelationType; label: string; generation: number; side: 'maternal' | 'paternal' | 'both' | 'other' } | null {
  if (!hasFamilySignal(row)) return null;
  const text = searchableKinshipText(row);
  const primary = primaryKinshipText(row);

  if (/\b(tia|tía|aunt|auntie)\b/.test(primary)) {
    return { relation: 'aunt', label: 'Aunt', generation: -1, side: inferSide(text) ?? 'other' };
  }
  if (/\b(tio|tío|uncle)\b/.test(primary)) {
    return { relation: 'uncle', label: 'Uncle', generation: -1, side: inferSide(text) ?? 'other' };
  }
  if (/\b(cousin|primo|prima)\b/.test(primary) || row.role?.toLowerCase() === 'cousin') {
    return { relation: 'cousin', label: 'Cousin', generation: 0, side: inferSide(text) ?? 'other' };
  }
  if (/\b(abuela|abuelita|grandma|grandmother)\b/.test(primary)) {
    return { relation: 'grandparent', label: 'Grandmother', generation: -2, side: inferSide(text) ?? 'other' };
  }
  if (/\b(abuelo|abuelito|grandpa|grandfather)\b/.test(primary)) {
    return { relation: 'grandparent', label: 'Grandfather', generation: -2, side: inferSide(text) ?? 'other' };
  }
  if (/\b(tia|tía|aunt|auntie)\b/.test(text)) {
    return { relation: 'aunt', label: 'Aunt', generation: -1, side: inferSide(text) ?? 'other' };
  }
  if (/\b(tio|tío|uncle)\b/.test(text)) {
    return { relation: 'uncle', label: 'Uncle', generation: -1, side: inferSide(text) ?? 'other' };
  }
  if (/\b(cousin|primo|prima)\b/.test(text) || row.role?.toLowerCase() === 'cousin') {
    return { relation: 'cousin', label: 'Cousin', generation: 0, side: inferSide(text) ?? 'other' };
  }
  if (/\b(mom|mother|mamá|mama)\b/.test(text)) {
    return { relation: 'parent', label: 'Mother', generation: -1, side: 'maternal' };
  }
  if (/\b(dad|father|papá|papa)\b/.test(text)) {
    return { relation: 'parent', label: 'Father', generation: -1, side: 'paternal' };
  }
  if (/\b(brother|sister|sibling)\b/.test(text)) {
    return { relation: 'sibling', label: 'Sibling', generation: 0, side: inferSide(text) ?? 'other' };
  }
  return null;
}

type LeadingKinship = { relation: FamilyRelationType; label: string; generation: number; side: 'maternal' | 'paternal' | 'both' | 'other' };

/**
 * Infer kinship ONLY when a name is title-leading — the kinship word is the first
 * token (optionally after step/grand/great/half). This distinguishes real kin
 * ("Tío Juan", "Abuela", "Step Dad Ben") from stage names/handles where a kinship
 * word is a trailing suffix or inside a handle ("Goth Tio", "Oscuri.dad",
 * "Mom Jeans"). Returns null for non-kin so they stay generic `related`.
 */
function inferLeadingKinship(rawName: string): LeadingKinship | null {
  const name = (rawName ?? '').trim();
  if (!name) return null;
  // Handle/stage-name shapes: a dot/at/digit inside the token (Oscuri.dad, x_tio_2) → not kin.
  if (/[.@\d]/.test(name)) return null;
  const lower = name.toLowerCase().replace(/['’]/g, "'");
  // Strip a leading possessive/article ("my tío juan").
  const s = lower.replace(/^(my|our|the)\s+/, '');
  const step = /^step[-\s]?/.test(s);
  const body = s.replace(/^step[-\s]?/, '').replace(/^great[-\s]?/, '');

  const test = (re: RegExp) => re.test(body);
  // Grandparents (also matches "grand ma/pa")
  if (test(/^(abuel(?:a|ita)|grand\s?ma|grandmother|nana|nonna|granny)\b/))
    return { relation: 'grandparent', label: 'Grandmother', generation: -2, side: 'other' };
  if (test(/^(abuel(?:o|ito)|grand\s?pa|grandfather|nono)\b/))
    return { relation: 'grandparent', label: 'Grandfather', generation: -2, side: 'other' };
  // Parents
  if (test(/^(mom|mother|mamá|mama|mommy)\b/))
    return { relation: step ? 'step_parent' : 'parent', label: step ? 'Step-mother' : 'Mother', generation: -1, side: 'maternal' };
  if (test(/^(dad|father|papá|papa|daddy)\b/))
    return { relation: step ? 'step_parent' : 'parent', label: step ? 'Step-father' : 'Father', generation: -1, side: 'paternal' };
  // Aunts / uncles (title-leading, e.g. "Tía Grace", "Uncle Bob")
  if (test(/^(t[íi]a|aunt|auntie)\b/))
    return { relation: 'aunt', label: 'Aunt', generation: -1, side: 'other' };
  if (test(/^(t[íi]o|uncle)\b/))
    return { relation: 'uncle', label: 'Uncle', generation: -1, side: 'other' };
  // Cousins / siblings
  if (test(/^(primo|prima|cousin)\b/))
    return { relation: 'cousin', label: 'Cousin', generation: 0, side: 'other' };
  if (test(/^(hermano|hermana|brother|sister)\b/))
    return { relation: step ? 'step_sibling' : 'sibling', label: 'Sibling', generation: 0, side: 'other' };
  return null;
}

class FamilyTreeService {
  /** The user's own character row, only when explicitly marked as self/protagonist. */
  async findUserCharacterId(userId: string): Promise<string | null> {
    const { data } = await supabaseAdmin
      .from('characters')
      .select('id, name, importance_level, metadata')
      .eq('user_id', userId)
      .order('importance_score', { ascending: false })
      .limit(50);

    const rows = (data ?? []) as Array<{ id: string; name: string; importance_level?: string; metadata?: Record<string, unknown> }>;
    const self = rows.find(r =>
      r.metadata?.is_self === true ||
      /^you$/i.test(r.name) ||
      r.importance_level === 'protagonist'
    );
    return self?.id ?? null;
  }

  /** User's personal family tree (centered on the user character). */
  async getUserFamilyTree(userId: string): Promise<FamilyTreeDTO | null> {
    // Sync surname + shared-parent cousins (e.g. Jerry/James Medina under Tía Grace)
    // before reading so connectors and character trees stay bidirectional.
    // Also soft-fill sex from kinship titles (Mom → female, Dad → male, …).
    try {
      const { familySurnameSuggestionService } = await import('./kinship/familySurnameSuggestionService');
      await familySurnameSuggestionService.reconcileTreePlacedSurnameLinks(userId);
      const { reconcileKinshipSexForUser } = await import('./kinship/reconcileKinshipSex');
      await reconcileKinshipSexForUser(userId);
    } catch {
      // non-fatal
    }
    const selfId = await this.findUserCharacterId(userId);
    const tree = await this.buildUserCenteredFamilyTree(userId, selfId);
    const enriched = tree ? this.enrichRelationsFromNames(tree) : tree;
    return this.applyOverridesAndReview(userId, enriched);
  }

  /**
   * Kids shared between the account owner and a romantic partner, for the
   * Dating & Romance "Kids Together" tab. A kid is "together" when both the
   * self and the partner are independently recorded as parents — that's
   * directly observed in the family tree, so it's always shown regardless of
   * relationship type. Any additional parent on that same kid — an ex,
   * another co-parent — surfaces as `coParents`.
   *
   * A kid who belongs to only ONE of them (self's kid from a prior relationship,
   * or the partner's) is only labeled a "step-kid" when `relationshipType`
   * signals real commitment (married/engaged/partner-level, or a relationship
   * type that IS a co-parenting label). The family tree has no per-partner
   * "is this specific person a step-parent to this specific kid" edge, so
   * without that gate every one of self's kids would show up as a step-kid
   * for every partner ever added — including a brand-new crush or a casual
   * situationship who has never even met them.
   */
  async getKidsTogetherForRelationship(
    userId: string,
    partnerCharacterId: string | null,
    relationshipType?: string | null,
  ): Promise<
    Array<{
      id: string;
      name: string;
      relation: 'together' | 'step';
      belongsTo: 'both' | 'self' | 'partner';
      coParents: Array<{ id: string; name: string }>;
    }>
  > {
    if (!partnerCharacterId) return [];
    const tree = await this.getUserFamilyTree(userId);
    if (!tree || !tree.self_id || tree.self_id === partnerCharacterId) return [];

    const edges = collectAbsoluteParentChildEdges(tree);
    if (edges.length === 0) return [];

    const nameById = new Map(tree.members.map((m) => [m.id, m.name]));
    const selfId = tree.self_id;
    const childrenOf = (parentId: string) =>
      new Set(edges.filter((e) => e.parentId === parentId).map((e) => e.childId));

    const selfKids = childrenOf(selfId);
    const partnerKids = childrenOf(partnerCharacterId);
    const allKidIds = new Set<string>([...selfKids, ...partnerKids]);
    if (allKidIds.size === 0) return [];

    const canInferStepKids = isCommittedOrCoParentRelationshipType(relationshipType);

    return [...allKidIds]
      .filter((childId) => (selfKids.has(childId) && partnerKids.has(childId)) || canInferStepKids)
      .map((childId) => {
        const together = selfKids.has(childId) && partnerKids.has(childId);
        const otherParentIds = edges
          .filter((e) => e.childId === childId && e.parentId !== selfId && e.parentId !== partnerCharacterId)
          .map((e) => e.parentId);
        return {
          id: childId,
          name: nameById.get(childId) ?? 'Unknown',
          relation: together ? ('together' as const) : ('step' as const),
          belongsTo: together ? ('both' as const) : selfKids.has(childId) ? ('self' as const) : ('partner' as const),
          coParents: [...new Set(otherParentIds)].map((id) => ({ id, name: nameById.get(id) ?? 'Unknown' })),
        };
      });
  }

  /**
   * Pets shared with (or brought into) a romantic relationship — the animal
   * half of the "Kids & Pets Together" tab. Ownership lives on the household
   * edge (`owner_of` / `pet_of`), not the kinship tree, so this reads those
   * edges directly rather than walking generations.
   *
   * A pet only one side owns is gated the same way step-kids are: without it,
   * the user's own dog would surface under every crush they ever logged.
   */
  async getPetsTogetherForRelationship(
    userId: string,
    partnerCharacterId: string | null,
    relationshipType?: string | null,
  ): Promise<
    Array<{
      id: string;
      name: string;
      relation: 'together' | 'step';
      belongsTo: 'both' | 'self' | 'partner';
      species: string | null;
    }>
  > {
    if (!partnerCharacterId) return [];
    const tree = await this.getUserFamilyTree(userId);
    const selfId = tree?.self_id;
    if (!selfId || selfId === partnerCharacterId) return [];

    const ownerType = normalizeFamilyEdgeType('owner');
    const petType = normalizeFamilyEdgeType('pet');
    const anchors = [selfId, partnerCharacterId];

    try {
      const [owned, owning] = await Promise.all([
        supabaseAdmin
          .from('character_relationships')
          .select('source_character_id, target_character_id')
          .eq('user_id', userId)
          .eq('relationship_type', ownerType)
          .in('source_character_id', anchors),
        supabaseAdmin
          .from('character_relationships')
          .select('source_character_id, target_character_id')
          .eq('user_id', userId)
          .eq('relationship_type', petType)
          .in('target_character_id', anchors),
      ]);

      const ownersByPet = new Map<string, Set<string>>();
      const record = (petId: string, ownerId: string) => {
        if (!petId || anchors.includes(petId)) return;
        const owners = ownersByPet.get(petId) ?? new Set<string>();
        owners.add(ownerId);
        ownersByPet.set(petId, owners);
      };
      for (const row of owned.data ?? []) record(row.target_character_id, row.source_character_id);
      for (const row of owning.data ?? []) record(row.source_character_id, row.target_character_id);

      if (ownersByPet.size === 0) return [];

      const canInferOneSided = isCommittedOrCoParentRelationshipType(relationshipType);
      const petIds = [...ownersByPet.keys()].filter((petId) => {
        const owners = ownersByPet.get(petId)!;
        return (owners.has(selfId) && owners.has(partnerCharacterId)) || canInferOneSided;
      });
      if (petIds.length === 0) return [];

      const { data: characters } = await supabaseAdmin
        .from('characters')
        .select('id, name, species')
        .eq('user_id', userId)
        .in('id', petIds);

      const byId = new Map((characters ?? []).map((c) => [c.id as string, c]));

      return petIds
        .filter((petId) => byId.has(petId))
        .map((petId) => {
          const owners = ownersByPet.get(petId)!;
          const shared = owners.has(selfId) && owners.has(partnerCharacterId);
          const character = byId.get(petId)!;
          return {
            id: petId,
            name: (character.name as string) ?? 'Unknown',
            relation: shared ? ('together' as const) : ('step' as const),
            belongsTo: shared ? ('both' as const) : owners.has(selfId) ? ('self' as const) : ('partner' as const),
            species: (character.species as string | null) ?? null,
          };
        });
    } catch (err) {
      logger.debug({ err, userId, partnerCharacterId }, 'getPetsTogetherForRelationship failed (non-fatal)');
      return [];
    }
  }

  /**
   * Hierarchy fallback: family edges are often stored as a generic `related`
   * relationship, which collapses everyone to generation 0. Re-derive relation +
   * generation from kinship keywords — but ONLY when the name is TITLE-LEADING
   * ("Tío Juan", "Abuela", "Step Dad Ben"), never when the kinship word is a
   * trailing suffix or inside a handle ("Goth Tio", "Oscuri.dad", "Mom Jeans").
   * Those are stage names, not kin. An explicit family edge or metadata.kinship
   * (relation !== 'related') always wins and is left untouched, so a user
   * correction in conversation overrides this name heuristic.
   */
  private enrichRelationsFromNames(tree: FamilyTreeDTO): FamilyTreeDTO {
    let changed = false;
    const members = tree.members.map((m) => {
      if (m.is_self || m.is_placeholder) return m;
      if (m.relation && m.relation !== 'related') return m; // explicit/context relation wins
      const inferred = inferLeadingKinship(m.name);
      if (!inferred) return m;
      changed = true;
      return {
        ...m,
        relation: inferred.relation,
        relation_label: inferred.label,
        generation: inferred.generation,
        side: inferred.side,
        kinship_title: m.kinship_title ?? inferred.label,
        inference_status: m.inference_status ?? 'inferred',
      };
    });
    if (!changed) return tree;
    members.sort((a, b) => a.generation - b.generation || a.relation.localeCompare(b.relation) || a.name.localeCompare(b.name));
    return this.withInferredParentPlaceholders({ ...tree, members });
  }

  /** Family tree centered on a specific character. */
  async getCharacterFamilyTree(
    userId: string,
    characterId: string,
    opts: { isUserTree?: boolean; rebuild?: boolean } = {}
  ): Promise<FamilyTreeDTO | null> {
    try {
      // Prefer the account shared family graph when this character is already
      // on the user's tree — blood kin see the SAME roster re-rooted onto them.
      // Affinity kin (step-parents, in-laws, …) get a scoped household tree so
      // a step-dad does not inherit the user's maternal blood line.
      const shared = await this.getUserFamilyTree(userId);
      if (shared?.members?.some((m) => m.id === characterId)) {
        const egoOnShared = shared.members.find((m) => m.id === characterId)!;
        const projected = isAffinityKinOnSharedTree(egoOnShared)
          ? projectAffinityFamilyTreeOntoEgo(shared, characterId)
          : projectSharedFamilyTreeOntoEgo(shared, characterId);
        return this.applyOverridesAndReview(userId, projected);
      }

      if (opts.rebuild) {
        await relationshipTreeBuilder.buildTree(userId, characterId, 'character', 'family', 4);
      }

      const edges = await this.loadFamilyEdges(userId, characterId);
      // Include user-asserted tree placements (family_override.connects_to_id)
      // so a cousin's tree shows their aunt even before a parent_of row exists.
      edges.push(...(await this.loadOverridePlacementEdges(userId, characterId)));
      // Shared-parent siblings / reverse parent edges so character trees are bidirectional.
      edges.push(...inferSiblingAndInverseParentEdges(edges));
      if (edges.length === 0) {
        // Fallback: relationship tree builder
        const built = await relationshipTreeBuilder.buildTree(userId, characterId, 'character', 'family', 4);
        if (built) {
          for (const rel of built.relationships) {
            if (rel.category === 'family' || isFamilyType(rel.type)) {
              edges.push({
                fromId: rel.fromId,
                toId: rel.toId,
                type: normalizeRelationshipType(rel.type),
                confidence: rel.confidence,
              });
            }
          }
          edges.push(...inferSiblingAndInverseParentEdges(edges));
        }
      }

      // A character's family tree may only contain kin REACHABLE from that
      // character through family edges. The generic tree-builder fallback walks
      // mixed relationship paths, which can drag in the user's own family — a
      // shared given name or mutual friend must never graft two trees together.
      const reachable = new Set<string>([characterId]);
      let grew = true;
      while (grew) {
        grew = false;
        for (const e of edges) {
          if (reachable.has(e.fromId) && !reachable.has(e.toId)) { reachable.add(e.toId); grew = true; }
          if (reachable.has(e.toId) && !reachable.has(e.fromId)) { reachable.add(e.fromId); grew = true; }
        }
      }
      const connectedEdges = edges.filter((e) => reachable.has(e.fromId) && reachable.has(e.toId));

      const { data: rootChar } = await supabaseAdmin
        .from('characters')
        .select('id, name, importance_score, metadata')
        .eq('id', characterId)
        .eq('user_id', userId)
        .single();

      if (!rootChar) return null;

      const memberIds = [characterId, ...connectedEdges.flatMap(e => [e.fromId, e.toId])];
      const names = await this.loadNames(userId, memberIds);
      names.set(characterId, rootChar.name);
      const sexHints = await this.loadSexHints(userId, memberIds);

      const tree = this.buildTreeFromEdges(characterId, rootChar.name, connectedEdges, names, {
        markSelf: opts.isUserTree ?? false,
        selfId: characterId,
      }, sexHints);
      const enriched = this.enrichRelationsFromNames(tree);
      return this.applyOverridesAndReview(userId, enriched);
    } catch (error) {
      logger.error({ error, userId, characterId }, 'Failed to build character family tree');
      return null;
    }
  }

  /** Family tree for a family-type organization (all member kinship). */
  async getOrganizationFamilyTree(userId: string, organizationId: string): Promise<FamilyTreeDTO | null> {
    try {
      const org = await organizationService.getOrganization(userId, organizationId);
      if (!org) return null;

      const members = await organizationService.getMembers(organizationId);
      const charIds = [...new Set(members.map(m => m.character_id).filter((id): id is string => Boolean(id)))];
      if (charIds.length === 0) {
        // Name-only members → flat roster at gen 0
        const selfId = await this.findUserCharacterId(userId);
        const roster: FamilyMemberDTO[] = members.map((m, i) => ({
          id: m.character_id ?? `name-${i}`,
          name: m.character_name,
          first_name: m.character_name.split(' ')[0],
          relation: 'related',
          relation_label: m.role ?? 'Member',
          generation: 0,
          is_self: m.character_id === selfId,
        }));
        return {
          members: roster,
          branches: [{ side: 'other', label: org.name, color: '#a855f7' }],
          self_id: selfId ?? roster[0]?.id ?? '',
        };
      }

      const edges: Array<{ fromId: string; toId: string; type: string; confidence: number }> = [];
      const { data: rels } = await supabaseAdmin
        .from('character_relationships')
        .select('source_character_id, target_character_id, relationship_type, closeness_score, metadata')
        .eq('user_id', userId)
        .in('source_character_id', charIds);

      for (const r of (rels ?? []) as Array<{ source_character_id: string; target_character_id: string; relationship_type: string; closeness_score?: number; metadata?: Record<string, unknown> }>) {
        if (!charIds.includes(r.target_character_id)) continue;
        if (!isFamilyType(r.relationship_type)) continue;
        edges.push({
          fromId: r.source_character_id,
          toId: r.target_character_id,
          type: r.relationship_type,
          confidence: 0.7,
        });
      }

      const selfId = (await this.findUserCharacterId(userId)) ?? charIds[0];
      const anchor = charIds.includes(selfId) ? selfId : charIds[0];
      const names = await this.loadNames(userId, charIds);
      for (const m of members) {
        if (m.character_id) names.set(m.character_id, m.character_name);
      }
      const sexHints = await this.loadSexHints(userId, charIds);

      const tree = this.buildTreeFromEdges(anchor, names.get(anchor) ?? org.name, edges, names, {
        markSelf: true,
        selfId,
        restrictIds: new Set(charIds),
      }, sexHints);

      // Ensure every org member appears even if no edges
      for (const m of members) {
        const id = m.character_id ?? m.character_name;
        if (!tree.members.some(x => x.id === id)) {
          tree.members.push({
            id,
            name: m.character_name,
            first_name: m.character_name.split(' ')[0],
            relation: 'related',
            relation_label: m.role ?? 'Member',
            generation: 0,
          });
        }
      }

      tree.branches = [
        { side: 'maternal', label: 'Maternal', color: '#f472b6' },
        { side: 'paternal', label: 'Paternal', color: '#60a5fa' },
        { side: 'other', label: org.name, color: '#a855f7' },
      ];
      return this.applyOverridesAndReview(userId, tree);
    } catch (error) {
      logger.error({ error, userId, organizationId }, 'Failed to build organization family tree');
      return null;
    }
  }

  /** All group affiliations for a character (multiple orgs/cliques/teams). */
  async getCharacterAffiliations(userId: string, characterId: string, characterName?: string) {
    return organizationService.getOrganizationsByCharacter(userId, characterId, characterName);
  }

  async getMemberAffiliationsForOrganization(userId: string, organizationId: string) {
    return organizationService.getMemberAffiliationsBatch(userId, organizationId);
  }

  // ── Manual edits (persist + teach) ────────────────────────────────────────
  // These let the user curate the derived tree. Because the tree re-derives on
  // every load, each edit writes durable state the builder reads back: an
  // exclusion flag, an asserted relationship edge, or an actual deletion.

  /**
   * Remove a person from the family tree but keep them as a character ("they
   * don't belong here, but they're real"). Sets a metadata flag the builder
   * filters on, so they don't get re-inferred back in.
   */
  async excludeMember(userId: string, characterId: string, reason?: string): Promise<boolean> {
    if (isSyntheticNodeId(characterId)) return false;
    const { data: character } = await supabaseAdmin
      .from('characters')
      .select('id, name, metadata')
      .eq('id', characterId)
      .eq('user_id', userId)
      .maybeSingle();
    if (!character) return false;

    const previous = { ...((character.metadata as Record<string, unknown>) ?? {}) };
    const metadata: Record<string, unknown> = {
      ...previous,
      family_excluded: { value: true, reason: reason ?? null, at: new Date().toISOString() },
    };
    const pinnedFamily = isUserPinnedBookCategory(previous, 'family');
    if (pinnedFamily || String(previous.book_category ?? '').toLowerCase().trim() === 'family') {
      delete metadata.book_category;
      metadata.book_category_source = 'user_cleared';
      metadata.book_category_reason = 'Removed from the family tree.';
      metadata.book_category_previous = 'family';
    }
    const { error } = await supabaseAdmin
      .from('characters')
      .update({ metadata })
      .eq('id', characterId)
      .eq('user_id', userId);
    if (error) {
      logger.error({ error, userId, characterId }, 'Failed to exclude family member');
      return false;
    }

    const { identityLedgerService } = await import('./identity/identityLedgerService');
    await identityLedgerService.recordMutation({
      userId,
      entityId: characterId,
      entityType: 'character',
      mutationType: 'RELATIONSHIP_REMOVED',
      previousValue: { in_family_tree: true },
      newValue: { in_family_tree: false },
      reason: reason ?? 'Removed from family tree',
      source: 'USER',
      metadata: { operation_type: 'family_exclude' },
    });
    return true;
  }

  /** Confirm a flagged member really is family — clears the review flag so it
   *  isn't surfaced again. */
  async keepMember(userId: string, characterId: string): Promise<boolean> {
    if (isSyntheticNodeId(characterId)) return false;
    const { data: character } = await supabaseAdmin
      .from('characters')
      .select('id, metadata')
      .eq('id', characterId)
      .eq('user_id', userId)
      .maybeSingle();
    if (!character) return false;
    const metadata = { ...((character.metadata as Record<string, unknown>) ?? {}), family_reviewed: true };
    const { error } = await supabaseAdmin
      .from('characters')
      .update({ metadata })
      .eq('id', characterId)
      .eq('user_id', userId);
    if (error) {
      logger.error({ error, userId, characterId }, 'Failed to keep family member');
      return false;
    }
    return true;
  }

  /**
   * Delete a character entirely — it shouldn't be a character at all (a
   * mis-extracted entity). Teaches the extractor not to recreate it via the
   * entity-learning ledger.
   */
  async deleteMember(userId: string, characterId: string, reason?: string): Promise<boolean> {
    if (isSyntheticNodeId(characterId)) return false;
    const { data: character } = await supabaseAdmin
      .from('characters')
      .select('id, name, alias, status')
      .eq('id', characterId)
      .eq('user_id', userId)
      .maybeSingle();
    if (!character) return false;

    // Characters use a two-phase lifecycle: a card must be queued
    // (pending_deletion) before it can be permanently removed. "Not a real
    // person" is an explicit user verdict, so move it through both steps in one
    // go rather than throwing "archive first".
    if (character.status !== 'pending_deletion') {
      const { error: statusErr } = await supabaseAdmin
        .from('characters')
        .update({ status: 'pending_deletion', updated_at: new Date().toISOString() })
        .eq('id', characterId)
        .eq('user_id', userId);
      if (statusErr) {
        logger.error({ error: statusErr, userId, characterId }, 'Failed to queue family member for deletion');
        return false;
      }
    }

    const { characterDeletionService } = await import('./characterDeletionService');
    const report = await characterDeletionService.deleteCharacter(userId, characterId, {
      redistribute: false,
      reason: reason ?? 'Not a real person (removed from family tree)',
    });
    if (!report) return false;

    const { entityLearningService } = await import('./entityLearningService');
    await entityLearningService.recordDeletionLearning({
      userId,
      domain: 'characters',
      entityId: characterId,
      name: character.name,
      aliases: Array.isArray(character.alias) ? (character.alias as string[]) : [],
      reason: reason ?? 'not_a_real_person',
    });
    return true;
  }

  /**
   * Correct how a member relates to the user. Stores an asserted override on the
   * character that the builder applies every load (see `applyRelationOverride`),
   * so the correction overrides name inference and survives rebuilds — without
   * collapsing an inference-based tree into edge-only mode. Also clears any
   * prior exclusion (correcting the relation re-includes them).
   */
  async setMemberRelationship(
    userId: string,
    characterId: string,
    input: { relation: string; connectsToId?: string; side?: 'maternal' | 'paternal' | 'both' | 'other' },
  ): Promise<boolean> {
    if (isSyntheticNodeId(characterId)) return false;
    const relation = normalizeTreeRelation(input.relation ?? '');
    if (!relation) return false;

    const { data: character } = await supabaseAdmin
      .from('characters')
      .select('id, metadata')
      .eq('id', characterId)
      .eq('user_id', userId)
      .maybeSingle();
    if (!character) return false;

    // A node can't be its own parent, and synthetic placeholders aren't valid
    // anchors. Empty → revert to inferred edge.
    const connectsToId =
      input.connectsToId && input.connectsToId !== characterId && !isSyntheticNodeId(input.connectsToId)
        ? input.connectsToId
        : null;

    const metadata = { ...((character.metadata as Record<string, unknown>) ?? {}) };
    delete metadata.family_excluded; // correcting the relation re-includes them
    metadata.family_override = {
      relation,
      side: input.side ?? null,
      connects_to_id: connectsToId,
      at: new Date().toISOString(),
    };
    const { error } = await supabaseAdmin
      .from('characters')
      .update({ metadata })
      .eq('id', characterId)
      .eq('user_id', userId);
    if (error) {
      logger.error({ error, userId, characterId }, 'Failed to set family relationship override');
      return false;
    }

    // Solidify the correction into the shared knowledge base, not just the tree
    // view: write real character_relationships edges so the tie shows up on both
    // characters' lore/history and feeds every consumer of relationships.
    //  - "<member> is my <relation>"  → member --<relation>_of--> you
    //  - explicit parent              → parent  --parent_of-->     member
    const selfId = await this.findUserCharacterId(userId);
    if (selfId && selfId !== characterId) {
      const relType = relation === 'related' ? 'related_to' : `${relation}_of`;
      await this.upsertFamilyEdge(userId, characterId, selfId, relType);
    }
    if (connectsToId) {
      await this.upsertFamilyEdge(userId, connectsToId, characterId, 'parent_of');
      await this.syncSiblingsUnderParent(userId, connectsToId);
    }

    const { identityLedgerService } = await import('./identity/identityLedgerService');
    await identityLedgerService.recordMutation({
      userId,
      entityId: characterId,
      entityType: 'character',
      mutationType: 'RELATIONSHIP_CREATED',
      newValue: { relation, side: input.side ?? null, connects_to_id: connectsToId },
      reason: `Set family relationship to ${relation}`,
      source: 'USER',
      metadata: { operation_type: 'family_rearrange', user_asserted: true },
    });
    return true;
  }

  /**
   * Persist a drag-to-reorder within one generation row. `orderedIds` is the
   * full left-to-right order the user dropped that row into — every id in it
   * gets a sequential family_display_order (see sortFamilyMembersForDisplay),
   * overwriting whatever order that row had before. Ids that don't resolve to
   * a real character owned by this user are silently skipped (a synthetic
   * placeholder can't carry a stored order).
   */
  async reorderMembers(userId: string, orderedIds: string[]): Promise<boolean> {
    const realIds = orderedIds.filter((id) => id && !isSyntheticNodeId(id));
    if (realIds.length === 0) return false;

    const { data: rows } = await supabaseAdmin
      .from('characters')
      .select('id, metadata')
      .eq('user_id', userId)
      .in('id', realIds);
    const byId = new Map((rows ?? []).map((r) => [r.id, r]));

    let wrote = false;
    for (let i = 0; i < realIds.length; i++) {
      const id = realIds[i];
      const row = byId.get(id);
      if (!row) continue;
      const metadata = { ...((row.metadata as Record<string, unknown>) ?? {}), family_display_order: i };
      const { error } = await supabaseAdmin.from('characters').update({ metadata }).eq('id', id).eq('user_id', userId);
      if (error) {
        logger.error({ error, userId, characterId: id }, 'Failed to save family tree row order');
        continue;
      }
      wrote = true;
    }
    return wrote;
  }

  /** Add an existing character card to a family tree centered on `anchorId`. */
  async addExistingFamilyMember(
    userId: string,
    anchorId: string,
    memberId: string,
    input: { relation: string; side?: 'maternal' | 'paternal' | 'both' | 'other' },
  ): Promise<boolean> {
    if (!anchorId || !memberId || anchorId === memberId) return false;
    if (isSyntheticNodeId(anchorId) || isSyntheticNodeId(memberId)) return false;
    const relation = normalizeTreeRelation(input.relation ?? '');
    if (!relation) return false;

    const { data: rows } = await supabaseAdmin
      .from('characters')
      .select('id, metadata')
      .eq('user_id', userId)
      .in('id', [anchorId, memberId]);
    if ((rows ?? []).length !== 2) return false;

    const relationshipType = relation === 'related' ? 'related_to' : `${relation}_of`;
    await this.upsertFamilyEdge(userId, memberId, anchorId, relationshipType);

    const member = (rows ?? []).find((row) => row.id === memberId) as
      | { id: string; metadata?: Record<string, unknown> | null }
      | undefined;
    const metadata = {
      ...((member?.metadata as Record<string, unknown> | null) ?? {}),
      family_reviewed: true,
      family_manual_add: {
        anchor_id: anchorId,
        relation,
        side: input.side ?? null,
        at: new Date().toISOString(),
      },
    };
    delete metadata.family_excluded;
    if (input.side) {
      metadata.family_override = {
        ...((metadata.family_override as Record<string, unknown> | undefined) ?? {}),
        side: input.side,
        at: new Date().toISOString(),
      };
    }

    const { error } = await supabaseAdmin
      .from('characters')
      .update({ metadata, updated_at: new Date().toISOString() })
      .eq('id', memberId)
      .eq('user_id', userId);
    if (error) {
      logger.error({ error, userId, anchorId, memberId }, 'Failed to mark manually added family member');
      return false;
    }

    const { identityLedgerService } = await import('./identity/identityLedgerService');
    await identityLedgerService.recordMutation({
      userId,
      entityId: memberId,
      entityType: 'character',
      mutationType: 'RELATIONSHIP_CREATED',
      newValue: { anchor_id: anchorId, relation, side: input.side ?? null },
      reason: `Added existing character to family tree as ${relation}`,
      source: 'USER',
      metadata: { operation_type: 'family_manual_add', user_asserted: true },
    });
    return true;
  }

  /**
   * Upsert a user-asserted family edge into the shared relationship graph.
   * Parent/child and sibling edges are written bidirectionally via familyEdgeWriter.
   */
  private async upsertFamilyEdge(
    userId: string,
    sourceId: string,
    targetId: string,
    relationshipType: string,
  ): Promise<void> {
    await upsertBidirectionalFamilyEdge(userId, sourceId, targetId, relationshipType, {
      source: 'family_tree_edit',
      inferenceStatus: 'asserted',
    });
  }

  /** Materialize sibling_of between every pair of children under the same parent. */
  private async syncSiblingsUnderParent(userId: string, parentId: string): Promise<void> {
    await syncSiblingsUnderParentShared(userId, parentId);
  }

  /**
   * Ensure a tree node maps to a real, saved character card — creating one if
   * missing (on-demand). Reuses the registry's self-guard + dedup so we never
   * spawn a duplicate or a second "self" card. Returns null when the registry
   * refuses (e.g. a known non-person) — the node shouldn't be a character.
   */
  async ensureMemberCard(
    userId: string,
    characterId: string,
    name: string,
  ): Promise<{ character: Record<string, unknown>; created: boolean } | null> {
    if (!isSyntheticNodeId(characterId)) {
      const { data } = await supabaseAdmin
        .from('characters')
        .select('*')
        .eq('id', characterId)
        .eq('user_id', userId)
        .maybeSingle();
      if (data) return { character: data as Record<string, unknown>, created: false };
    }

    const cleanName = (name ?? '').trim();
    if (!cleanName) return null;

    const { characterRegistry } = await import('./characterRegistry');
    return characterRegistry.runExclusive(userId, async () => {
      const decision = await characterRegistry.classifyForCreation(userId, cleanName);
      if (decision.action === 'merge') {
        const { data } = await supabaseAdmin
          .from('characters')
          .select('*')
          .eq('id', decision.characterId)
          .eq('user_id', userId)
          .maybeSingle();
        return data ? { character: data as Record<string, unknown>, created: false } : null;
      }
      if (decision.action !== 'create') return null; // reject/defer → not a character

      const finalName = decision.cleanName || cleanName;
      const parts = finalName.split(/\s+/);
      const now = new Date().toISOString();
      const { data, error } = await supabaseAdmin
        .from('characters')
        .insert({
          id: randomUUID(),
          user_id: userId,
          name: finalName,
          first_name: parts[0],
          last_name: parts.slice(1).join(' ') || null,
          status: 'active',
          archetype: 'family',
          has_met: true,
          metadata: { created_via: 'family_tree_ensure_card' },
          created_at: now,
          updated_at: now,
        })
        .select('*')
        .single();
      if (error) {
        logger.error({ error, userId, name: finalName }, 'Failed to create family member card');
        return null;
      }

      const { identityLedgerService } = await import('./identity/identityLedgerService');
      await identityLedgerService.recordMutation({
        userId,
        entityId: (data as { id: string }).id,
        entityType: 'character',
        mutationType: 'ENTITY_CREATED',
        newValue: { name: finalName },
        reason: 'Created character card from family tree node',
        source: 'USER',
        metadata: { operation_type: 'family_ensure_card' },
      });
      return { character: data as Record<string, unknown>, created: true };
    });
  }

  private async buildUserCenteredFamilyTree(userId: string, explicitSelfId: string | null): Promise<FamilyTreeDTO | null> {
    const selfId = explicitSelfId ?? VIRTUAL_USER_ID;
    const selfName = explicitSelfId ? 'You' : 'You';
    const members: FamilyMemberDTO[] = [{
      id: selfId,
      name: selfName,
      first_name: 'You',
      relation: 'related',
      relation_label: 'You',
      generation: 0,
      is_self: true,
      closeness: 100,
      inference_status: explicitSelfId ? 'asserted' : 'placeholder',
      notes: explicitSelfId ? undefined : 'Virtual root used until a self character exists.',
    }];

    if (explicitSelfId) {
      const edges = await this.loadFamilyEdges(userId, explicitSelfId);
      edges.push(...(await this.loadOverridePlacementEdges(userId, explicitSelfId)));
      edges.push(...inferSiblingAndInverseParentEdges(edges));
      if (edges.length > 0) {
        const { data: rootChar } = await supabaseAdmin
          .from('characters')
          .select('id, name')
          .eq('id', explicitSelfId)
          .eq('user_id', userId)
          .single();
        const selfTreeMemberIds = [explicitSelfId, ...edges.flatMap(e => [e.fromId, e.toId])];
        const names = await this.loadNames(userId, selfTreeMemberIds);
        names.set(explicitSelfId, rootChar?.name ?? 'You');
        const sexHints = await this.loadSexHints(userId, selfTreeMemberIds);
        const edgeTree = this.buildTreeFromEdges(explicitSelfId, rootChar?.name ?? 'You', edges, names, {
          markSelf: true,
          selfId: explicitSelfId,
        }, sexHints);
        if (edgeTree.members.length > 1) {
          // Merge name-inferred relatives so asserting one edge (e.g. setting a
          // parent) doesn't hide everyone who's only known by name inference.
          const inferredKin = await this.loadUserKinshipCandidates(userId, explicitSelfId);
          for (const kin of inferredKin) {
            if (!edgeTree.members.some(m => m.id === kin.id)) edgeTree.members.push(kin);
          }
          edgeTree.members.sort((a, b) => a.generation - b.generation || a.name.localeCompare(b.name));
          return this.withInferredParentPlaceholders(edgeTree);
        }
      }
    }

    const inferredKin = await this.loadUserKinshipCandidates(userId, explicitSelfId);
    for (const kin of inferredKin) {
      if (members.some(m => m.id === kin.id)) continue;
      members.push(kin);
    }

    return this.withInferredParentPlaceholders({
      members,
      branches: [
        { side: 'maternal', label: 'Maternal', color: '#f472b6' },
        { side: 'paternal', label: 'Paternal', color: '#60a5fa' },
        { side: 'other', label: 'Unknown / extended', color: '#a855f7' },
      ],
      self_id: selfId,
    });
  }

  private async loadUserKinshipCandidates(userId: string, explicitSelfId: string | null): Promise<FamilyMemberDTO[]> {
    const { data } = await supabaseAdmin
      .from('characters')
      .select('id, name, alias, role, archetype, metadata')
      .eq('user_id', userId)
      .order('name', { ascending: true })
      .limit(250);

    const members: FamilyMemberDTO[] = [];
    for (const row of (data ?? []) as CharacterKinshipRow[]) {
      if (row.id === explicitSelfId) continue;
      const kinship = classifyKinship(row);
      if (!kinship) continue;
      members.push({
        id: row.id,
        name: row.name,
        first_name: row.name.split(' ')[0],
        kinship_title: kinshipTermFor(row),
        relation: kinship.relation,
        relation_label: kinship.label,
        generation: kinship.generation,
        side: kinship.side,
        inference_status: 'inferred',
        notes: 'Inferred from character name, role, aliases, or source context.',
      });
    }
    members.sort((a, b) => a.generation - b.generation || a.relation.localeCompare(b.relation) || a.name.localeCompare(b.name));
    return members;
  }

  private withInferredParentPlaceholders(tree: FamilyTreeDTO): FamilyTreeDTO {
    const hasParent = tree.members.some(m => m.generation === -1 && (m.relation === 'parent' || m.relation === 'step_parent'));
    const needsParentBridge = tree.members.some(m =>
      m.generation <= -2 ||
      (m.generation === -1 && (m.relation === 'aunt' || m.relation === 'uncle'))
    );

    if (!hasParent && needsParentBridge) {
      tree.members.push({
        id: INFERRED_PARENT_ID,
        name: 'Parent not mentioned yet',
        first_name: 'Parent',
        relation: 'parent',
        relation_label: 'Inferred parent',
        generation: -1,
        side: 'other',
        is_placeholder: true,
        inference_status: 'placeholder',
        notes: 'Placeholder bridge: grandparents/aunts/uncles imply a parent, but the parent has not been named.',
      });
    }

    sortFamilyMembersForDisplay(tree.members);
    return tree;
  }

  private async loadFamilyEdges(userId: string, rootId: string) {
    const edges: Array<{ fromId: string; toId: string; type: string; confidence: number; evidence?: string }> = [];
    const seen = new Set<string>();

    const { data: charRows } = await supabaseAdmin
      .from('characters')
      .select('id, name, alias, role, archetype, metadata')
      .eq('user_id', userId);
    const charactersById = new Map(
      ((charRows ?? []) as CharacterKinshipRow[]).map((row) => [row.id, row]),
    );
    const excludedIds = new Set(
      ((charRows ?? []) as CharacterKinshipRow[])
        .filter((row) => !isFamilyTreeEligibleCharacter(row))
        .map((row) => row.id),
    );
    if (excludedIds.has(rootId)) return edges;

    const { data: out } = await supabaseAdmin
      .from('character_relationships')
      .select('source_character_id, target_character_id, relationship_type, relationship_category, relationship_role, closeness_score, metadata, summary, status')
      .eq('user_id', userId)
      .or(`source_character_id.eq.${rootId},target_character_id.eq.${rootId}`);

    for (const r of (out ?? []) as Array<{ source_character_id: string; target_character_id: string; relationship_type: string; relationship_category?: string | null; relationship_role?: string | null; closeness_score?: number; metadata?: Record<string, unknown>; summary?: string; status?: string }>) {
      if ((r.status ?? 'active') !== 'active') continue;
      if (excludedIds.has(r.source_character_id) || excludedIds.has(r.target_character_id)) continue;
      const metaKinship = typeof r.metadata?.kinship === 'string' ? String(r.metadata.kinship) : null;
      const rawType = r.relationship_role ?? metaKinship ?? r.relationship_type;
      if ((r.relationship_type ?? '').toLowerCase() === 'possible_family') continue;
      if (r.relationship_category !== 'family' && !isFamilyType(rawType) && !isFamilyType(r.relationship_type) && !isFamilyType(metaKinship ?? '')) continue;
      const type = normalizeRelationshipType(rawType);
      if (!shouldAdmitRootFamilyEdge(rootId, r.source_character_id, r.target_character_id, rawType, type, charactersById)) continue;
      const key = `${r.source_character_id}|${r.target_character_id}|${type}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const { fromId, toId } = resolveFamilyEdgeDirection(rootId, r.source_character_id, r.target_character_id, r.relationship_type, type);
      edges.push({
        fromId,
        toId,
        type,
        confidence: 0.75,
        evidence: (r.metadata?.evidence as string) ?? r.summary,
      });
    }

    // 2-hop: include family edges among people already linked to the root
    // (cousin↔cousin, aunt→other cousin) so character trees aren't a self-star.
    const neighborIds = [...new Set(edges.flatMap((e) => [e.fromId, e.toId]).filter((id) => id !== rootId))];
    if (neighborIds.length > 0) {
      const { data: among } = await supabaseAdmin
        .from('character_relationships')
        .select('source_character_id, target_character_id, relationship_type, relationship_category, relationship_role, metadata, summary, status')
        .eq('user_id', userId)
        .in('source_character_id', neighborIds)
        .in('target_character_id', neighborIds);
      for (const r of (among ?? []) as Array<{
        source_character_id: string;
        target_character_id: string;
        relationship_type: string;
        relationship_category?: string | null;
        relationship_role?: string | null;
        metadata?: Record<string, unknown>;
        summary?: string;
        status?: string;
      }>) {
        if ((r.status ?? 'active') !== 'active') continue;
        if (excludedIds.has(r.source_character_id) || excludedIds.has(r.target_character_id)) continue;
        if ((r.relationship_type ?? '').toLowerCase() === 'possible_family') continue;
        const metaKinship = typeof r.metadata?.kinship === 'string' ? String(r.metadata.kinship) : null;
        const rawType = r.relationship_role ?? metaKinship ?? r.relationship_type;
        if (r.relationship_category !== 'family' && !isFamilyType(rawType) && !isFamilyType(r.relationship_type) && !isFamilyType(metaKinship ?? '')) continue;
        const type = normalizeRelationshipType(rawType);
        const key = `${r.source_character_id}|${r.target_character_id}|${type}`;
        if (seen.has(key)) continue;
        seen.add(key);
        edges.push({
          fromId: r.source_character_id,
          toId: r.target_character_id,
          type,
          confidence: 0.7,
          evidence: (r.metadata?.evidence as string) ?? r.summary,
        });
      }
    }

    return edges;
  }

  /** Edges implied by family_override.connects_to_id for this character and peers. */
  private async loadOverridePlacementEdges(
    userId: string,
    characterId: string,
  ): Promise<Array<{ fromId: string; toId: string; type: string; confidence: number; evidence?: string }>> {
    const { data: selfRow } = await supabaseAdmin
      .from('characters')
      .select('id, metadata')
      .eq('id', characterId)
      .eq('user_id', userId)
      .maybeSingle();
    const selfOverride = (selfRow?.metadata as Record<string, unknown> | null)?.family_override as
      | { connects_to_id?: string | null }
      | undefined;
    const edges: Array<{ fromId: string; toId: string; type: string; confidence: number; evidence?: string }> = [];
    if (selfOverride?.connects_to_id) {
      edges.push({
        fromId: selfOverride.connects_to_id,
        toId: characterId,
        type: 'parent_of',
        confidence: 0.95,
        evidence: 'family_override',
      });
    }

    // Peers who connect to the same parent (shared surname cousins under one aunt).
    const parentId = selfOverride?.connects_to_id;
    if (parentId) {
      const { data: peers } = await supabaseAdmin
        .from('characters')
        .select('id, metadata')
        .eq('user_id', userId)
        .neq('id', characterId)
        .limit(250);
      for (const peer of peers ?? []) {
        const ov = (peer.metadata as Record<string, unknown> | null)?.family_override as
          | { connects_to_id?: string | null }
          | undefined;
        if (ov?.connects_to_id !== parentId) continue;
        edges.push({
          fromId: parentId,
          toId: peer.id as string,
          type: 'parent_of',
          confidence: 0.9,
          evidence: 'family_override',
        });
        edges.push({
          fromId: characterId,
          toId: peer.id as string,
          type: 'cousin_of',
          confidence: 0.85,
          evidence: 'shared_tree_parent',
        });
      }
    }
    return edges;
  }

  private async loadNames(userId: string, ids: string[]): Promise<Map<string, string>> {
    const uniq = [...new Set(ids.filter(Boolean))];
    if (uniq.length === 0) return new Map();
    const { data } = await supabaseAdmin
      .from('characters')
      .select('id, name')
      .eq('user_id', userId)
      .in('id', uniq);
    const map = new Map<string, string>();
    for (const row of (data ?? []) as Array<{ id: string; name: string }>) {
      map.set(row.id, row.name);
    }
    return map;
  }

  /** Known sex for tree nodes (from metadata, any source) — used to resolve
   *  aunt/uncle and niece/nephew labels when composing a multi-hop relation.
   *  Falls back to a name-based guess at composition time when a node has no
   *  metadata.sex on record. */
  private async loadSexHints(userId: string, ids: string[]): Promise<Map<string, InferredSex>> {
    const uniq = [...new Set(ids.filter(Boolean))];
    const map = new Map<string, InferredSex>();
    if (uniq.length === 0) return map;
    const { data } = await supabaseAdmin
      .from('characters')
      .select('id, metadata')
      .eq('user_id', userId)
      .in('id', uniq);
    for (const row of (data ?? []) as Array<{ id: string; metadata?: Record<string, unknown> | null }>) {
      const sex = String(row.metadata?.sex ?? '').toLowerCase();
      if (sex === 'male' || sex === 'female') map.set(row.id, sex);
    }
    return map;
  }

  /** Load metadata/role for the real character nodes in a tree (one query). */
  private async loadMemberMeta(userId: string, ids: string[]): Promise<Map<string, NodeMetaRow>> {
    const uniq = [...new Set(ids.filter((id) => id && !isSyntheticNodeId(id)))];
    if (uniq.length === 0) return new Map();
    const { data } = await supabaseAdmin
      .from('characters')
      .select('id, name, first_name, last_name, alias, role, archetype, metadata')
      .eq('user_id', userId)
      .in('id', uniq);
    const map = new Map<string, NodeMetaRow>();
    for (const row of (data ?? []) as Array<{ id: string } & NodeMetaRow>) {
      map.set(row.id, {
        metadata: row.metadata,
        role: row.role,
        archetype: row.archetype,
        alias: row.alias,
        name: row.name,
        first_name: row.first_name,
        last_name: row.last_name,
      });
    }
    return map;
  }

  /**
   * Final pass over a built tree: drop members the user excluded from family
   * (kept as characters, just not kin), tag real-card vs synthetic nodes, and
   * flag suspect nodes for review. Runs for every tree shape (user/character/
   * organization) so manual corrections survive each rebuild.
   */
  private async applyOverridesAndReview(userId: string, tree: FamilyTreeDTO | null): Promise<FamilyTreeDTO | null> {
    if (!tree || tree.members.length === 0) return tree;
    const meta = await this.loadMemberMeta(userId, tree.members.map((m) => m.id));
    const accountSelfId = await this.findUserCharacterId(userId);

    const members = tree.members
      .filter((m) => {
        if (m.is_self || m.is_placeholder) return true;
        return !isFamilyExcluded(meta.get(m.id)?.metadata);
      })
      .map((m) => {
        if (m.is_self || m.is_placeholder || isSyntheticNodeId(m.id)) {
          return { ...m, has_card: false };
        }
        const row = meta.get(m.id);
        let member: FamilyMemberDTO = {
          ...m,
          has_card: Boolean(row),
          is_account_self: Boolean(accountSelfId && m.id === accountSelfId),
          first_name: row?.first_name ?? m.first_name,
          last_name: row?.last_name ?? m.last_name,
        };
        // Prefer the durable character card name when the tree node is still a
        // bare kinship word ("Mom" / "Dad") so the UI can show Mom (Elena Chen).
        if (row?.name?.trim()) {
          const cardName = row.name.trim();
          const nodeIsKinWord = /^(?:step[\s-]?)?(?:mom|mother|mama|mami|dad|father|papa|papi)$/i.test(
            (m.name ?? '').trim(),
          );
          if (nodeIsKinWord && !/^(?:step[\s-]?)?(?:mom|mother|mama|mami|dad|father|papa|papi)$/i.test(cardName)) {
            member = {
              ...member,
              name: cardName,
              kinship_title: member.kinship_title || m.name,
              first_name: row.first_name || cardName.split(/\s+/)[0],
              last_name: row.last_name || cardName.split(/\s+/).slice(1).join(' ') || member.last_name,
            };
          }
        }
        // Normalize Mother/Father labels to Mom/Dad for display consistency.
        if (member.relation === 'parent' || member.relation === 'step_parent') {
          const title = (member.kinship_title || member.relation_label || '').toLowerCase();
          if (/\b(mom|mother|mama|mami)\b/.test(title) || title === 'mother') {
            member = {
              ...member,
              kinship_title: member.kinship_title || (member.relation === 'step_parent' ? 'Stepmom' : 'Mom'),
              relation_label:
                member.relation === 'step_parent'
                  ? member.relation_label?.toLowerCase().includes('step')
                    ? member.relation_label
                    : 'Stepmom'
                  : 'Mom',
            };
          } else if (/\b(dad|father|papa|papi)\b/.test(title) || title === 'father') {
            member = {
              ...member,
              kinship_title: member.kinship_title || (member.relation === 'step_parent' ? 'Stepdad' : 'Dad'),
              relation_label:
                member.relation === 'step_parent'
                  ? member.relation_label?.toLowerCase().includes('step')
                    ? member.relation_label
                    : 'Stepdad'
                  : 'Dad',
            };
          }
        }

        // User-asserted overrides win over name inference. An explicit parent
        // link surfaces as parent_id (drives the connector); an explicit
        // relation also repositions the node. Either way it's user-placed, so
        // it's never flagged for review.
        const override = (row?.metadata as Record<string, unknown> | undefined)?.family_override as
          | { relation?: string; side?: 'maternal' | 'paternal' | 'both' | 'other' | null; connects_to_id?: string | null }
          | undefined;
        if (override) {
          if (override.connects_to_id) member.parent_id = override.connects_to_id;
          if (override.relation && override.relation in RELATION_GENERATION) {
            member = applyRelationOverride(member, override);
          }
          if (override.connects_to_id || (override.relation && override.relation in RELATION_GENERATION)) {
            return { ...member, needs_review: false };
          }
        }

        const review = assessNodeReview(member, row, { accountSelfId });
        member = { ...member, needs_review: review?.needsReview ?? false, review_reason: review?.reason };
        return member;
      });

    // Align aunt/uncle branch side with their placed children (cousins under
    // Tía Grace should pull Grace into the maternal column, not "other").
    const sideByParent = new Map<string, 'maternal' | 'paternal' | 'both' | 'other'>();
    for (const m of members) {
      if (m.parent_id && m.side && m.side !== 'other') {
        if (!sideByParent.has(m.parent_id)) sideByParent.set(m.parent_id, m.side);
      }
    }
    const aligned = members.map((m) => {
      const childSide = sideByParent.get(m.id);
      if (!childSide) return m;
      if (m.relation === 'aunt' || m.relation === 'uncle' || m.relation === 'parent' || m.relation === 'step_parent') {
        if (!m.side || m.side === 'other') return { ...m, side: childSide };
      }
      return m;
    });

    // User-dragged row order (see reorderMembers) — applied last so it
    // survives every override/review pass above, then re-sort: the tree was
    // already sorted once upstream (before this field existed on the DTO),
    // so this is the authoritative sort that actually respects it.
    const withDisplayOrder = aligned.map((m) => {
      const order = (meta.get(m.id)?.metadata as Record<string, unknown> | undefined)?.family_display_order;
      return typeof order === 'number' ? { ...m, family_display_order: order } : m;
    });
    sortFamilyMembersForDisplay(withDisplayOrder);

    return { ...tree, members: withDisplayOrder };
  }

  private buildTreeFromEdges(
    rootId: string,
    rootName: string,
    edges: Array<{ fromId: string; toId: string; type: string; confidence: number; evidence?: string }>,
    names: Map<string, string>,
    opts: { markSelf?: boolean; selfId?: string; restrictIds?: Set<string> },
    sexHints: Map<string, InferredSex> = new Map(),
  ): FamilyTreeDTO {
    const adj = new Map<string, Array<{ neighbor: string; type: string; evidence?: string }>>();
    const addAdj = (a: string, b: string, type: string, evidence?: string) => {
      (adj.get(a) ?? adj.set(a, []).get(a)!).push({ neighbor: b, type, evidence });
    };
    for (const e of edges) {
      addAdj(e.fromId, e.toId, e.type, e.evidence);
      addAdj(e.toId, e.fromId, e.type, e.evidence);
    }

    // Prefer edges with a real generational assertion (grandparent_of, uncle_of,
    // ...) over generic/unrecognized bucket types (family, related_to, a raw
    // co-mention type, ...), which silently fall back to a same-generation
    // delta of {forward: 0, backward: 0} below. Without this, when the same
    // two people have more than one edge between them, whichever one a DB
    // query happens to return first wins the "first visit" BFS below -- so an
    // untyped co-mention row can silently outrank a correctly-typed kinship
    // edge and place someone (e.g. an uncle) at the wrong generation.
    for (const list of adj.values()) {
      list.sort((a, b) => (GEN_DELTA[a.type.toLowerCase()] ? 0 : 1) - (GEN_DELTA[b.type.toLowerCase()] ? 0 : 1));
    }

    /** Resolve a node's sex from known metadata, else a best-effort name guess. */
    const resolveSex = (id: string): InferredSex | null =>
      sexHints.get(id) ?? sexFromFirstName(names.get(id) ?? '') ?? null;

    /** Compose a relation for `neighbor`, reached from `current` via one hop.
     *  Walks the whole step-path from root when every hop so far decomposes
     *  into a primitive UP/DOWN/SIDE/MARRY step; falls back to the prior
     *  single-edge label the moment a compound/explicit edge type (aunt_of,
     *  step_parent_of, ...) appears, since those are already correct as-is. */
    const classify = (
      current: string,
      neighbor: string,
      type: string,
      direction: 'forward' | 'backward',
      currentPath: PathStep[] | null,
      nextGen: number,
    ): { relation: FamilyRelationType; path: PathStep[] | null } => {
      const step = currentPath !== null ? stepFromEdge(type, direction) : null;
      if (step) {
        const path = [...currentPath!, step];
        const sex = relationNeedsSex(path) ? resolveSex(neighbor) : null;
        return { relation: composeRelation(path, sex), path };
      }
      return { relation: relationFromType(type, nextGen), path: null };
    };

    const generations = new Map<string, number>();
    const paths = new Map<string, PathStep[] | null>();
    const relationToRoot = new Map<string, { relation: FamilyRelationType; label: string; evidence?: string }>();
    generations.set(rootId, 0);
    paths.set(rootId, []);
    relationToRoot.set(rootId, { relation: 'related', label: 'You' });

    const queue = [rootId];
    while (queue.length) {
      const current = queue.shift()!;
      const currentGen = generations.get(current)!;
      const currentPath = paths.get(current) ?? null;
      for (const { neighbor, type, evidence } of adj.get(current) ?? []) {
        if (opts.restrictIds && !opts.restrictIds.has(neighbor)) continue;
        const deltas = GEN_DELTA[type.toLowerCase()] ?? { forward: 0, backward: 0 };
        let delta = 0;
        // Match by type, not just node pair: when two people have more than one
        // edge between them (e.g. both a `grandchild_of` and its reciprocal
        // `grandparent_of` row), a type-blind lookup can pair this adjacency
        // entry with the OTHER edge and read its delta in the wrong direction --
        // silently flipping which generation a person lands in.
        const edge = edges.find(e =>
          e.type === type &&
          ((e.fromId === current && e.toId === neighbor) || (e.fromId === neighbor && e.toId === current))
        );
        const direction: 'forward' | 'backward' = edge?.fromId === current ? 'forward' : 'backward';
        if (edge?.fromId === current) delta = deltas.forward;
        else if (edge?.toId === current) delta = deltas.backward;

        const nextGen = currentGen + delta;
        if (!generations.has(neighbor)) {
          generations.set(neighbor, nextGen);
          const { relation, path } = classify(current, neighbor, type, direction, currentPath, nextGen);
          paths.set(neighbor, path);
          relationToRoot.set(neighbor, {
            relation,
            label: labelForRelation(relation, names.get(neighbor) ?? '', evidence),
            evidence,
          });
          queue.push(neighbor);
        } else if (generations.get(neighbor) === nextGen && currentPath !== null) {
          // Same node reachable at the same depth via a different route — prefer
          // the path with fewer sideways (sibling/spouse) hops, matching how a
          // person would naturally describe the relationship (blood line first).
          const existingPath = paths.get(neighbor) ?? null;
          const { relation, path } = classify(current, neighbor, type, direction, currentPath, nextGen);
          if (
            path !== null &&
            (existingPath === null || sidewaysStepCount(path) < sidewaysStepCount(existingPath))
          ) {
            paths.set(neighbor, path);
            relationToRoot.set(neighbor, {
              relation,
              label: labelForRelation(relation, names.get(neighbor) ?? '', evidence),
              evidence,
            });
          }
        }
      }
    }

    const selfId = opts.selfId ?? rootId;
    const members: FamilyMemberDTO[] = [...generations.entries()].map(([id, generation]) => {
      const relInfo = relationToRoot.get(id)!;
      const name = names.get(id) ?? 'Unknown';
      return {
        id,
        name,
        first_name: name.split(' ')[0],
        relation: relInfo.relation,
        relation_label: id === selfId && opts.markSelf ? 'You' : relInfo.label,
        generation,
        is_self: id === selfId,
        closeness: id === selfId ? 100 : undefined,
        side: inferSide(relInfo.evidence),
      };
    });

    alignMarriedInSidesWithSpouse(members, edges);
    sortFamilyMembersForDisplay(members);

    return {
      members,
      branches: [
        { side: 'maternal', label: 'Maternal', color: '#f472b6' },
        { side: 'paternal', label: 'Paternal', color: '#60a5fa' },
        { side: 'partner', label: 'Partner side', color: '#34d399' },
      ],
      self_id: selfId,
    };
  }
}

function inferSide(evidence?: string): 'maternal' | 'paternal' | 'both' | 'other' | undefined {
  if (!evidence) return undefined;
  const t = evidence.toLowerCase();
  if (/\b(maternal|mother'?s? side|mom'?s? side|mi mam[aá]|lado materno)\b/.test(t)) return 'maternal';
  if (/\b(paternal|father'?s? side|dad'?s? side|mi pap[aá]|lado paterno)\b/.test(t)) return 'paternal';
  return undefined;
}

/** Relations someone holds only by marriage/partnership, never by blood —
 *  their "side" should mirror whichever blood relative they're married to,
 *  not whatever a loose text match on their OWN edge happened to infer. */
const MARRIED_IN_RELATIONS = new Set<FamilyRelationType>(['step_parent', 'step_child', 'in_law']);

/**
 * Links every same-generation spouse_of pair via paired_with_id so display
 * sorting can cluster them together (see displayPairKey) — a married-in
 * relative (step-parent/step-child/in-law) as well as a plain blood-relation
 * couple (e.g. two grandparents). Also carries a step-parent (etc.) onto
 * their spouse's side of the tree — e.g. a step-dad married to Mom sits with
 * the maternal branch, not wherever his own kinship-extraction evidence text
 * happened to point; blood relatives keep their own side. Runs after
 * generation/relation/side are all assigned, using the spouse_of edges from
 * the same graph walk (same generation tier — same-tier check keeps this
 * from misfiring on an unrelated spouse_of edge to the wrong generation).
 */
export function alignMarriedInSidesWithSpouse(
  members: FamilyMemberDTO[],
  edges: Array<{ fromId: string; toId: string; type: string }>,
): void {
  const spouseOf = new Map<string, string>();
  for (const e of edges) {
    if (e.type !== 'spouse_of') continue;
    spouseOf.set(e.fromId, e.toId);
    spouseOf.set(e.toId, e.fromId);
  }
  if (spouseOf.size === 0) return;

  const byId = new Map(members.map((m) => [m.id, m]));
  for (const m of members) {
    const partner = byId.get(spouseOf.get(m.id) ?? '');
    if (!partner || partner.generation !== m.generation) continue;
    if (MARRIED_IN_RELATIONS.has(m.relation) && partner.side && partner.side !== 'other') {
      m.side = partner.side;
    }
    // Record the exact partner so display sorting can cluster them together
    // without re-guessing via side/generation, which is ambiguous whenever
    // more than one same-side blood relative shares that generation (e.g.
    // an uncle and a mother both maternal) — side match alone can't tell
    // which of them is actually the spouse.
    m.paired_with_id = partner.id;
    partner.paired_with_id = m.id;
  }
}

/** Pairing key so any spouse pair (married-in relative or a plain
 *  blood-relation couple, e.g. two grandparents) sorts immediately adjacent
 *  to each other, instead of wherever their own names happen to fall
 *  alphabetically. Everyone else's key is just their own name, so they
 *  interleave normally. */
function displayPairKey(m: FamilyMemberDTO, members: FamilyMemberDTO[]): string {
  const partner = m.paired_with_id
    ? members.find((x) => x.id === m.paired_with_id && x.generation === m.generation)
    : undefined;
  if (!partner) {
    if (!MARRIED_IN_RELATIONS.has(m.relation)) return m.name;
    if (!m.side || m.side === 'other') return m.name;
    // No recorded spouse_of partner — fall back to guessing by side, same
    // as before paired_with_id existed.
    const anchor = members.find(
      (x) =>
        x.id !== m.id &&
        x.generation === m.generation &&
        x.side === m.side &&
        !MARRIED_IN_RELATIONS.has(x.relation) &&
        x.relation !== 'related',
    );
    return anchor ? anchor.name : m.name;
  }
  // Married-in relative clusters under their blood-relative partner's name
  // (the "anchor"), regardless of alphabetical order. Between two blood
  // relatives married to each other, use whichever name sorts first so
  // both converge on the same shared key.
  const mMarriedIn = MARRIED_IN_RELATIONS.has(m.relation);
  const partnerMarriedIn = MARRIED_IN_RELATIONS.has(partner.relation);
  if (mMarriedIn && !partnerMarriedIn) return partner.name;
  if (!mMarriedIn && partnerMarriedIn) return m.name;
  return m.name < partner.name ? m.name : partner.name;
}

/** Whether this member should lead their generation row regardless of
 *  alphabetical order — matched by kinship_title first (the term the user
 *  actually uses, e.g. "Abuela", preserved even after her real name is
 *  learned — see FamilyMemberDTO.kinship_title), falling back to name. */
function isLeadPriorityName(value: string | undefined): boolean {
  return (value ?? '').trim().toLowerCase() === 'abuela';
}

function isLeadPriorityMember(m: FamilyMemberDTO, members: FamilyMemberDTO[]): boolean {
  if (isLeadPriorityName(m.kinship_title) || isLeadPriorityName(m.name)) return true;
  const partner = m.paired_with_id
    ? members.find((x) => x.id === m.paired_with_id && x.generation === m.generation)
    : undefined;
  return partner ? isLeadPriorityName(partner.kinship_title) || isLeadPriorityName(partner.name) : false;
}

/**
 * Sort members for display: generation, self first, then Abuela's cluster
 * leading her generation row (see isLeadPriorityMember), then spouse pairs
 * clustered together (a step-parent sorts right next to the blood relative
 * they're married to, and a plain couple like two grandparents sort next to
 * each other too — see displayPairKey), then alphabetical. Without the
 * pairing step, a spouse pair only ends up adjacent by alphabetical
 * coincidence even when their side/generation both match.
 *
 * A generation row the user has manually dragged (family_display_order set
 * on at least one member — see reorderMembers) skips all of that and sorts
 * by the saved order instead, full stop: the whole point is letting the
 * user's own placement win over the algorithm. A member added to that row
 * after the last manual save (no order recorded yet) falls after everyone
 * with an explicit position, ordered among themselves by the normal rules.
 */
export function sortFamilyMembersForDisplay(members: FamilyMemberDTO[]): FamilyMemberDTO[] {
  const manuallyOrderedGenerations = new Set<number>();
  for (const m of members) {
    if (typeof m.family_display_order === 'number') manuallyOrderedGenerations.add(m.generation);
  }

  members.sort((a, b) => {
    if (a.generation !== b.generation) return a.generation - b.generation;

    if (manuallyOrderedGenerations.has(a.generation)) {
      const aHas = typeof a.family_display_order === 'number';
      const bHas = typeof b.family_display_order === 'number';
      if (aHas && bHas) return a.family_display_order! - b.family_display_order!;
      if (aHas !== bHas) return aHas ? -1 : 1;
      // Both unrecorded within a manually-ordered row — fall through to the
      // normal rules below so new arrivals still sort sensibly among themselves.
    }

    const selfDelta = Number(Boolean(b.is_self)) - Number(Boolean(a.is_self));
    if (selfDelta !== 0) return selfDelta;
    const leadDelta =
      Number(isLeadPriorityMember(b, members)) - Number(isLeadPriorityMember(a, members));
    if (leadDelta !== 0) return leadDelta;
    const aKey = displayPairKey(a, members);
    const bKey = displayPairKey(b, members);
    if (aKey !== bKey) return aKey.localeCompare(bKey);
    const aMarriedIn = MARRIED_IN_RELATIONS.has(a.relation) ? 1 : 0;
    const bMarriedIn = MARRIED_IN_RELATIONS.has(b.relation) ? 1 : 0;
    if (aMarriedIn !== bMarriedIn) return aMarriedIn - bMarriedIn;
    return a.name.localeCompare(b.name);
  });
  return members;
}

const SYNTHETIC_ID_PREFIXES = ['__', 'name-', 'head-', 'group-'];

/** Nodes that are NOT backed by a real character row (virtual self, inferred
 *  placeholder, name-only org member). They can't be excluded/deleted/carded. */
export function isSyntheticNodeId(id: string): boolean {
  return SYNTHETIC_ID_PREFIXES.some((p) => id.startsWith(p));
}

type NodeMetaRow = {
  metadata?: Record<string, unknown> | null;
  role?: string | null;
  archetype?: string | null;
  alias?: string[] | null;
  name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
};

/** True when the user has explicitly removed this character from their family
 *  tree (kept as a character, just not kin). Tolerates both the rich
 *  `{ value: true }` shape and a bare boolean. */
export function isFamilyExcluded(metadata?: Record<string, unknown> | null): boolean {
  const flag = metadata?.family_excluded as unknown;
  if (flag === true) return true;
  if (flag && typeof flag === 'object' && (flag as { value?: unknown }).value === true) return true;
  return false;
}

/** Apply a user-asserted relationship override to a member (relation/label/
 *  generation/side), marking it asserted so inference never overwrites it. */
export function applyRelationOverride(
  member: FamilyMemberDTO,
  override: { relation?: string; side?: 'maternal' | 'paternal' | 'both' | 'other' | null },
): FamilyMemberDTO {
  const relation = (override.relation ?? 'related') as FamilyRelationType;
  return {
    ...member,
    relation,
    relation_label: labelForRelation(relation, member.name),
    generation: RELATION_GENERATION[relation] ?? member.generation,
    side: override.side ?? member.side,
    inference_status: 'asserted',
  };
}

/** Decide whether a family node should be surfaced for user review. Reuses the
 *  same signals the kinship classifier uses to ADMIT nodes, applied in reverse:
 *  a node that slipped in but looks like a handle/stage name, a public figure,
 *  or has no real kinship signal is a review candidate (never auto-removed). */
export function assessNodeReview(
  member: { id?: string; name: string; relation: FamilyRelationType; is_self?: boolean; is_placeholder?: boolean },
  row?: NodeMetaRow,
  opts?: { accountSelfId?: string | null },
): { needsReview: boolean; reason: string } | null {
  if (member.is_self || member.is_placeholder) return null;
  // Account protagonist on someone else's ego tree (e.g. Abel on Jerry's tree)
  // is family, not a stray relative — never warn.
  if (opts?.accountSelfId && member.id && member.id === opts.accountSelfId) return null;
  const name = (member.name ?? '').trim();
  if (!name) return null;
  const metadata = row?.metadata ?? {};

  // The user already reviewed and kept this node — don't keep nagging.
  if (metadata.family_reviewed === true) return null;
  // Explicit self/protagonist card metadata wins even when this tree's ego is someone else.
  if (metadata.is_self === true || metadata.importance_level === 'protagonist') return null;

  // Handle/stage-name shape: a dot, @, or digit inside the name.
  if (/[.@\d]/.test(name)) {
    return { needsReview: true, reason: 'Looks like a handle or stage name, not a relative.' };
  }

  // Explicit public-figure marking. Require public_figure — figure_type alone is
  // overloaded (e.g. product "creator") and must not flag the account owner.
  if (metadata.public_figure === true) {
    return { needsReview: true, reason: 'Marked as a public figure, not family.' };
  }

  // A kinship word appears but is NOT title-leading ("Goth Tio", "Mom Jeans") —
  // those are stage names, not kin.
  const lower = name.toLowerCase();
  const hasKinshipWord = KINSHIP_TERMS.some((t) => new RegExp(`\\b${t}\\b`, 'i').test(lower));
  if (hasKinshipWord && !inferLeadingKinship(name)) {
    return { needsReview: true, reason: 'Kinship word is not at the start of the name — likely a nickname, not a relative.' };
  }

  // Admitted as a generic relative with no detectable kinship signal at all.
  if (member.relation === 'related' && !hasKinshipWord) {
    return { needsReview: true, reason: 'No clear family relationship detected yet.' };
  }

  return null;
}

/** Inverse of a directed family edge type (parent↔child, sibling↔sibling). */
export function inverseFamilyEdgeType(type: string): string | null {
  return inverseFamilyEdgeTypeShared(type);
}

type FamilyEdge = { fromId: string; toId: string; type: string; confidence: number; evidence?: string };

/** Add child_of inverses for parent_of and sibling_of among shared-parent children. */
export function inferSiblingAndInverseParentEdges(edges: FamilyEdge[]): FamilyEdge[] {
  const extra: FamilyEdge[] = [];
  const seen = new Set(edges.map((e) => `${e.fromId}|${e.toId}|${normalizeRelationshipType(e.type)}`));
  const push = (fromId: string, toId: string, type: string, confidence: number, evidence?: string) => {
    const key = `${fromId}|${toId}|${type}`;
    if (fromId === toId || seen.has(key)) return;
    seen.add(key);
    extra.push({ fromId, toId, type, confidence, evidence });
  };

  const childrenByParent = new Map<string, string[]>();
  for (const e of edges) {
    const type = normalizeRelationshipType(e.type);
    if (type === 'parent_of' || type === 'step_parent_of' || type === 'adopted_parent_of') {
      push(e.toId, e.fromId, inverseFamilyEdgeType(type) ?? 'child_of', e.confidence, e.evidence);
      const list = childrenByParent.get(e.fromId) ?? [];
      list.push(e.toId);
      childrenByParent.set(e.fromId, list);
    } else if (type === 'child_of' || type === 'step_child_of' || type === 'adopted_child_of') {
      push(e.toId, e.fromId, inverseFamilyEdgeType(type) ?? 'parent_of', e.confidence, e.evidence);
      const list = childrenByParent.get(e.toId) ?? [];
      list.push(e.fromId);
      childrenByParent.set(e.toId, list);
    }
  }

  for (const [, kids] of childrenByParent) {
    const uniq = [...new Set(kids)];
    for (let i = 0; i < uniq.length; i++) {
      for (let j = i + 1; j < uniq.length; j++) {
        push(uniq[i], uniq[j], 'sibling_of', 0.88, 'shared_parent');
        push(uniq[j], uniq[i], 'sibling_of', 0.88, 'shared_parent');
      }
    }
  }
  return extra;
}

/**
 * Absolute parent→child edges from a built FamilyTreeDTO (parent_id + gen-relative
 * parent/child relations to the tree self).
 */
export function collectAbsoluteParentChildEdges(
  tree: FamilyTreeDTO,
): Array<{ parentId: string; childId: string }> {
  const edges: Array<{ parentId: string; childId: string }> = [];
  const seen = new Set<string>();
  const push = (parentId: string, childId: string) => {
    if (!parentId || !childId || parentId === childId) return;
    const key = `${parentId}|${childId}`;
    if (seen.has(key)) return;
    seen.add(key);
    edges.push({ parentId, childId });
  };

  const selfId = tree.self_id;
  for (const m of tree.members) {
    if (m.parent_id) push(m.parent_id, m.id);
    if (
      selfId &&
      !m.is_self &&
      !kinshipGrandparentHint(m) &&
      (m.relation === 'parent' ||
        m.relation === 'step_parent' ||
        m.relation === 'adopted_parent' ||
        m.relation === 'godparent' ||
        kinshipParentHint(m) !== null)
    ) {
      push(m.id, selfId);
    }
    if (selfId && !m.is_self && (m.relation === 'child' || m.relation === 'step_child' || m.relation === 'adopted_child')) {
      push(selfId, m.id);
    }
  }

  // A title-only grandparent can arrive with a stale generic/parent override,
  // while the aunts/uncles below it have explicit parent_id placement. Use
  // that anchored branch to restore the missing account-parent and sibling
  // links. This keeps a relative-centered projection on the same absolute
  // graph instead of turning the account owner into the aunt/uncle's child.
  const members = tree.members.filter((m) => !m.is_placeholder);
  const accountParents = members.filter(
    (m) =>
      m.id !== selfId &&
      !kinshipGrandparentHint(m) &&
      (m.relation === 'parent' ||
        m.relation === 'step_parent' ||
        m.relation === 'adopted_parent' ||
        kinshipParentHint(m) !== null),
  );
  const auntUncles = members.filter(
    (m) =>
      m.relation === 'aunt' ||
      m.relation === 'uncle' ||
      kinshipAuntUncleHint(m) !== null,
  );
  const grandparents = members.filter(
    (m) => m.relation === 'grandparent' || kinshipGrandparentHint(m),
  );
  const sideMatches = (a: FamilyMemberDTO, b: FamilyMemberDTO): boolean =>
    !a.side ||
    a.side === 'other' ||
    !b.side ||
    b.side === 'other' ||
    a.side === 'both' ||
    b.side === 'both' ||
    a.side === b.side;

  for (const grandparent of grandparents) {
    const anchoredBranch = auntUncles.filter((m) => m.parent_id === grandparent.id);
    if (anchoredBranch.length === 0) continue;
    for (const relative of [...accountParents, ...auntUncles]) {
      if (relative.id === grandparent.id || relative.parent_id) continue;
      if (!anchoredBranch.some((anchor) => sideMatches(anchor, relative))) continue;
      push(grandparent.id, relative.id);
    }
  }
  return edges;
}

/**
 * Romantic relationship types serious/committed enough — or already a
 * co-parenting label by definition — to infer that one partner's kid from
 * elsewhere counts as the other's step-kid. Everything else (dating, crush,
 * situationship, talking stage, etc.) only gets kids that are directly
 * observed as shared (both independently recorded as parents in the tree).
 */
function isCommittedOrCoParentRelationshipType(relationshipType?: string | null): boolean {
  const key = String(relationshipType ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
  if (!key) return false;
  const committedOrCoParent = new Set([
    'married', 'wife', 'husband', 'spouse',
    'engaged', 'fiance', 'fiancee', 'fiancé', 'fiancée',
    'partner', 'life_partner', 'domestic_partner',
    'baby_mama', 'baby_daddy', 'co_parent', 'coparent',
  ]);
  return committedOrCoParent.has(key);
}

function kinshipSiblingHint(member: FamilyMemberDTO): boolean {
  const blob = `${member.kinship_title ?? ''} ${member.relation_label ?? ''} ${member.name ?? ''}`.toLowerCase();
  return /\b(brother|sister|sibling|hermano|hermana)\b/.test(blob);
}

function kinshipParentHint(member: FamilyMemberDTO): 'parent' | 'step_parent' | null {
  const blob = `${member.kinship_title ?? ''} ${member.relation_label ?? ''} ${member.name ?? ''}`.toLowerCase();
  if (/\b(step[-\s]?dad|step[-\s]?mom|step[-\s]?father|step[-\s]?mother|step[-\s]?parent)\b/.test(blob)) {
    return 'step_parent';
  }
  if (/\b(mom|mother|dad|father|parent|mam[aá]|pap[aá])\b/.test(blob)) return 'parent';
  return null;
}

function kinshipAuntUncleHint(member: FamilyMemberDTO): 'aunt' | 'uncle' | null {
  const blob = `${member.kinship_title ?? ''} ${member.relation_label ?? ''} ${member.name ?? ''}`.toLowerCase();
  if (/\b(t[ií]a|aunt)\b/.test(blob)) return 'aunt';
  if (/\b(t[ií]o|uncle)\b/.test(blob)) return 'uncle';
  return null;
}

function kinshipGrandparentHint(member: FamilyMemberDTO): boolean {
  const blob = `${member.kinship_title ?? ''} ${member.relation_label ?? ''} ${member.name ?? ''}`.toLowerCase();
  return /\b(abuela|abuelo|grandma|grandpa|grandmother|grandfather|grandparent)\b/.test(blob);
}

const AFFINITY_RELATIONS = new Set<FamilyRelationType>([
  'step_parent',
  'step_child',
  'step_sibling',
  'in_law',
  'spouse',
]);

/**
 * Affinity kin (step-parents, in-laws, spouses) should not inherit the account
 * holder's full blood roster when their modal re-roots the shared tree.
 */
export function isAffinityKinOnSharedTree(member: FamilyMemberDTO): boolean {
  if (member.is_self) return false;
  if (AFFINITY_RELATIONS.has(member.relation)) return true;
  if (kinshipParentHint(member) === 'step_parent') return true;
  const blob = `${member.kinship_title ?? ''} ${member.relation_label ?? ''} ${member.name ?? ''}`.toLowerCase();
  return /\bstep[-\s]?(dad|mom|father|mother|parent|son|daughter|child|brother|sister|sibling)\b/.test(blob)
    || /\b(in[-\s]?law|spouse|husband|wife|partner)\b/.test(blob) && member.relation === 'related';
}

/**
 * Scoped family tree for affinity egos: ego + their own blood line + co-parents
 * of their children (partners) + shared children. Does NOT walk into the
 * partner's natal family (no mother-in-law / partner's siblings by default).
 */
export function projectAffinityFamilyTreeOntoEgo(
  shared: FamilyTreeDTO,
  egoId: string,
): FamilyTreeDTO {
  if (!shared.members.some((m) => m.id === egoId)) return shared;
  if (shared.self_id === egoId) {
    return projectSharedFamilyTreeOntoEgo(shared, egoId);
  }

  const byId = new Map(shared.members.map((m) => [m.id, m]));
  const parentEdges = collectAbsoluteParentChildEdges(shared);
  const parentsOf = new Map<string, Set<string>>();
  const childrenOf = new Map<string, Set<string>>();
  for (const e of parentEdges) {
    if (!byId.has(e.parentId) || !byId.has(e.childId)) continue;
    (parentsOf.get(e.childId) ?? parentsOf.set(e.childId, new Set()).get(e.childId)!).add(e.parentId);
    (childrenOf.get(e.parentId) ?? childrenOf.set(e.parentId, new Set()).get(e.parentId)!).add(e.childId);
  }

  const coParents = new Set<string>();
  for (const childId of childrenOf.get(egoId) ?? []) {
    for (const p of parentsOf.get(childId) ?? []) {
      if (p !== egoId) coParents.add(p);
    }
  }
  // Account-holder self is a child of this step-parent → treat other parents of
  // self as partners even if parent_id wiring missed the step edge.
  if (shared.self_id && shared.self_id !== egoId) {
    const selfParents = parentsOf.get(shared.self_id) ?? new Set<string>();
    if (selfParents.has(egoId) || isAffinityKinOnSharedTree(byId.get(egoId)!)) {
      // If ego is step-parent of account holder, include account holder as child
      // and other parents as co-parents.
      const egoMember = byId.get(egoId);
      if (egoMember && (egoMember.relation === 'step_parent' || kinshipParentHint(egoMember) === 'step_parent')) {
        (childrenOf.get(egoId) ?? childrenOf.set(egoId, new Set()).get(egoId)!).add(shared.self_id);
        (parentsOf.get(shared.self_id) ?? parentsOf.set(shared.self_id, new Set()).get(shared.self_id)!).add(egoId);
        for (const p of selfParents) {
          if (p !== egoId) coParents.add(p);
        }
        // Biological / other parents of self on the shared tree.
        for (const m of shared.members) {
          if (m.id === egoId || m.id === shared.self_id) continue;
          if (m.relation === 'parent' || kinshipParentHint(m) === 'parent') {
            coParents.add(m.id);
            (parentsOf.get(shared.self_id) ?? parentsOf.set(shared.self_id, new Set()).get(shared.self_id)!).add(m.id);
            (childrenOf.get(m.id) ?? childrenOf.set(m.id, new Set()).get(m.id)!).add(shared.self_id);
          }
        }
      }
    }
  }

  const include = new Set<string>([egoId]);
  const queue = [egoId];
  const visited = new Set<string>();
  while (queue.length) {
    const cur = queue.shift()!;
    if (visited.has(cur)) continue;
    visited.add(cur);
    include.add(cur);
    // Affinity cut: include the co-parent, but do not walk their natal family.
    if (coParents.has(cur) && cur !== egoId) continue;
    for (const p of parentsOf.get(cur) ?? []) {
      if (!visited.has(p)) queue.push(p);
    }
    for (const c of childrenOf.get(cur) ?? []) {
      if (!visited.has(c)) queue.push(c);
    }
  }
  for (const p of coParents) include.add(p);
  for (const c of childrenOf.get(egoId) ?? []) include.add(c);

  // Spouses on the shared tree relative to account holder when ego is that spouse's partner.
  for (const m of shared.members) {
    if (m.relation === 'spouse' && (childrenOf.get(egoId)?.has(shared.self_id) || coParents.has(m.id))) {
      include.add(m.id);
    }
  }

  const generation = new Map<string, number>([[egoId, 0]]);
  const genQueue = [egoId];
  while (genQueue.length) {
    const cur = genQueue.shift()!;
    const g = generation.get(cur)!;
    if (!(coParents.has(cur) && cur !== egoId)) {
      for (const p of parentsOf.get(cur) ?? []) {
        if (!include.has(p) || generation.has(p)) continue;
        generation.set(p, g - 1);
        genQueue.push(p);
      }
      for (const c of childrenOf.get(cur) ?? []) {
        if (!include.has(c) || generation.has(c)) continue;
        generation.set(c, g + 1);
        genQueue.push(c);
      }
    }
  }
  for (const p of coParents) {
    if (!generation.has(p)) generation.set(p, 0);
  }

  const egoChildren = childrenOf.get(egoId) ?? new Set<string>();
  const egoParents = parentsOf.get(egoId) ?? new Set<string>();
  const egoIsStepParent =
    byId.get(egoId)?.relation === 'step_parent' || kinshipParentHint(byId.get(egoId)!) === 'step_parent';

  const members: FamilyMemberDTO[] = [...include]
    .map((id) => byId.get(id))
    .filter((m): m is FamilyMemberDTO => Boolean(m))
    .map((m) => {
      let relation: FamilyRelationType = 'related';
      let label = m.kinship_title || m.relation_label || 'Relative';
      if (m.id === egoId) {
        relation = 'related';
        label = 'You';
      } else if (egoParents.has(m.id)) {
        relation = 'parent';
        label = m.kinship_title || m.relation_label || 'Parent';
      } else if (egoChildren.has(m.id)) {
        relation = egoIsStepParent ? 'step_child' : 'child';
        label = m.kinship_title || (egoIsStepParent ? 'Step-child' : 'Child');
      } else if (coParents.has(m.id)) {
        relation = 'spouse';
        label = m.kinship_title || m.relation_label || 'Partner';
      }
      const parentId =
        m.id === egoId
          ? null
          : egoParents.has(m.id)
            ? null
            : egoChildren.has(m.id)
              ? egoId
              : m.parent_id && include.has(m.parent_id)
                ? m.parent_id
                : null;
      return {
        ...m,
        relation,
        relation_label: m.id === egoId ? 'You' : label,
        generation: generation.get(m.id) ?? 0,
        is_self: m.id === egoId,
        parent_id: parentId,
        closeness: m.id === egoId ? 100 : m.closeness,
      };
    });

  members.sort(
    (a, b) =>
      a.generation - b.generation ||
      Number(Boolean(b.is_self)) - Number(Boolean(a.is_self)) ||
      a.name.localeCompare(b.name),
  );

  return {
    members,
    branches: [
      { side: 'partner', label: 'Partner side', color: '#a78bfa' },
      { side: 'other', label: 'Household', color: '#94a3b8' },
    ],
    self_id: egoId,
  };
}

/**
 * Inverse of how ego relates to the account owner on the user-centered tree.
 * Keeps "You" from collapsing to a vague Relative (and a review warning) on
 * Jerry/James/etc. ego trees.
 */
export function invertEgoRelationToAccountSelf(
  egoOnShared: Pick<FamilyMemberDTO, 'relation' | 'relation_label' | 'kinship_title' | 'side'> | undefined,
): { relation: FamilyRelationType; label: string } {
  if (!egoOnShared) return { relation: 'cousin', label: 'Cousin' };
  const r = egoOnShared.relation;
  const title = egoOnShared.kinship_title || egoOnShared.relation_label;
  switch (r) {
    case 'cousin':
      return { relation: 'cousin', label: title && title !== 'You' ? title : 'Cousin' };
    case 'sibling':
    case 'twin':
    case 'half_sibling':
    case 'step_sibling':
      return { relation: r, label: title && title !== 'You' ? title : 'Sibling' };
    case 'child':
    case 'step_child':
    case 'adopted_child':
      return {
        relation: r === 'step_child' ? 'step_parent' : r === 'adopted_child' ? 'adopted_parent' : 'parent',
        label: r === 'step_child' ? 'Step-parent' : r === 'adopted_child' ? 'Adoptive parent' : 'Parent',
      };
    case 'parent':
    case 'step_parent':
    case 'adopted_parent':
      return {
        relation: r === 'step_parent' ? 'step_child' : r === 'adopted_parent' ? 'adopted_child' : 'child',
        label: r === 'step_parent' ? 'Step-child' : r === 'adopted_parent' ? 'Adopted child' : 'Child',
      };
    case 'niece':
    case 'nephew':
      return {
        relation: egoOnShared.side === 'paternal' ? 'uncle' : 'aunt',
        label: egoOnShared.side === 'paternal' ? 'Uncle' : 'Aunt',
      };
    case 'aunt':
    case 'uncle':
      return { relation: 'niece', label: 'Niece / nephew' };
    case 'grandparent':
      return { relation: 'grandchild', label: 'Grandchild' };
    case 'grandchild':
      return { relation: 'grandparent', label: 'Grandparent' };
    case 'spouse':
      return { relation: 'spouse', label: title && title !== 'You' ? title : 'Spouse' };
    default:
      // Blood kin on the same shared tree — prefer cousin over vague "related".
      return { relation: 'cousin', label: 'Cousin' };
  }
}

/**
 * Re-root the account shared family tree onto another member so every kin modal
 * shows the same roster with bidirectional parent/child structure and siblings
 * inferred from shared parents (+ kinship titles like brother/sister).
 */
export function projectSharedFamilyTreeOntoEgo(
  shared: FamilyTreeDTO,
  egoId: string,
): FamilyTreeDTO {
  if (!shared.members.some((m) => m.id === egoId)) return shared;
  if (shared.self_id === egoId) {
    return {
      ...shared,
      members: shared.members.map((m) =>
        m.id === egoId
          ? { ...m, is_self: true, is_account_self: true, relation_label: m.relation_label || 'You' }
          : { ...m, is_self: false, is_account_self: m.id === shared.self_id },
      ),
    };
  }

  const byId = new Map(shared.members.map((m) => [m.id, m]));
  const accountSelfId = shared.self_id;
  const egoOnShared = byId.get(egoId);
  const parentEdges = collectAbsoluteParentChildEdges(shared);
  const parentsOf = new Map<string, Set<string>>();
  const childrenOf = new Map<string, Set<string>>();
  const addLink = (parentId: string, childId: string) => {
    if (!byId.has(parentId) || !byId.has(childId)) return;
    (parentsOf.get(childId) ?? parentsOf.set(childId, new Set()).get(childId)!).add(parentId);
    (childrenOf.get(parentId) ?? childrenOf.set(parentId, new Set()).get(parentId)!).add(childId);
  };
  for (const e of parentEdges) addLink(e.parentId, e.childId);

  // Generations via undirected parent/child walk from ego.
  const generation = new Map<string, number>([[egoId, 0]]);
  const queue = [egoId];
  while (queue.length) {
    const cur = queue.shift()!;
    const g = generation.get(cur)!;
    for (const p of parentsOf.get(cur) ?? []) {
      if (!generation.has(p)) {
        generation.set(p, g - 1);
        queue.push(p);
      }
    }
    for (const c of childrenOf.get(cur) ?? []) {
      if (!generation.has(c)) {
        generation.set(c, g + 1);
        queue.push(c);
      }
    }
  }
  // Keep unreachable members at their relative offset from original user centering.
  const originalSelfGen = 0;
  const egoOriginalGen = byId.get(egoId)?.generation ?? 0;
  for (const m of shared.members) {
    if (generation.has(m.id)) continue;
    generation.set(m.id, (m.generation - egoOriginalGen) || originalSelfGen);
  }

  const egoParents = parentsOf.get(egoId) ?? new Set<string>();
  const egoChildren = childrenOf.get(egoId) ?? new Set<string>();
  const egoParentList = [...egoParents];
  const egoSiblingIds = new Set(
    shared.members
      .filter((candidate) => {
        if (candidate.id === egoId) return false;
        const candidateParents = parentsOf.get(candidate.id) ?? new Set<string>();
        return egoParentList.some((parentId) => candidateParents.has(parentId));
      })
      .map((candidate) => candidate.id),
  );

  const classify = (m: FamilyMemberDTO): { relation: FamilyRelationType; label: string } => {
    if (m.id === egoId) return { relation: 'related', label: 'You' };
    // Account owner on a relative's tree — invert how that relative relates to You.
    if (m.id === accountSelfId) {
      return invertEgoRelationToAccountSelf(egoOnShared);
    }
    if (egoParents.has(m.id)) {
      const step = m.relation === 'step_parent' || kinshipParentHint(m) === 'step_parent';
      return {
        relation: step ? 'step_parent' : 'parent',
        label: step ? 'Step-parent' : 'Parent',
      };
    }
    if (egoChildren.has(m.id)) {
      return {
        relation: m.relation === 'step_child' ? 'step_child' : 'child',
        label: m.relation === 'step_child' ? 'Step-child' : 'Child',
      };
    }
    // Shared parent(s) → sibling (brother/sister titles reinforce).
    const theirParents = parentsOf.get(m.id) ?? new Set<string>();
    const sharedParents = egoParentList.filter((p) => theirParents.has(p));
    if (sharedParents.length > 0 || (kinshipSiblingHint(m) && (generation.get(m.id) ?? 99) === 0)) {
      const half = sharedParents.length > 0 && egoParentList.length > sharedParents.length;
      return {
        relation: half ? 'half_sibling' : 'sibling',
        label: half ? 'Half-sibling' : 'Sibling',
      };
    }
    // Child of an ego sibling → niece/nephew, never the ego's child.
    for (const siblingId of egoSiblingIds) {
      if ((childrenOf.get(siblingId) ?? new Set()).has(m.id)) {
        return { relation: 'niece', label: 'Niece / nephew' };
      }
    }
    // Parent of a parent → grandparent
    for (const p of egoParents) {
      if ((parentsOf.get(p) ?? new Set()).has(m.id) || kinshipGrandparentHint(m)) {
        if ((parentsOf.get(p) ?? new Set()).has(m.id) || (generation.get(m.id) ?? 0) <= -2) {
          return {
            relation: 'grandparent',
            label: 'Grandparent',
          };
        }
      }
    }
    if ([...egoParents].some((p) => (parentsOf.get(p) ?? new Set()).has(m.id))) {
      return {
        relation: 'grandparent',
        label: 'Grandparent',
      };
    }
    // Child of child → grandchild
    for (const c of egoChildren) {
      if ((childrenOf.get(c) ?? new Set()).has(m.id)) {
        return {
          relation: 'grandchild',
          label: 'Grandchild',
        };
      }
    }
    // Sibling of parent → aunt/uncle; their children → cousins
    for (const p of egoParents) {
      const parentSibs = [...(childrenOf.get([...parentsOf.get(p) ?? []][0] ?? '') ?? [])].filter((id) => id !== p);
      // Also: anyone who shares a parent with ego's parent
      for (const gp of parentsOf.get(p) ?? []) {
        for (const sib of childrenOf.get(gp) ?? []) {
          if (sib === p) continue;
          if (sib === m.id) {
            const au = kinshipAuntUncleHint(m) ?? (m.relation === 'uncle' ? 'uncle' : m.relation === 'aunt' ? 'aunt' : 'aunt');
            return {
              relation: au,
              label: au === 'uncle' ? 'Uncle' : 'Aunt',
            };
          }
          if ((childrenOf.get(sib) ?? new Set()).has(m.id)) {
            return {
              relation: 'cousin',
              label: 'Cousin',
            };
          }
        }
      }
      void parentSibs;
    }
    // Fall back: original user-relative label adjusted by generation delta, keep titles.
    const gen = generation.get(m.id) ?? 0;
    if (gen <= -2 || kinshipGrandparentHint(m)) {
      return { relation: 'grandparent', label: m.kinship_title || m.relation_label || 'Grandparent' };
    }
    if (gen === -1) {
      const au = kinshipAuntUncleHint(m);
      if (au) return { relation: au, label: m.kinship_title || m.relation_label || (au === 'uncle' ? 'Uncle' : 'Aunt') };
      const ph = kinshipParentHint(m);
      if (ph) return { relation: ph, label: m.kinship_title || m.relation_label || 'Parent' };
      return { relation: m.relation === 'uncle' || m.relation === 'aunt' ? m.relation : 'related', label: m.kinship_title || m.relation_label || 'Relative' };
    }
    if (gen === 1) {
      return { relation: 'child', label: m.kinship_title || m.relation_label || 'Child' };
    }
    if (gen === 0) {
      if (m.relation === 'cousin' || /\bcousin\b/i.test(`${m.kinship_title ?? ''} ${m.name}`)) {
        return { relation: 'cousin', label: m.kinship_title || m.relation_label || 'Cousin' };
      }
      if (m.relation === 'spouse') return { relation: 'spouse', label: m.kinship_title || m.relation_label || 'Spouse' };
      return { relation: 'related', label: m.kinship_title || m.relation_label || 'Relative' };
    }
    return {
      relation: m.relation,
      label: m.kinship_title || m.relation_label || labelForRelation(m.relation, m.name),
    };
  };

  const members = shared.members.map((m) => {
    const { relation, label } = classify(m);
    const gen = generation.get(m.id) ?? m.generation;
    const structuralParents = [...(parentsOf.get(m.id) ?? [])].sort();
    const parentId =
      m.parent_id && structuralParents.includes(m.parent_id)
        ? m.parent_id
        : structuralParents[0];
    return {
      ...m,
      relation,
      relation_label: m.id === egoId ? 'You' : label,
      generation: gen,
      is_self: m.id === egoId,
      is_account_self: m.id === accountSelfId,
      closeness: m.id === egoId ? 100 : m.closeness,
      // Re-emit the absolute connector after re-rooting. The DTO only supports
      // one display parent, so prefer the asserted parent and otherwise choose
      // a deterministic parent from the canonical graph.
      parent_id: parentId,
      needs_review: m.id === accountSelfId ? false : m.needs_review,
      review_reason: m.id === accountSelfId ? undefined : m.review_reason,
    };
  });

  members.sort(
    (a, b) =>
      a.generation - b.generation ||
      Number(Boolean(b.is_self)) - Number(Boolean(a.is_self)) ||
      a.name.localeCompare(b.name),
  );

  return {
    members,
    branches: shared.branches,
    self_id: egoId,
  };
}

export const familyTreeService = new FamilyTreeService();
