/**
 * Rejection memory for entity cards the user deleted from the UI.
 * Exact name/alias keys only — does not block a different person who shares a first name.
 */
import { normalizeNameKey } from '../utils/nameNormalization';
import { supabaseAdmin } from './supabaseClient';

export type EntityRejectionHit = {
  eventId: string;
  entityId: string;
  entityName: string;
  deletionCount: number;
  deletionKind: string;
};

export async function findUserRejectedEntityCard(
  userId: string,
  mentionName: string
): Promise<EntityRejectionHit | null> {
  const key = normalizeNameKey(mentionName);
  if (!key || key.length < 2) return null;

  const { data } = await supabaseAdmin
    .from('entity_deletion_events')
    .select('id, entity_id, entity_name, normalized_keys, deletion_count, deletion_kind')
    .eq('user_id', userId)
    .eq('entity_type', 'character')
    .contains('normalized_keys', [key])
    .order('created_at', { ascending: false })
    .limit(1);

  const row = data?.[0];
  if (!row) return null;

  return {
    eventId: row.id as string,
    entityId: row.entity_id as string,
    entityName: row.entity_name as string,
    deletionCount: (row.deletion_count as number) ?? 1,
    deletionKind: (row.deletion_kind as string) ?? 'permanent',
  };
}

export async function isUserRejectedEntityCard(
  userId: string,
  mentionName: string
): Promise<boolean> {
  const hit = await findUserRejectedEntityCard(userId, mentionName);
  return hit != null && hit.deletionKind === 'permanent';
}

export function buildRejectionKeys(name: string, aliases: string[] = []): string[] {
  const keys = new Set<string>();
  const add = (n: string) => {
    const k = normalizeNameKey(n);
    if (k.length >= 2) keys.add(k);
  };
  add(name);
  for (const a of aliases) add(a);
  return [...keys];
}
