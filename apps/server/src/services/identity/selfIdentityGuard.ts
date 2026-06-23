import { normalizeNameKey } from '../../utils/nameNormalization';

export type SelfIdentityRow = {
  name?: string | null;
  metadata?: Record<string, unknown> | null;
};

const RESERVED_SELF_KEYS = new Set(['me', 'myself', 'self', 'you']);

export function isReservedSelfName(name: string | null | undefined): boolean {
  return RESERVED_SELF_KEYS.has(normalizeNameKey(String(name ?? '')));
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
