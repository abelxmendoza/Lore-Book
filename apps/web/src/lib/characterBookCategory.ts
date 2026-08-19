/**
 * Character Book category — which tab (Family / Romantic / Friends / ...) a
 * character belongs in. Inferred from kinship, romance, and work context;
 * manually pinnable when the inference lands in the wrong tab.
 */

import { isKinshipShapedRelationshipToYou } from './relationshipToYou';

export type BookCategory = 'family' | 'romantic' | 'friends' | 'professional' | 'creative' | 'acquaintances';

export const BOOK_CATEGORY_OPTIONS: Array<{ value: 'auto' | BookCategory; label: string }> = [
  { value: 'auto', label: 'Auto (recommended)' },
  { value: 'family', label: 'Family' },
  { value: 'romantic', label: 'Romantic' },
  { value: 'friends', label: 'Friends' },
  { value: 'professional', label: 'Professional' },
  { value: 'creative', label: 'Creative' },
  { value: 'acquaintances', label: 'Acquaintances' },
];

const KNOWN_CATEGORIES = new Set<string>(
  BOOK_CATEGORY_OPTIONS.filter((o) => o.value !== 'auto').map((o) => o.value),
);

/** Archetypes whose meaning is inherently romantic/crush — pinning one of
 *  these should exclude the character from Family unless Family is pinned. */
export const ROMANTIC_OR_CRUSH_ARCHETYPES = new Set<string>([
  'romantic',
  'crush',
  'unrequited_crush',
  'past_romantic',
  'romantic_interest',
  'one_night_stand',
]);

const FAMILY_NAME_TITLE_RE =
  /^(?:my\s+)?(?:t[ií]o|t[ií]a|uncle|aunt|mom|mother|dad|father|grandma|grandpa|abuela|abuelo|cousin|sister|brother|stepmom|stepdad)(?:\s|$)/i;

function normalizeCategoryKey(raw: string | null | undefined): string {
  return (raw ?? '').trim().toLowerCase();
}

export function bookCategoryLabel(value: string): string {
  const key = normalizeCategoryKey(value);
  const preset = BOOK_CATEGORY_OPTIONS.find((o) => o.value === key);
  if (preset) return preset.label;
  return value.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Reads the user's pinned category, if any. Returns null for "auto" or an
 *  unrecognized value (falls back to inference). */
export function pinnedBookCategory(meta: Record<string, unknown> | null | undefined): BookCategory | null {
  const raw = meta?.book_category;
  if (typeof raw !== 'string') return null;
  const key = normalizeCategoryKey(raw);
  return KNOWN_CATEGORIES.has(key) ? (key as BookCategory) : null;
}

type InferenceInput = {
  archetype?: string | null;
  metadata?: Record<string, unknown> | null;
  name?: string | null;
};

function hasFamilyContext(input: InferenceInput): boolean {
  const meta = input.metadata ?? {};
  if (typeof meta.relationship_to_user === 'string' && isKinshipShapedRelationshipToYou(meta.relationship_to_user)) {
    return true;
  }
  if (typeof meta.relationship_type === 'string' && isKinshipShapedRelationshipToYou(meta.relationship_type)) {
    return true;
  }
  if (typeof meta.kinship_label === 'string' && meta.kinship_label.trim()) return true;
  return FAMILY_NAME_TITLE_RE.test((input.name ?? '').trim());
}

/**
 * Best-effort tab for a character with no pin. Always returns a category
 * plus a short human-readable reason shown under the picker.
 */
export function inferredBookCategory(
  character: InferenceInput,
  context: { hasDatingRow?: boolean } = {},
): { category: BookCategory; reason: string } {
  const meta = character.metadata ?? {};
  const familyExcluded = Boolean((meta.family_excluded as { value?: boolean } | null | undefined)?.value);
  const archetypeList = String(character.archetype ?? '')
    .split(',')
    .map((a) => a.trim().toLowerCase())
    .filter(Boolean);
  const primary = archetypeList[0] ?? '';

  if (context.hasDatingRow || archetypeList.some((a) => ROMANTIC_OR_CRUSH_ARCHETYPES.has(a))) {
    return { category: 'romantic', reason: 'A romantic or dating connection is on record for them.' };
  }
  if (!familyExcluded && (primary === 'family' || hasFamilyContext(character))) {
    return { category: 'family', reason: 'Kinship context (name or relationship label) points to Family.' };
  }
  if (primary === 'professional') {
    return { category: 'professional', reason: 'Work or professional context is on record for them.' };
  }
  if (primary === 'muse') {
    return { category: 'creative', reason: 'Their story role centers on creative collaboration or inspiration.' };
  }
  if (primary === 'acquaintance') {
    return { category: 'acquaintances', reason: 'Not much story context yet — filed as an acquaintance.' };
  }
  return { category: 'friends', reason: 'Defaulting to Friends — no stronger kinship, romance, or work signal found.' };
}

/**
 * Builds the metadata patch for a manual Character Book category correction.
 * "auto" clears the pin (and any exclusion it implied) so inference decides
 * again. Pinning away from Family marks family_excluded so the character
 * won't drift back on its own; pinning Family clears any prior exclusion.
 */
export function buildBookCategoryMetadataPatch(input: {
  nextRaw: string;
  previousCategory?: string | null;
  previousExcluded?: unknown;
}): Record<string, unknown> {
  const confirmedAt = new Date().toISOString();
  const nextKey = normalizeCategoryKey(input.nextRaw);
  const next = nextKey && nextKey !== 'auto' && KNOWN_CATEGORIES.has(nextKey) ? (nextKey as BookCategory) : null;
  const previous = typeof input.previousCategory === 'string' ? normalizeCategoryKey(input.previousCategory) : null;

  if (!next) {
    const patch: Record<string, unknown> = {
      book_category: null,
      book_category_reason: null,
      book_category_confirmed_at: confirmedAt,
    };
    if (input.previousExcluded) patch.family_excluded = null;
    return patch;
  }

  const patch: Record<string, unknown> = {
    book_category: next,
    book_category_confirmed_at: confirmedAt,
    manual_book_category_correction: {
      field: 'book_category',
      previous: previous || null,
      corrected: next,
      corrected_at: confirmedAt,
    },
  };

  if (next === 'family') {
    if (input.previousExcluded) patch.family_excluded = null;
  } else if (previous !== next || input.previousExcluded) {
    patch.family_excluded = { value: true, reason: `book_category:${next}`, at: confirmedAt };
  }

  return patch;
}
