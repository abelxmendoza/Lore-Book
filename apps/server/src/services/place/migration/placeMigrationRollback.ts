/**
 * Rollback place ontology migration using per-row migration_snapshot metadata.
 */

import { logger } from '../../../logger';
import { supabaseAdmin } from '../../supabaseClient';
import { PLACE_MIGRATION_VERSION, type PlaceMigrationSnapshot } from './placeMigrationTypes';

export type RollbackResult = {
  placeId: string;
  status: 'restored' | 'skipped' | 'failed';
  detail?: string;
};

function isSnapshot(value: unknown): value is PlaceMigrationSnapshot {
  return Boolean(value && typeof value === 'object' && typeof (value as any).id === 'string' && typeof (value as any).name === 'string');
}

/**
 * Restore locations that were touched by place-ontology-repair-v1.
 */
export async function rollbackPlaceOntologyMigration(
  userId: string,
  opts: { placeIds?: string[] } = {},
): Promise<RollbackResult[]> {
  let query = supabaseAdmin
    .from('locations')
    .select('id, name, metadata')
    .eq('user_id', userId);

  if (opts.placeIds?.length) {
    query = query.in('id', opts.placeIds);
  }

  const { data, error } = await query;
  if (error) throw error;

  const results: RollbackResult[] = [];

  for (const row of data ?? []) {
    const meta = (row.metadata ?? {}) as Record<string, unknown>;
    if (meta.migration_version !== PLACE_MIGRATION_VERSION) {
      results.push({ placeId: row.id, status: 'skipped', detail: 'not migrated by this version' });
      continue;
    }
    const snapshot = meta.migration_snapshot;
    if (!isSnapshot(snapshot)) {
      results.push({ placeId: row.id, status: 'skipped', detail: 'missing migration_snapshot' });
      continue;
    }

    try {
      // Restore snapshot fields; drop migration operational flags but keep an audit trail.
      const restoredMeta = {
        ...(snapshot.metadata ?? {}),
        migration_rollback_at: new Date().toISOString(),
        migration_rollback_from_version: PLACE_MIGRATION_VERSION,
        previous_migration_decision: meta.migration_decision ?? null,
      };

      await supabaseAdmin
        .from('locations')
        .update({
          name: snapshot.name,
          type: snapshot.type,
          aliases: snapshot.aliases,
          summary: snapshot.summary,
          spatial_category: snapshot.spatial_category,
          spatial_subcategory: snapshot.spatial_subcategory,
          associated_character_ids: snapshot.associated_character_ids,
          metadata: restoredMeta,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', userId)
        .eq('id', row.id);

      results.push({ placeId: row.id, status: 'restored' });
    } catch (err) {
      logger.warn({ err, placeId: row.id }, 'place migration rollback failed');
      results.push({
        placeId: row.id,
        status: 'failed',
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return results;
}
