/**
 * Place Duplicate Labeler.
 *
 * Bug it fixes: the duplicate reviewer labeled EVERY place alias as
 * "Venue alias", even private residences ("Abuelas House" ↔ "Abuela's house").
 * The merge can be correct while the explanation lies.
 *
 * Rule: a duplicate review label must come from PLACE SUBTYPE COMPATIBILITY,
 * not a generic "venue alias" default.
 *
 *   both residence            → "Private residence alias"
 *   both civic (city/region)  → "City alias"
 *   both venue                → "Venue alias"
 *   both education            → "School alias"
 *   parent ⊃ child (token)    → "Located-in relationship" (NOT an alias)
 *   incompatible families     → "Incompatible place types" (NOT an alias)
 *
 * When two names differ only by punctuation/possessive ("Abuelas House" vs
 * "Abuela's house"), the reason is "possessive spelling variant".
 */
import { classifyPlaceTaxonomy } from './placeTaxonomyClassifier';
import { evaluatePlaceMergeCompatibility, placeFamilyOf } from './placeMergeCompatibilityService';

const norm = (s: string) => (s ?? '').toLowerCase().replace(/['’]/g, "'").replace(/\s+/g, ' ').trim();
const titleCase = (s: string) => s.replace(/(^|\s)([a-zà-ÿ])/g, (_, pre: string, c: string) => pre + c.toUpperCase());

const RESIDENCE_NOUN = /\b(house|home|place|apartment|apt|condo|residence|casa|office|clinic|studio)\b/i;

const FAMILY_ALIAS_LABEL: Record<string, string> = {
  residence: 'Private residence alias',
  civic: 'City alias',
  venue: 'Venue alias',
  education: 'School alias',
  commerce: 'Business alias',
};

export interface PlaceDuplicateLabel {
  /** Human-facing label for the review card. */
  label: string;
  /** True only when this is genuinely an alias (same compatible family). */
  isAlias: boolean;
  relationship: 'alias' | 'located_in' | 'incompatible';
  leftSubtype: string;
  rightSubtype: string;
  placeSubtype: string;
  /** "possessive spelling variant" when the names differ only by punctuation. */
  variantReason?: string;
  canonicalSuggestion: string;
  aliasName: string;
  ownerDisplayName?: string;
  privacySensitive: boolean;
}

/** Collapse possessive spelling so "Abuelas House" and "Abuela's house" match. */
function possessiveKey(name: string): string {
  let s = norm(name).replace(/'/g, '');
  // Strip a trailing possessive 's' on the owner word before a residence noun.
  s = s.replace(/^(.+?)s\s+(house|home|place|apartment|apt|condo|residence|casa|office|clinic|studio)\b/, '$1 $2');
  return s.trim();
}

function isPossessiveVariant(a: string, b: string): boolean {
  return norm(a) !== norm(b) && possessiveKey(a) === possessiveKey(b);
}

/** Pick the better display form (prefer the explicit "X's House" possessive). */
function pickCanonical(a: string, b: string): { canonical: string; alias: string } {
  const aHasApostrophe = /'s\b/i.test(norm(a));
  const bHasApostrophe = /'s\b/i.test(norm(b));
  if (aHasApostrophe && !bHasApostrophe) return { canonical: titleCase(norm(a)), alias: b };
  if (bHasApostrophe && !aHasApostrophe) return { canonical: titleCase(norm(b)), alias: a };
  // Otherwise prefer the longer / more complete name.
  return a.length >= b.length ? { canonical: a, alias: b } : { canonical: b, alias: a };
}

function extractOwner(name: string): string | undefined {
  const m = /^(.+?)'s\s+/i.exec(norm(name)) || /^(.+?)s\s+(house|home|place|apartment|residence|casa|office|clinic|studio)\b/i.exec(norm(name));
  return m ? titleCase(m[1].trim()) : undefined;
}

function tokens(name: string): Set<string> {
  return new Set(norm(name).split(/\s+/).filter((w) => w.length > 1));
}

/** One contains the other's significant tokens → parent/child (located-in). */
function isContainment(a: string, b: string): boolean {
  const ta = tokens(a);
  const tb = tokens(b);
  if (ta.size === 0 || tb.size === 0 || ta.size === tb.size) return false;
  const [small, big] = ta.size < tb.size ? [ta, tb] : [tb, ta];
  return [...small].every((t) => big.has(t));
}

export function labelPlaceDuplicate(a: string, b: string, context = ''): PlaceDuplicateLabel {
  const left = classifyPlaceTaxonomy(a, context).placeType;
  const right = classifyPlaceTaxonomy(b, context).placeType;
  const leftFamily = placeFamilyOf(left);
  const rightFamily = placeFamilyOf(right);
  const compat = evaluatePlaceMergeCompatibility(left, right);

  const variantReason = isPossessiveVariant(a, b) ? 'possessive spelling variant' : undefined;
  const { canonical, alias } = pickCanonical(a, b);
  const ownerDisplayName = leftFamily === 'residence' || rightFamily === 'residence' ? extractOwner(canonical) : undefined;
  const privacySensitive = leftFamily === 'residence' || rightFamily === 'residence';

  const base = {
    leftSubtype: String(left),
    rightSubtype: String(right),
    canonicalSuggestion: canonical,
    aliasName: alias,
    ownerDisplayName,
    privacySensitive,
    variantReason,
  };

  // Parent/child relationship (e.g. Anaheim ⊃ Anaheim Family Home) — not an alias.
  if (!compat.compatible && isContainment(a, b)) {
    return { ...base, label: 'Located-in relationship', isAlias: false, relationship: 'located_in', placeSubtype: String(right) };
  }

  if (!compat.compatible) {
    return { ...base, label: 'Incompatible place types', isAlias: false, relationship: 'incompatible', placeSubtype: String(left) };
  }

  // Compatible families → a real alias. Label from subtype family.
  const family = leftFamily ?? rightFamily;
  const label = (family && FAMILY_ALIAS_LABEL[family]) ?? 'Place alias';
  // Prefer the more specific residence subtype for placeSubtype.
  const placeSubtype = RESIDENCE_NOUN.test(canonical) && family === 'residence' ? 'private_residence' : String(left);

  return { ...base, label, isAlias: true, relationship: 'alias', placeSubtype };
}
