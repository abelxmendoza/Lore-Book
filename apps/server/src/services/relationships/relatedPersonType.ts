/**
 * How a stored character_relationships row should read on a given card.
 *
 * Graph edges (`uncle_of`) mean source IS that kin of target.
 * Editor rows (`grandson`, `friend`) mean source says the other person is that type.
 * Relationship-to-you is always from the account owner: invert it when the
 * other person on this card is the owner.
 */
import {
  inverseFamilyEdgeType,
  kinshipStringToTreeRelation,
  normalizeFamilyEdgeType,
} from '../kinship/familyEdgeWriter';
import { kinshipRoleFromName } from '../familyGroupSyncService';

const GENERIC_TYPES = new Set([
  'friend',
  'family',
  'related',
  'related_to',
  'story_association',
  'associated_in_story',
  'mentioned_via',
  'unknown',
  '',
]);

function normalizeKey(type: string): string {
  return String(type ?? '')
    .toLowerCase()
    .trim()
    .replace(/[\s-]+/g, '_');
}

function stripOf(type: string): string {
  return type.replace(/_of$/, '');
}

export function isGenericRelatedType(type: string): boolean {
  return GENERIC_TYPES.has(normalizeKey(type));
}

export function inverseSurfaceRelationshipType(type: string): string | null {
  const raw = normalizeKey(type);
  if (!raw) return null;
  const edge = normalizeFamilyEdgeType(raw);
  const inverse = inverseFamilyEdgeType(edge);
  if (!inverse) return raw === 'friend' || raw === 'coworker' || raw === 'cousin' ? raw : null;
  return stripOf(inverse);
}

/**
 * Label for `otherPerson` on `viewer`'s card.
 */
/**
 * If both people already have a Relationship to you, infer how they relate
 * to each other (grandmother + aunt → child) so cards do not ask the user
 * to re-enter the same family facts.
 */
export function composeKinshipViaYou(
  viewerToYou: string | null | undefined,
  otherToYou: string | null | undefined,
): string | null {
  const viewer = kinshipStringToTreeRelation(String(viewerToYou ?? ''));
  const other = kinshipStringToTreeRelation(String(otherToYou ?? ''));
  if (!viewer || !other) return null;
  if (viewer === 'related' || other === 'related' || viewer === 'in_law' || other === 'in_law') {
    return null;
  }

  const table: Record<string, Record<string, string>> = {
    grandparent: {
      parent: 'child',
      aunt: 'child',
      uncle: 'child',
      sibling: 'grandchild',
      child: 'grandchild',
      niece: 'grandchild',
      nephew: 'grandchild',
      grandparent: 'spouse',
    },
    parent: {
      grandparent: 'parent',
      aunt: 'sibling',
      uncle: 'sibling',
      sibling: 'child',
      child: 'grandchild',
      niece: 'grandchild',
      nephew: 'grandchild',
      parent: 'spouse',
    },
    aunt: {
      grandparent: 'parent',
      parent: 'sibling',
      uncle: 'sibling',
      aunt: 'sibling',
      sibling: 'niece',
      child: 'niece',
    },
    uncle: {
      grandparent: 'parent',
      parent: 'sibling',
      aunt: 'sibling',
      uncle: 'sibling',
      sibling: 'nephew',
      child: 'nephew',
    },
    sibling: {
      parent: 'parent',
      grandparent: 'grandparent',
      aunt: 'aunt',
      uncle: 'uncle',
      sibling: 'sibling',
      child: 'niece',
      niece: 'child',
      nephew: 'child',
    },
    child: {
      parent: 'grandparent',
      grandparent: 'great_grandparent',
      aunt: 'aunt',
      uncle: 'uncle',
      sibling: 'aunt',
      child: 'sibling',
    },
    niece: {
      parent: 'grandparent',
      sibling: 'parent',
      aunt: 'aunt',
      uncle: 'uncle',
    },
    nephew: {
      parent: 'grandparent',
      sibling: 'parent',
      aunt: 'aunt',
      uncle: 'uncle',
    },
    grandchild: {
      parent: 'great_grandparent',
      sibling: 'parent',
      aunt: 'great_aunt',
      uncle: 'great_uncle',
      grandparent: 'parent',
    },
  };

  const composed = table[viewer]?.[other] ?? null;
  if (!composed || composed.startsWith('great_')) return null;
  return composed;
}

export function relationshipTypeForViewer(storedType: string, viewerIsSource: boolean): string {
  const raw = normalizeKey(storedType);
  if (!raw) return raw;
  const isGraphEdge = raw.endsWith('_of') && raw !== 'related_to';
  if (isGraphEdge) {
    const viewed = viewerIsSource ? (inverseFamilyEdgeType(raw) ?? raw) : raw;
    return stripOf(viewed);
  }
  if (viewerIsSource) return raw;
  return inverseSurfaceRelationshipType(raw) ?? raw;
}

export function resolveRelatedPersonType(input: {
  storedType: string;
  viewerIsSource: boolean;
  viewerIsSelf?: boolean;
  otherIsSelf?: boolean;
  viewerRelationshipToYou?: string | null;
  otherRelationshipToYou?: string | null;
  otherName?: string | null;
  groupRole?: string | null;
}): string {
  const viewed = relationshipTypeForViewer(input.storedType, input.viewerIsSource);

  if (input.otherIsSelf && input.viewerRelationshipToYou) {
    if (isGenericRelatedType(viewed)) {
      return inverseSurfaceRelationshipType(input.viewerRelationshipToYou) ?? viewed;
    }
  }
  if (input.viewerIsSelf && input.otherRelationshipToYou) {
    if (isGenericRelatedType(viewed)) {
      return normalizeKey(input.otherRelationshipToYou) || viewed;
    }
  }

  if (isGenericRelatedType(viewed)) {
    const composed = composeKinshipViaYou(input.viewerRelationshipToYou, input.otherRelationshipToYou);
    if (composed) return composed;
  }

  if (!isGenericRelatedType(viewed)) return viewed;

  const role = normalizeKey(input.groupRole ?? '');
  if (role && role !== 'member' && !isGenericRelatedType(role)) return role;

  if (input.viewerIsSelf) {
    const fromName = kinshipRoleFromName(input.otherName ?? '');
    if (fromName === 'nibling') return 'nephew';
    if (fromName) return fromName;
  }

  return viewed;
}

export function isSelfCharacterMetadata(
  metadata?: Record<string, unknown> | null,
  name?: string | null,
): boolean {
  const meta = metadata ?? {};
  if (meta.distinct_from_self === true || meta.confirmed_distinct === true) return false;
  if (meta.is_self === true || meta.is_user === true) return true;
  return /^(me|myself|self|you)$/i.test(String(name ?? '').trim());
}
