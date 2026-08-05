/**
 * Shared romance identity labels for Character Book and Dating & Romance.
 * One composed badge — never restates "Situationship" / type / exclusivity
 * as separate chips.
 */

import { getRomanticDemoProfile } from '../mocks/romanticDemoProfiles';

export type RomanticLabelInput = {
  id?: string;
  relationship_type?: string | null;
  status?: string | null;
  is_situationship?: boolean | null;
  exclusivity_status?: string | null;
  is_current?: boolean | null;
};

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

/** True when a badge label is just restating situationship / the romance type. */
export function isRedundantRomanceIdentityLabel(
  label: string,
  relationshipType?: string | null,
): boolean {
  const normalized = label.toLowerCase().replace(/[-_]+/g, ' ').trim();
  if (!normalized) return false;
  if (normalized === 'situationship') return true;
  const type = (relationshipType ?? '').toLowerCase().replace(/_/g, ' ').trim();
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

  const type = (rel.relationship_type ?? '').toLowerCase();
  const typeLabel = type ? humanizeRomanceToken(type) : null;
  const exclusivity = formatExclusivityLabel(rel.exclusivity_status);
  const statusKey = (rel.status ?? '').toLowerCase();
  const statusLabel =
    statusKey && statusKey !== 'active'
      ? humanizeRomanceToken(statusKey)
      : null;

  // Situationship identity once — match Dating & Romance showcase shape.
  if (type === 'situationship' || rel.is_situationship) {
    const head = type === 'situationship' ? typeLabel : typeLabel || 'Situationship';
    const situationshipExtra =
      rel.is_situationship && type && type !== 'situationship' ? 'Situationship' : null;
    return [head, situationshipExtra, exclusivity ?? (type === 'situationship' ? 'Not exclusive' : null), statusLabel]
      .filter(Boolean)
      .join(' · ');
  }

  return [typeLabel, exclusivity, statusLabel].filter(Boolean).join(' · ') || 'Relationship';
}
