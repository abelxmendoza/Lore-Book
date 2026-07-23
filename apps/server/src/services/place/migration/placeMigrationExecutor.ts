/**
 * Apply place ontology migration decisions.
 * Soft-archive / retype / rename only — no hard deletes. Snapshots enable rollback.
 */

import { logger } from '../../../logger';
import { supabaseAdmin } from '../../supabaseClient';
import { locationMergeService } from '../../locationMergeService';
import { planPlaceOntologyMigration } from './placeMigrationPlanner';
import {
  PLACE_MIGRATION_VERSION,
  type PlaceMigrationApplyResult,
  type PlaceMigrationReport,
  type PlaceMigrationSnapshot,
  type PlaceOntologyAuditSummary,
} from './placeMigrationTypes';

function spatialForType(type?: string): { category: string; subcategory: string } {
  const t = (type ?? '').toLowerCase();
  if (['nightclub', 'club', 'music_venue', 'pool_hall', 'park', 'event_space'].includes(t)) {
    return {
      category: 'VENUE',
      subcategory: t === 'park' ? 'PARK' : t === 'pool_hall' ? 'POOL_HALL' : t === 'event_space' ? 'EVENT_SPACE' : 'NIGHTCLUB',
    };
  }
  if (['university', 'school', 'college'].includes(t)) {
    return { category: 'INSTITUTION', subcategory: 'UNIVERSITY' };
  }
  if (['city', 'town'].includes(t)) return { category: 'CITY', subcategory: 'CITY' };
  if (['district', 'neighborhood'].includes(t)) return { category: 'DISTRICT', subcategory: 'DISTRICT' };
  if (['country'].includes(t)) return { category: 'COUNTRY', subcategory: 'COUNTRY' };
  if (['home', 'house', 'private_residence'].includes(t)) {
    return { category: 'HOUSEHOLD', subcategory: 'HOUSE' };
  }
  return { category: 'UNKNOWN', subcategory: t.toUpperCase() || 'UNKNOWN' };
}

function buildSnapshot(row: any): PlaceMigrationSnapshot {
  return {
    id: row.id,
    name: row.name,
    type: row.type ?? null,
    aliases: row.aliases ?? null,
    summary: row.summary ?? null,
    metadata: (row.metadata ?? {}) as Record<string, unknown>,
    spatial_category: row.spatial_category ?? null,
    spatial_subcategory: row.spatial_subcategory ?? null,
    associated_character_ids: row.associated_character_ids ?? null,
  };
}

