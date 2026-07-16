/**
 * Self-reference chip labels.
 *
 * Extraction sometimes stores sentence-bleed fragments as character names
 * ("And You", "Also You"). Those must never surface as third-person chips —
 * they are the user, shown as "You" or "You (Firstname)".
 */

const EXACT_SELF_KEYS = new Set(['me', 'myself', 'self', 'you', 'i', 'my', 'mine']);

/** "and" / "also" / … + "you" — classic sentence bleed from assistant copy. */
const SELF_BLEED_RE =
  /^(?:also|and|but|so|then|well|just|or|plus|however|anyway)\s+you$/i;

function normalizeKey(name: string): string {
  return (name ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** True for bare self pronouns and connective+you bleed ("And You"). */
export function isSelfBleedLabel(name: string | null | undefined): boolean {
  const key = normalizeKey(String(name ?? ''));
  if (!key) return false;
  if (EXACT_SELF_KEYS.has(key)) return true;
  return SELF_BLEED_RE.test(key);
}

function firstNameFrom(value: string | null | undefined): string | null {
  const raw = String(value ?? '').trim();
  if (!raw || isSelfBleedLabel(raw)) return null;
  const first = raw.split(/\s+/)[0] ?? '';
  if (!first || isSelfBleedLabel(first) || /^(me|you)$/i.test(first)) return null;
  return first.charAt(0).toUpperCase() + first.slice(1);
}

export type SelfChipNameSource = {
  name?: string | null;
  first_name?: string | null;
  real_name?: string | null;
  metadata?: Record<string, unknown> | null;
};

/**
 * Prefer "You (Abel)" when we know a real first name; otherwise "You".
 * Returns null when the raw label is not a self / bleed label (caller keeps it).
 */
export function formatSelfChipLabel(
  rawName: string | null | undefined,
  source?: SelfChipNameSource | null,
): string | null {
  if (!isSelfBleedLabel(rawName) && !isSelfBleedLabel(source?.name)) {
    // Explicit self flags still reformat reserved bare names only.
    const meta = source?.metadata ?? {};
    const flagged = meta.is_self === true || meta.is_user === true;
    if (!flagged || !isSelfBleedLabel(rawName)) return null;
  }

  const meta = source?.metadata ?? {};
  const first =
    firstNameFrom(source?.first_name) ||
    firstNameFrom(typeof meta.first_name === 'string' ? meta.first_name : null) ||
    firstNameFrom(source?.real_name) ||
    firstNameFrom(typeof meta.real_name === 'string' ? meta.real_name : null) ||
    // If the stored name is a real person name (not bleed), use its first token.
    (source?.name && !isSelfBleedLabel(source.name) ? firstNameFrom(source.name) : null);

  return first ? `You (${first})` : 'You';
}

/** Display helper for any chip label that might be self-bleed. */
export function displayChipName(
  rawName: string | null | undefined,
  source?: SelfChipNameSource | null,
): string {
  const formatted = formatSelfChipLabel(rawName, source);
  if (formatted) return formatted;
  const fallback = String(rawName ?? '').trim();
  return fallback || 'You';
}
