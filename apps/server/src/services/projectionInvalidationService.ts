/**
 * P6 invalidation protocol — mark derived projections stale when source artifacts change.
 */
import { logger } from '../logger';
import { supabaseAdmin } from './supabaseClient';
import type { ArtifactType } from './provenance/types';

export type InvalidationReason = 'source_revision' | 'source_merge' | 'source_delete';

export interface InvalidationResult {
  biographySnapshots: number;
  timelineEvents: number;
}

const PROJECTION_SOURCE_TYPES: ArtifactType[] = ['journal_entry', 'entry_ir', 'insight'];

function mergeMetadata(
  existing: Record<string, unknown> | null | undefined,
  patch: Record<string, unknown>
): Record<string, unknown> {
  return { ...(existing ?? {}), ...patch };
}

/**
 * When a source memory changes, derived biography and timeline projections may be wrong.
 * Marks matching rows stale in metadata (read paths also recompute version fingerprints).
 */
export async function invalidateProjectionsForSource(
  userId: string,
  sourceArtifactId: string,
  sourceArtifactType: ArtifactType,
  reason: InvalidationReason = 'source_revision'
): Promise<InvalidationResult> {
  if (!PROJECTION_SOURCE_TYPES.includes(sourceArtifactType)) {
    return { biographySnapshots: 0, timelineEvents: 0 };
  }

  const invalidatedAt = new Date().toISOString();
  const stalePatch = {
    stale: true,
    invalidated_at: invalidatedAt,
    invalidation_reason: reason,
    invalidated_source_id: sourceArtifactId,
    invalidated_source_type: sourceArtifactType,
  };

  let biographySnapshots = 0;
  let timelineEvents = 0;

  try {
    const { data: bios } = await supabaseAdmin
      .from('narrative_accounts')
      .select('id, metadata')
      .eq('user_id', userId)
      .eq('account_type', 'biography_snapshot');

    for (const bio of bios ?? []) {
      const meta = (bio.metadata ?? {}) as Record<string, unknown>;
      const sourceIds = Array.isArray(meta.source_entry_ids)
        ? (meta.source_entry_ids as string[])
        : [];
      if (!sourceIds.includes(sourceArtifactId)) continue;

      const { error } = await supabaseAdmin
        .from('narrative_accounts')
        .update({ metadata: mergeMetadata(meta, stalePatch) })
        .eq('id', bio.id)
        .eq('user_id', userId);

      if (!error) biographySnapshots += 1;
    }

    const { data: events } = await supabaseAdmin
      .from('resolved_events')
      .select('id, metadata')
      .eq('user_id', userId)
      .filter('metadata->>source_entry_id', 'eq', sourceArtifactId);

    for (const event of events ?? []) {
      const meta = (event.metadata ?? {}) as Record<string, unknown>;
      const { error } = await supabaseAdmin
        .from('resolved_events')
        .update({ metadata: mergeMetadata(meta, stalePatch) })
        .eq('id', event.id)
        .eq('user_id', userId);

      if (!error) timelineEvents += 1;
    }

    if (biographySnapshots > 0 || timelineEvents > 0) {
      logger.info(
        { userId, sourceArtifactId, sourceArtifactType, biographySnapshots, timelineEvents, reason },
        'Projection invalidation applied'
      );
    }
  } catch (err) {
    logger.warn(
      { err, userId, sourceArtifactId, sourceArtifactType },
      'Projection invalidation failed (non-fatal)'
    );
  }

  return { biographySnapshots, timelineEvents };
}