async function loadRow(userId: string, placeId: string) {
  const { data, error } = await supabaseAdmin
    .from('locations')
    .select('id, name, type, aliases, summary, metadata, spatial_category, spatial_subcategory, associated_character_ids')
    .eq('user_id', userId)
    .eq('id', placeId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function softArchive(
  userId: string,
  report: PlaceMigrationReport,
  status: 'archived' | 'moved' | 'demoted' | 'split',
): Promise<void> {
  const row = await loadRow(userId, report.placeId);
  if (!row) return;
  const snapshot = buildSnapshot(row);
  const meta = {
    ...(row.metadata ?? {}),
    migration_status: status,
    migration_version: PLACE_MIGRATION_VERSION,
    migrated_at: new Date().toISOString(),
    migration_decision: report.decision,
    migrated_to_entity_type: report.targetEntityType ?? null,
    canonical_after_migration: report.canonicalTitle ?? null,
    migration_snapshot: snapshot,
    spatial_hidden: true,
    place_book_visible: false,
  };

  await supabaseAdmin
    .from('locations')
    .update({
      metadata: meta,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId)
    .eq('id', report.placeId);
}

async function applyKeepRetypeRename(
  userId: string,
  report: PlaceMigrationReport,
): Promise<void> {
  const row = await loadRow(userId, report.placeId);
  if (!row) return;
  const snapshot = buildSnapshot(row);
  const nextType = report.newType ?? row.type;
  const spatial = spatialForType(nextType ?? undefined);
  const aliases = Array.isArray(row.aliases) ? [...row.aliases] : [];
  for (const alias of report.tagGroups?.intrinsicTags ? [] : []) {
    void alias;
  }
  // Preserve prior aliases + any rename aliases from report canonical.
  if (report.canonicalTitle && report.canonicalTitle !== row.name) {
    if (!aliases.some((a) => a.toLowerCase() === String(row.name).toLowerCase())) {
      aliases.push(row.name);
    }
  }

  const meta = {
    ...(row.metadata ?? {}),
    migration_status: 'repaired',
    migration_version: PLACE_MIGRATION_VERSION,
    migrated_at: new Date().toISOString(),
    migration_decision: report.decision,
    migration_snapshot: snapshot,
    place_tags: report.tagGroups.intrinsicTags,
    activity_tags: report.tagGroups.activityTags,
    visit_context_tags: report.tagGroups.visitContextTags,
    story_tags: report.tagGroups.storyAssociationTags,
    imported_source_tags: report.tagGroups.importedSourceTags,
    mention_count: report.newCounts.mentionCount,
    visit_count: report.newCounts.explicitVisitCount,
    attendance_count: report.newCounts.attendanceAtPlaceCount,
    evidence_counts: report.newCounts,
    spatial_category: spatial.category,
    spatial_subcategory: spatial.subcategory,
    spatial_classification: {
      reason: 'place_ontology_migration_v1',
      category: spatial.category,
      subcategory: spatial.subcategory,
      confidence: report.confidence,
    },
    spatial_hidden: false,
    place_book_visible: true,
  };

  // Strip giant narrative dumps from description when present.
  if (typeof meta.description === 'string' && (meta.description as string).length > 280) {
    meta.description = `${report.canonicalTitle || row.name} (${nextType || 'place'})`;
  }

  await supabaseAdmin
    .from('locations')
    .update({
      name: report.canonicalTitle || row.name,
      type: nextType,
      aliases,
      spatial_category: spatial.category,
      spatial_subcategory: spatial.subcategory,
      metadata: meta,
      summary:
        typeof row.summary === 'string' && row.summary.length > 280
          ? `${report.canonicalTitle || row.name} (${nextType || 'place'})`
          : row.summary,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId)
    .eq('id', report.placeId);
}

async function applyOne(userId: string, report: PlaceMigrationReport): Promise<PlaceMigrationApplyResult> {
  try {
    switch (report.decision) {
      case 'KEEP':
      case 'KEEP_AND_RETYPE':
      case 'RENAME':
      case 'RENAME_AND_RETYPE':
        await applyKeepRetypeRename(userId, report);
        return { placeId: report.placeId, decision: report.decision, status: 'applied' };

      case 'ARCHIVE_INVALID':
        await softArchive(userId, report, 'archived');
        return { placeId: report.placeId, decision: report.decision, status: 'applied', detail: 'soft-archived' };

      case 'MOVE_TO_EVENT':
      case 'MOVE_TO_PERSON':
      case 'MOVE_TO_OBJECT':
      case 'MOVE_TO_FIELD':
      case 'MOVE_TO_COMMUNITY':
        await softArchive(userId, report, 'moved');
        return {
          placeId: report.placeId,
          decision: report.decision,
          status: 'applied',
          detail: `moved→${report.targetEntityType ?? 'unknown'}`,
        };

      case 'DEMOTE_TO_CONTEXT_REFERENCE':
        await softArchive(userId, report, 'demoted');
        return { placeId: report.placeId, decision: report.decision, status: 'applied', detail: 'demoted to context reference' };

      case 'SPLIT': {
        await softArchive(userId, report, 'split');
        return {
          placeId: report.placeId,
          decision: report.decision,
          status: 'applied',
          detail: `split into ${(report.splitTargetIds ?? []).join(', ') || 'canonical parts'}`,
        };
      }

      case 'MERGE': {
        if (!report.mergeTargetId) {
          return { placeId: report.placeId, decision: report.decision, status: 'skipped', detail: 'missing merge target' };
        }
        const row = await loadRow(userId, report.placeId);
        if (row) {
          const snapshot = buildSnapshot(row);
          const meta = {
            ...(row.metadata ?? {}),
            migration_snapshot: snapshot,
            migration_version: PLACE_MIGRATION_VERSION,
            migration_decision: 'MERGE',
          };
          await supabaseAdmin
            .from('locations')
            .update({ metadata: meta })
            .eq('user_id', userId)
            .eq('id', report.placeId);
        }
        await locationMergeService.merge(userId, report.placeId, report.mergeTargetId, {
          reason: 'place ontology migration merge',
          resolverVersion: PLACE_MIGRATION_VERSION,
        });
        return { placeId: report.placeId, decision: report.decision, status: 'applied' };
      }

      case 'NEEDS_REVIEW':
        // Mark for review without hiding.
        {
          const row = await loadRow(userId, report.placeId);
          if (!row) {
            return { placeId: report.placeId, decision: report.decision, status: 'skipped', detail: 'missing row' };
          }
          const snapshot = buildSnapshot(row);
          await supabaseAdmin
            .from('locations')
            .update({
              metadata: {
                ...(row.metadata ?? {}),
                migration_status: 'needs_review',
                migration_version: PLACE_MIGRATION_VERSION,
                migrated_at: new Date().toISOString(),
                migration_decision: report.decision,
                migration_snapshot: snapshot,
                migration_warnings: report.warnings,
              },
              updated_at: new Date().toISOString(),
            })
            .eq('user_id', userId)
            .eq('id', report.placeId);
        }
        return { placeId: report.placeId, decision: report.decision, status: 'applied', detail: 'flagged needs_review' };

      default:
        return { placeId: report.placeId, decision: report.decision, status: 'skipped', detail: 'unhandled decision' };
    }
  } catch (err) {
    logger.warn({ err, placeId: report.placeId, decision: report.decision }, 'place migration apply failed');
    return {
      placeId: report.placeId,
      decision: report.decision,
      status: 'failed',
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function executePlaceOntologyMigration(
  userId: string,
  opts: { apply?: boolean; summary?: PlaceOntologyAuditSummary } = {},
): Promise<{ summary: PlaceOntologyAuditSummary; results: PlaceMigrationApplyResult[] }> {
  const summary = opts.summary ?? (await planPlaceOntologyMigration(userId));
  if (!opts.apply) {
    return {
      summary,
      results: summary.reports.map((r) => ({
        placeId: r.placeId,
        decision: r.decision,
        status: 'skipped' as const,
        detail: 'dry-run',
      })),
    };
  }

  const results: PlaceMigrationApplyResult[] = [];
  for (const report of summary.reports) {
    results.push(await applyOne(userId, report));
  }
  return { summary, results };
}
