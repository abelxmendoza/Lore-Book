// © 2025 Abel Mendoza — Omega Technologies. All Rights Reserved.

/**
 * Dedicated color system for romantic relationship status badges. Kept
 * separate from any other badge/tag palette in the app (character roles,
 * organization tiers, etc.) — this hue set exists only to answer "what kind
 * of bond is this" at a glance, so it needs its own vocabulary rather than
 * reusing whatever colors those other systems land on.
 *
 * `status` on its own collapses too much: "active" covers a committed
 * girlfriend, a week-old crush, an undefined situationship, and a fresh
 * infatuation alike. For an active bond we also read `relationship_type` /
 * `is_situationship` to land on the right shade; every other status is
 * distinct enough on its own.
 *
 * Class strings below are written out in full (not built via template
 * interpolation) on purpose — Tailwind's build-time scanner only picks up
 * literal class names it can see in source, so `` `bg-${hue}-500/15` `` would
 * silently compile to no styles at all.
 */

export type RelationshipColorKey =
  | 'committed'
  | 'early_interest'
  | 'situationship'
  | 'intense'
  | 'active_default'
  | 'on_break'
  | 'paused'
  | 'complicated'
  | 'unrequited'
  | 'fading'
  | 'ghosted'
  | 'ended'
  | 'blocked'
  | 'rekindled';

export type RelationshipColorClasses = {
  bg: string;
  text: string;
  border: string;
  /** Combined className, ready to drop onto a Badge. */
  className: string;
};

const COMMITTED_TYPES = new Set([
  'girlfriend', 'boyfriend', 'wife', 'husband', 'fiancé', 'fiancée', 'lover', 'partner',
]);
const EARLY_INTEREST_TYPES = new Set(['crush', 'talking', 'dating']);
const SITUATIONSHIP_TYPES = new Set([
  'situationship', 'hooking_up', 'fuck_buddy', 'friends_with_benefits', 'one_night_stand',
]);
const INTENSE_TYPES = new Set(['infatuation', 'obsession', 'in_love', 'lust']);

const RELATIONSHIP_STATUS_COLORS: Record<RelationshipColorKey, RelationshipColorClasses> = {
  // Active, differentiated by what kind of active it is.
  committed: {
    bg: 'bg-emerald-500/15', text: 'text-emerald-300', border: 'border-emerald-500/25',
    className: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/25',
  },
  early_interest: {
    bg: 'bg-violet-500/15', text: 'text-violet-300', border: 'border-violet-500/25',
    className: 'bg-violet-500/15 text-violet-300 border-violet-500/25',
  },
  situationship: {
    bg: 'bg-fuchsia-500/15', text: 'text-fuchsia-300', border: 'border-fuchsia-500/25',
    className: 'bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/25',
  },
  intense: {
    bg: 'bg-pink-500/15', text: 'text-pink-300', border: 'border-pink-500/25',
    className: 'bg-pink-500/15 text-pink-300 border-pink-500/25',
  },
  active_default: {
    bg: 'bg-green-500/15', text: 'text-green-300', border: 'border-green-500/25',
    className: 'bg-green-500/15 text-green-300 border-green-500/25',
  },
  // Currently paused, not ended.
  on_break: {
    bg: 'bg-sky-500/15', text: 'text-sky-300', border: 'border-sky-500/25',
    className: 'bg-sky-500/15 text-sky-300 border-sky-500/25',
  },
  paused: {
    bg: 'bg-indigo-500/15', text: 'text-indigo-300', border: 'border-indigo-500/25',
    className: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/25',
  },
  // Uncertain / caution.
  complicated: {
    bg: 'bg-amber-500/15', text: 'text-amber-200', border: 'border-amber-500/25',
    className: 'bg-amber-500/15 text-amber-200 border-amber-500/25',
  },
  unrequited: {
    bg: 'bg-orange-500/15', text: 'text-orange-300', border: 'border-orange-500/25',
    className: 'bg-orange-500/15 text-orange-300 border-orange-500/25',
  },
  fading: {
    bg: 'bg-rose-500/10', text: 'text-rose-300/70', border: 'border-rose-500/15',
    className: 'bg-rose-500/10 text-rose-300/70 border-rose-500/15',
  },
  // Ended states, each a distinct note.
  ghosted: {
    bg: 'bg-slate-500/20', text: 'text-slate-300', border: 'border-slate-500/30',
    className: 'bg-slate-500/20 text-slate-300 border-slate-500/30',
  },
  ended: {
    bg: 'bg-zinc-500/15', text: 'text-zinc-300', border: 'border-zinc-500/25',
    className: 'bg-zinc-500/15 text-zinc-300 border-zinc-500/25',
  },
  blocked: {
    bg: 'bg-red-500/15', text: 'text-red-300', border: 'border-red-500/25',
    className: 'bg-red-500/15 text-red-300 border-red-500/25',
  },
  rekindled: {
    bg: 'bg-teal-500/15', text: 'text-teal-300', border: 'border-teal-500/25',
    className: 'bg-teal-500/15 text-teal-300 border-teal-500/25',
  },
};

export type RelationshipColorInput = {
  status: string;
  relationship_type?: string;
  is_situationship?: boolean;
};

/** Resolve which color-system key applies to a relationship. */
export function getRelationshipColorKey(relationship: RelationshipColorInput): RelationshipColorKey {
  const status = (relationship.status ?? '').toLowerCase();
  const type = (relationship.relationship_type ?? '').toLowerCase();

  if (status !== 'active') {
    switch (status) {
      case 'on_break': return 'on_break';
      case 'paused': return 'paused';
      case 'complicated': return 'complicated';
      case 'unrequited': return 'unrequited';
      case 'fading': return 'fading';
      case 'ghosted': return 'ghosted';
      case 'ended': return 'ended';
      case 'blocked': return 'blocked';
      case 'rekindled': return 'rekindled';
      default: return 'active_default';
    }
  }

  if (relationship.is_situationship || SITUATIONSHIP_TYPES.has(type)) return 'situationship';
  if (INTENSE_TYPES.has(type)) return 'intense';
  if (COMMITTED_TYPES.has(type)) return 'committed';
  if (EARLY_INTEREST_TYPES.has(type)) return 'early_interest';
  return 'active_default';
}

/** Tailwind classes for a relationship's status badge. */
export function getRelationshipStatusClasses(relationship: RelationshipColorInput): RelationshipColorClasses {
  return RELATIONSHIP_STATUS_COLORS[getRelationshipColorKey(relationship)];
}
