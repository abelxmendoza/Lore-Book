/**
 * Shared romance identity labels for Character Book and Dating & Romance.
 * One composed badge — never restates "Situationship" / type / exclusivity
 * as separate chips.
 */

import { getRomanticDemoProfile } from '../mocks/romanticDemoProfiles';
import { normalizeSignalLabel } from './characterCardSignals';

export type RomanticLabelInput = {
  id?: string;
  relationship_type?: string | null;
  status?: string | null;
  is_situationship?: boolean | null;
  exclusivity_status?: string | null;
  is_current?: boolean | null;
};

const ROMANCE_IDENTITY_TYPES = new Set([
  'girlfriend',
  'boyfriend',
  'wife',
  'husband',
  'fiancé',
  'fiance',
  'fiancée',
  'fiancee',
  'partner',
  'lover',
  'dating',
  'crush',
  'situationship',
  'ex_girlfriend',
  'ex_boyfriend',
  'ex_wife',
  'ex_husband',
  'ex_lover',
  'divorced',
  'co_parent',
  'baby_mama',
  'baby_daddy',
  'infatuation',
  'obsession',
  'hooking_up',
  'friends_with_benefits',
  'talking',
]);

/** Married / divorced / co-parent taxonomies — shared with Dating & Romance tabs. */
export const MARRIED_ROMANCE_TYPES = new Set(['wife', 'husband']);
export const DIVORCED_ROMANCE_TYPES = new Set(['divorced', 'ex_wife', 'ex_husband']);
export const CO_PARENT_ROMANCE_TYPES = new Set(['co_parent', 'baby_mama', 'baby_daddy']);

/** Tags that only restate romance / status already on the card. */
export const ROMANCE_NOISE_TAGS = new Set([
  'romantic',
  'situationship',
  'active',
  'casual',
  'dating',
  'relationship',
  'ex',
  'past',
  'ended',
  'crush',
  'partner',
  'girlfriend',
  'boyfriend',
  'wife',
  'husband',
  'divorced',
  'co_parent',
  'baby_mama',
  'baby_daddy',
  'married',
]);

export function humanizeRomanceToken(value: string): string {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());
}

export function formatExclusivityLabel(exclusivity?: string | null): string | null {
  if (!exclusivity) return null;
  const key = exclusivity.toLowerCase();
  if (key === 'not_exclusive' || key === 'non_exclusive') return 'Not exclusive';
  if (key === 'exclusive') return 'Exclusive';
  if (key === 'open') return 'Open';
  return humanizeRomanceToken(exclusivity);
}

export function normalizeRomanceTypeKey(value?: string | null): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
}

export function isRomanceIdentityType(value?: string | null): boolean {
  const key = normalizeRomanceTypeKey(value);
  if (!key) return false;
  if (ROMANCE_IDENTITY_TYPES.has(key)) return true;
  if (key.startsWith('ex_')) return true;
  return /situationship|girlfriend|boyfriend|wife|husband|crush|dating|lover|fianc|divorced|co[_ ]?parent|baby[_ ]?(mama|daddy)/.test(
    key,
  );
}

export function isMarriedRomanceType(value?: string | null): boolean {
  return MARRIED_ROMANCE_TYPES.has(normalizeRomanceTypeKey(value));
}

export function isDivorcedRomanceType(value?: string | null): boolean {
  return DIVORCED_ROMANCE_TYPES.has(normalizeRomanceTypeKey(value));
}

export function isCoParentRomanceType(value?: string | null): boolean {
  return CO_PARENT_ROMANCE_TYPES.has(normalizeRomanceTypeKey(value));
}

/** True when a badge label is just restating situationship / the romance type. */
export function isRedundantRomanceIdentityLabel(
  label: string,
  relationshipType?: string | null,
): boolean {
  const normalized = normalizeSignalLabel(label);
  if (!normalized) return false;
  if (normalized === 'situationship') return true;
  if (isRomanceIdentityType(normalized)) return true;
  const type = normalizeSignalLabel(relationshipType ?? '');
  return Boolean(type) && normalized === type;
}

/**
 * Single Dating & Romance–style badge: prefer demo showcaseTag, otherwise
 * compose type · exclusivity / status without duplicating situationship.
 */
export function composeRomanticRelationshipBadgeLabel(rel: RomanticLabelInput): string {
  if (rel.id) {
    const showcase = getRomanticDemoProfile(rel.id)?.showcaseTag;
    if (showcase) return showcase;
  }

  const type = normalizeRomanceTypeKey(rel.relationship_type);
  const typeLabel = type ? humanizeRomanceToken(type) : null;
  const exclusivity = formatExclusivityLabel(rel.exclusivity_status);
  const statusKey = (rel.status ?? '').toLowerCase();
  const statusLabel =
    statusKey && statusKey !== 'active'
      ? humanizeRomanceToken(statusKey)
      : null;

  // Married / divorced / co-parent — same vocabulary as Dating & Romance showcase.
  if (isMarriedRomanceType(type)) {
    return ['Married', statusLabel ?? (statusKey === 'active' || !statusKey ? 'Active' : null)]
      .filter(Boolean)
      .join(' · ');
  }
  if (isDivorcedRomanceType(type)) {
    return ['Divorced', statusLabel ?? 'Ended'].filter(Boolean).join(' · ');
  }
  if (isCoParentRomanceType(type)) {
    return ['Co-parent', statusLabel].filter(Boolean).join(' · ') || 'Co-parent';
  }

  // Situationship identity once — match Dating & Romance showcase shape.
  if (type === 'situationship' || rel.is_situationship) {
    const head = type === 'situationship' ? typeLabel : typeLabel || 'Situationship';
    const situationshipExtra =
      rel.is_situationship && type && type !== 'situationship' ? 'Situationship' : null;
    return [
      head,
      situationshipExtra,
      exclusivity ?? (type === 'situationship' || rel.is_situationship ? 'Not exclusive' : null),
      statusLabel,
    ]
      .filter(Boolean)
      .join(' · ');
  }

  return [typeLabel, exclusivity, statusLabel].filter(Boolean).join(' · ') || 'Relationship';
}

/**
 * Resolve one romance identity line for a Character Book card — from the linked
 * Dating & Romance row when present, otherwise from character role/metadata/tags.
 */
export function resolveCharacterRomanceIdentity(input: {
  relationship?: RomanticLabelInput | null;
  role?: string | null;
  archetype?: string | null;
  tags?: string[] | null;
  metadata?: Record<string, unknown> | null;
  status?: string | null;
}): string | null {
  if (input.relationship?.relationship_type || input.relationship?.is_situationship) {
    return composeRomanticRelationshipBadgeLabel(input.relationship);
  }

  const metaType =
    typeof input.metadata?.relationship_type === 'string'
      ? input.metadata.relationship_type
      : null;
  const roleType = isRomanceIdentityType(input.role) ? input.role : null;
  const tagType = (input.tags ?? []).find((tag) => isRomanceIdentityType(tag)) ?? null;
  const type = metaType || roleType || tagType;
  // Do not invent a Dating bond from archetype alone — Dating & Romance owns that.
  if (!type) return null;

  const inferredType = normalizeRomanceTypeKey(type);
  if (!inferredType) return null;
  const isSituationship =
    inferredType === 'situationship' ||
    (input.tags ?? []).some((tag) => normalizeSignalLabel(tag) === 'situationship');

  return composeRomanticRelationshipBadgeLabel({
    relationship_type: inferredType,
    status: input.status ?? 'active',
    is_situationship: isSituationship,
  });
}
