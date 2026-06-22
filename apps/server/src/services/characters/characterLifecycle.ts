/** Character card lifecycle — archive hides, pending_deletion is the review queue before hard delete. */
export const CHARACTER_LIFECYCLE_STATUSES = [
  'active',
  'inactive',
  'unmet',
  'archived',
  'pending_deletion',
] as const;

export type CharacterLifecycleStatus = (typeof CHARACTER_LIFECYCLE_STATUSES)[number];

const ALLOWED_TRANSITIONS: Record<string, CharacterLifecycleStatus[]> = {
  active: ['inactive', 'archived', 'pending_deletion'],
  inactive: ['active', 'archived', 'pending_deletion'],
  unmet: ['active', 'archived', 'pending_deletion'],
  archived: ['active', 'pending_deletion'],
  pending_deletion: ['archived', 'active'],
};

export function normalizeCharacterStatus(status: string | null | undefined): CharacterLifecycleStatus {
  const s = (status ?? 'active').toLowerCase();
  if (CHARACTER_LIFECYCLE_STATUSES.includes(s as CharacterLifecycleStatus)) {
    return s as CharacterLifecycleStatus;
  }
  return 'active';
}

export function assertCharacterStatusTransition(
  from: string | null | undefined,
  to: string
): { ok: true } | { ok: false; message: string } {
  const current = normalizeCharacterStatus(from);
  const next = normalizeCharacterStatus(to);
  if (current === next) return { ok: true };
  const allowed = ALLOWED_TRANSITIONS[current] ?? [];
  if (!allowed.includes(next)) {
    return {
      ok: false,
      message: `Cannot change character status from "${current}" to "${next}". Archive first, then queue for deletion before permanent removal.`,
    };
  }
  return { ok: true };
}

export function canPermanentlyDeleteCharacter(status: string | null | undefined): boolean {
  return normalizeCharacterStatus(status) === 'pending_deletion';
}
