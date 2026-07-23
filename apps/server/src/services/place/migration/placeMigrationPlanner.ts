/**
 * Build a full dry-run migration plan + report for a user's Places registry.
 */

import { normalizeNameKey } from '../../../utils/nameNormalization';
import { supabaseAdmin } from '../../supabaseClient';
import { loadPlaceEvidence } from './placeEvidenceRebuilder';
import { buildAuditSummary } from './placeMigrationDiagnostics';
import { auditPlaceOntology } from './placeOntologyAudit';
import { rebuildPersonPlaceLinks } from './placePeopleLinkRebuilder';
import { resolveTemporalPlaceAlias } from './placeTemporalAliasResolver';
import { sanitizePlaceTags } from './placeTagSanitizer';
import {
  dedupeVisitEvidence,
  recalculatePlaceVisits,
} from './placeVisitRecalculator';
import {
  emptyEvidenceCounts,
  type PlaceMigrationReport,
  type PlaceOntologyAuditSummary,
} from './placeMigrationTypes';

type LocationRow = {
  id: string;
  name: string;
  type?: string | null;
  aliases?: string[] | null;
  metadata?: Record<string, unknown> | null;
  summary?: string | null;
  associated_character_ids?: string[] | null;
};

function collectRawTags(meta: Record<string, unknown> | null | undefined): string[] {
  if (!meta) return [];
  const bags = [meta.place_tags, meta.tags, meta.story_tags, meta.intrinsic_tags, meta.visit_context_tags];
  const out: string[] = [];
  for (const bag of bags) {
    if (!Array.isArray(bag)) continue;
    for (const item of bag) {
      if (typeof item === 'string' && item.trim()) out.push(item.trim());
    }
  }
  return out;
}

function oldCountsFromMetadata(meta: Record<string, unknown> | null | undefined) {
  const counts = emptyEvidenceCounts();
  if (!meta) return counts;
  counts.mentionCount = Number(meta.mention_count ?? meta.total_mentions ?? 0) || 0;
  counts.explicitVisitCount = Number(meta.visit_count ?? meta.visits ?? 0) || 0;
  counts.attendanceAtPlaceCount = Number(meta.attendance_count ?? meta.attendance ?? 0) || 0;
  counts.uniqueSourceCount = Number(meta.source_count ?? 0) || 0;
  return counts;
}

export async function planPlaceOntologyMigration(userId: string): Promise<PlaceOntologyAuditSummary> {
  const { data, error } = await supabaseAdmin
    .from('locations')
    .select('id, name, type, aliases, metadata, summary, associated_character_ids')
    .eq('user_id', userId)
    .order('name');

  if (error) throw error;
  const rows = (data ?? []) as LocationRow[];

  // Skip already-archived migration rows from prior applies (still listed for transparency if not archived).
  const activeRows = rows.filter((row) => {
    const status = (row.metadata as any)?.migration_status;
    return status !== 'archived' && status !== 'moved' && status !== 'demoted';
  });

  const evidenceById = new Map<string, string>();
  const evidenceBundles = new Map<string, Awaited<ReturnType<typeof loadPlaceEvidence>>>();

  for (const row of activeRows) {
    const bundle = await loadPlaceEvidence(userId, row.id, row.name, row.metadata);
    evidenceBundles.set(row.id, bundle);
    evidenceById.set(row.id, bundle.items.map((i) => i.text).join('\n'));
  }

  const plans = auditPlaceOntology(activeRows, evidenceById);
  const residences = activeRows.filter((r) =>
    /home|house|residence|apartment/i.test(`${r.name} ${r.type ?? ''}`),
  );

  const reports: PlaceMigrationReport[] = [];

  for (const plan of plans) {
    const row = activeRows.find((r) => r.id === plan.placeId)!;
    const bundle = evidenceBundles.get(plan.placeId)!;
    const aliases = [
      ...(Array.isArray(row.aliases) ? row.aliases : []),
      ...(plan.aliases ?? []),
    ];

    const deduped = dedupeVisitEvidence(bundle.items);
    let newCounts = recalculatePlaceVisits(plan.canonicalTitle || row.name, deduped, aliases);

    // Registry-only with zero evidence → archive recommendation for keep-style cities.
    if (
      newCounts.mentionCount === 0
      && newCounts.explicitVisitCount === 0
      && newCounts.attendanceAtPlaceCount === 0
      && (plan.decision === 'KEEP' || plan.decision === 'KEEP_AND_RETYPE')
      && String((row.metadata as any)?.source ?? '').includes('registry')
    ) {
      plan.decision = 'ARCHIVE_INVALID';
      plan.warnings = [...plan.warnings, 'Registry-only with no supporting evidence'];
      plan.rulesFired = [...plan.rulesFired, 'registry_zero_evidence'];
      plan.confidence = Math.min(plan.confidence, 0.55);
    }

    if (plan.decision === 'DEMOTE_TO_CONTEXT_REFERENCE' && normalizeNameKey(row.name) === 'my home') {
      plan.temporalAlias = resolveTemporalPlaceAlias('my home', residences, evidenceById.get(row.id) ?? '');
    }

    const tagSanitize = sanitizePlaceTags(collectRawTags(row.metadata), {
      placeType: plan.newType ?? row.type,
      preferredIntrinsic: plan.newType ? [plan.newType.replace(/_/g, ' ')] : [],
    });

    // People: metadata may store names; associated_character_ids are opaque without join.
    const metaPeople = Array.isArray((row.metadata as any)?.related_people)
      ? ((row.metadata as any).related_people as Array<{ name?: string; character_id?: string }>)
      : [];
    const peopleRebuild = rebuildPersonPlaceLinks(
      plan.canonicalTitle || row.name,
      metaPeople.map((p) => ({
        name: String(p.name ?? ''),
        characterId: p.character_id,
        verified: Boolean(p.character_id),
      })),
      bundle.items.map((i) => i.text),
    );

    reports.push({
      placeId: plan.placeId,
      originalTitle: plan.originalTitle,
      decision: plan.decision,
      canonicalTitle: plan.canonicalTitle,
      oldType: plan.oldType,
      newType: plan.newType,
      targetEntityType: plan.targetEntityType,
      oldCounts: oldCountsFromMetadata(row.metadata),
      newCounts,
      removedPeople: peopleRebuild.removed,
      addedRelationships: peopleRebuild.addedRelationships,
      removedTags: tagSanitize.removedTags,
      retainedTags: tagSanitize.retainedTags,
      movedTags: tagSanitize.movedTags,
      tagGroups: tagSanitize.groups,
      mergeTargetId: plan.mergeTargetId,
      splitTargetIds: plan.splitTargets?.map((t) => t.existingId).filter((id): id is string => Boolean(id)),
      evidenceIds: bundle.evidenceIds,
      warnings: plan.warnings,
      confidence: plan.confidence,
      rulesFired: plan.rulesFired,
    });
  }

  return buildAuditSummary(userId, reports);
}
