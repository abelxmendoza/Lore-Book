/**
 * P6 invalidation helpers — version fingerprints for derived projections.
 */
import { createHash } from 'crypto';

import { supabaseAdmin } from './supabaseClient';

export function hashInputVersion(parts: string[]): string {
  return createHash('sha256').update(parts.join('|')).digest('hex').slice(0, 16);
}

/**
 * Fingerprint source journal entries + latest cognition mutation touching them.
 * Used as computed_from_version when writing biography/timeline projections.
 */
export async function computeSourceInputVersion(
  userId: string,
  sourceEntryIds: string[]
): Promise<string> {
  if (sourceEntryIds.length === 0) return 'empty';

  const uniqueIds = [...new Set(sourceEntryIds)].sort();

  const [{ data: entries }, { data: mutations }] = await Promise.all([
    supabaseAdmin
      .from('journal_entries')
      .select('id, updated_at, metadata')
      .eq('user_id', userId)
      .in('id', uniqueIds),
    supabaseAdmin
      .from('cognition_mutations')
      .select('created_at')
      .eq('user_id', userId)
      .in('artifact_id', uniqueIds)
      .order('created_at', { ascending: false })
      .limit(1),
  ]);

  const entryParts = (entries ?? [])
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((e) => {
      const meta = (e.metadata ?? {}) as Record<string, unknown>;
      return `${e.id}:${e.updated_at ?? ''}:${meta.truth_state ?? ''}`;
    });

  const latestMutation = mutations?.[0]?.created_at ?? '';
  return hashInputVersion([...entryParts, `mut:${latestMutation}`]);
}

export function isProjectionStale(
  computedFromVersion: string | undefined,
  currentVersion: string
): boolean {
  if (!computedFromVersion) return false;
  return computedFromVersion !== currentVersion;
}
