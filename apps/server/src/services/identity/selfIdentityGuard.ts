import { normalizeNameKey } from '../../utils/nameNormalization';

export type SelfIdentityRow = {
  name?: string | null;
  metadata?: Record<string, unknown> | null;
};

const RESERVED_SELF_KEYS = new Set(['me', 'myself', 'self', 'you', 'i']);

/** "And You" / "Also You" etc. — extraction sentence bleed, not a third person. */
const SELF_BLEED_RE =
  /^(?:also|and|but|so|then|well|just|or|plus|however|anyway)\s+you$/i;

export function isReservedSelfName(name: string | null | undefined): boolean {
  const key = normalizeNameKey(String(name ?? ''));
  if (!key) return false;
  if (RESERVED_SELF_KEYS.has(key)) return true;
  return SELF_BLEED_RE.test(key);
}

/**
 * Chip / book label for self-reference. Sentence bleed becomes "You (Firstname)"
 * when a real first name is available; otherwise plain "You".
 */
export function formatSelfChipLabel(
  name: string | null | undefined,
  metadata?: Record<string, unknown> | null,
): string {
  const meta = metadata ?? {};
  const real = typeof meta.real_name === 'string' ? meta.real_name.trim() : '';
  const firstMeta = typeof meta.first_name === 'string' ? meta.first_name.trim() : '';
  const firstToken = (firstMeta || real.split(/\s+/)[0] || '').trim();
  const first =
    firstToken && !isReservedSelfName(firstToken)
      ? firstToken.charAt(0).toUpperCase() + firstToken.slice(1)
      : '';
  if (isReservedSelfName(name) || meta.is_self === true || meta.is_user === true) {
    return first ? `You (${first})` : 'You';
  }
  return String(name ?? '').trim() || 'You';
}

export function isSelfCharacterRow(row: SelfIdentityRow | null | undefined): boolean {
  if (!row) return false;
  const metadata = (row.metadata ?? {}) as Record<string, unknown>;
  return metadata.is_self === true || metadata.is_user === true || isReservedSelfName(row.name);
}

export function incomingAllowsSelfMatch(names: Array<string | null | undefined>): boolean {
  return names.some((name) => isReservedSelfName(name));
}

export function filterSelfCandidatesForIncoming<T extends SelfIdentityRow>(
  incomingNames: Array<string | null | undefined>,
  rows: T[]
): T[] {
  if (incomingAllowsSelfMatch(incomingNames)) return rows;
  return rows.filter((row) => !isSelfCharacterRow(row));
}
