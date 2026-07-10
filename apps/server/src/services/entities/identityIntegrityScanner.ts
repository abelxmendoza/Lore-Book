import { createHash } from 'node:crypto';

import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';
import { incrementEntityResolutionMetric } from './entityResolutionMetrics';
import { areEntityTypesCompatible, normalizeEntityType } from './entityTypeCompatibility';

export type IdentityIntegritySeverity = 'critical' | 'high' | 'medium' | 'low';
export type IdentityIntegrityFindingType =
  | 'CROSS_TYPE_IDENTITY_MERGE'
  | 'MISSING_MERGE_AUTHORIZATION'
  | 'CONFLICTING_TYPE_EVIDENCE'
  | 'RELATIONSHIP_AS_IDENTITY_MERGE'
  | 'ALIAS_WITHOUT_PROVENANCE'
  | 'DUPLICATE_CANONICAL_ALIAS'
  | 'FUZZY_ONLY_CANONICAL_NAME'
  | 'SELECTED_CANDIDATE_NOT_COMPATIBLE'
  | 'ORPHAN_OR_CROSS_TENANT_REFERENCE'
  | 'STALE_DERIVED_STATE_AFTER_CORRECTION';

export type IdentityIntegrityFinding = {
  findingId: string;
  userId: string;
  severity: IdentityIntegritySeverity;
  findingType: IdentityIntegrityFindingType;
  sourceEntityId: string | null;
  targetEntityId: string | null;
  sourceType: string | null;
  targetType: string | null;
  evidenceIds: string[];
  mutationIds: string[];
  explanation: string;
  recommendedAction: string;
  repairableAutomatically: boolean;
};

type MergeRow = {
  id: string; user_id: string; source_entity_id: string; target_entity_id: string;
  source_entity_type: string; target_entity_type: string; reason?: string | null;
  metadata?: Record<string, unknown> | null; reverted_at?: string | null;
};
type EntityRow = { id: string; user_id: string; type: string; primary_name: string; aliases?: string[] | null; metadata?: Record<string, unknown> | null };
type RelationshipRow = { id: string; user_id: string; from_entity_id: string; to_entity_id: string; type: string; evidence_source_ids?: string[] | null; metadata?: Record<string, unknown> | null };
type MutationRow = { id: string; user_id: string; artifact_id: string; mutation_type: string; before_state?: Record<string, unknown> | null; after_state?: Record<string, unknown> | null; rationale?: string | null };

export type IdentityIntegritySnapshot = {
  merges: MergeRow[];
  entities: EntityRow[];
  relationships: RelationshipRow[];
  cognitionMutations: MutationRow[];
  identityMutations: Array<MutationRow & { metadata?: Record<string, unknown> | null }>;
};

const norm = (value: string): string => value.trim().toLowerCase().replace(/\s+/g, ' ');
const stringArray = (value: unknown): string[] => Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
const findingId = (userId: string, type: string, source: string | null, target: string | null, discriminator: string): string =>
  createHash('sha256').update(`${userId}:${type}:${source ?? ''}:${target ?? ''}:${discriminator}`).digest('hex').slice(0, 24);

function finding(
  userId: string,
  findingType: IdentityIntegrityFindingType,
  fields: Omit<IdentityIntegrityFinding, 'findingId' | 'userId' | 'findingType'>,
): IdentityIntegrityFinding {
  return { findingId: findingId(userId, findingType, fields.sourceEntityId, fields.targetEntityId, fields.explanation), userId, findingType, ...fields };
}

/** Pure analyzer used by tests and by the bounded database scanner. */
export function analyzeIdentityIntegritySnapshot(userId: string, snapshot: IdentityIntegritySnapshot): IdentityIntegrityFinding[] {
  const findings: IdentityIntegrityFinding[] = [];
  const owned = new Map(snapshot.entities.map((entity) => [entity.id, entity]));

  for (const merge of snapshot.merges) {
    const compatibility = areEntityTypesCompatible(merge.source_entity_type, merge.target_entity_type);
    const metadata = merge.metadata ?? {};
    if (!compatibility.compatible) {
      findings.push(finding(userId, 'CROSS_TYPE_IDENTITY_MERGE', {
        severity: 'critical', sourceEntityId: merge.source_entity_id, targetEntityId: merge.target_entity_id,
        sourceType: merge.source_entity_type, targetType: merge.target_entity_type,
        evidenceIds: stringArray(metadata.evidence_ids), mutationIds: [merge.id],
        explanation: `Persisted identity merge crosses incompatible ${compatibility.expectedFamily} and ${compatibility.candidateFamily} families.`,
        recommendedAction: 'Restore or create the source identity, move only source-backed evidence, and supersede this merge through CorrectionAuthority.',
        repairableAutomatically: false,
      }));
    }
    if (metadata.merge_authorized !== true || typeof metadata.resolver_version !== 'string' || stringArray(metadata.evidence_ids).length === 0) {
      findings.push(finding(userId, 'MISSING_MERGE_AUTHORIZATION', {
        severity: 'high', sourceEntityId: merge.source_entity_id, targetEntityId: merge.target_entity_id,
        sourceType: merge.source_entity_type, targetType: merge.target_entity_type,
        evidenceIds: stringArray(metadata.evidence_ids), mutationIds: [merge.id],
        explanation: 'Merge record is missing authorization, resolver version, or evidence references.',
        recommendedAction: 'Review the merge and append a superseding authorization or correction audit event.',
        repairableAutomatically: false,
      }));
    }
    if (/^(linked|relationship)\b/i.test(merge.reason ?? '') || metadata.operation === 'relationship_creation') {
      findings.push(finding(userId, 'RELATIONSHIP_AS_IDENTITY_MERGE', {
        severity: 'high', sourceEntityId: merge.source_entity_id, targetEntityId: merge.target_entity_id,
        sourceType: merge.source_entity_type, targetType: merge.target_entity_type,
        evidenceIds: stringArray(metadata.evidence_ids), mutationIds: [merge.id],
        explanation: 'A relationship operation appears to have been recorded as an identity merge.',
        recommendedAction: 'Append a correction that supersedes the mislabeled mutation; preserve the relationship edge separately.',
        repairableAutomatically: true,
      }));
    }
  }

  const aliases = new Map<string, EntityRow[]>();
  for (const entity of snapshot.entities) {
    const metadata = entity.metadata ?? {};
    const assertedTypes = [metadata.expected_type, metadata.inferred_type, ...stringArray(metadata.type_evidence)]
      .filter((value): value is string => typeof value === 'string');
    if (assertedTypes.some((type) => !areEntityTypesCompatible(type, entity.type).compatible)) {
      findings.push(finding(userId, 'CONFLICTING_TYPE_EVIDENCE', {
        severity: 'high', sourceEntityId: entity.id, targetEntityId: null, sourceType: entity.type, targetType: assertedTypes[0] ?? null,
        evidenceIds: stringArray(metadata.evidence_ids), mutationIds: [],
        explanation: 'Entity metadata contains type evidence incompatible with its canonical type.',
        recommendedAction: 'Review mention provenance and either change the type or separate contaminated evidence.',
        repairableAutomatically: false,
      }));
    }
    for (const alias of entity.aliases ?? []) {
      const key = norm(alias);
      aliases.set(key, [...(aliases.get(key) ?? []), entity]);
      const aliasProvenance = metadata.alias_provenance as Record<string, unknown> | undefined;
      if (!aliasProvenance || !aliasProvenance[key]) {
        findings.push(finding(userId, 'ALIAS_WITHOUT_PROVENANCE', {
          severity: 'medium', sourceEntityId: entity.id, targetEntityId: null, sourceType: entity.type, targetType: null,
          evidenceIds: [], mutationIds: [], explanation: `Alias "${alias}" has no provenance reference.`,
          recommendedAction: 'Retain for review; confirm or remove through the correction workflow.', repairableAutomatically: false,
        }));
      }
    }
    if (metadata.resolution_method === 'fuzzy' && stringArray(metadata.evidence_ids).length === 0) {
      findings.push(finding(userId, 'FUZZY_ONLY_CANONICAL_NAME', {
        severity: 'high', sourceEntityId: entity.id, targetEntityId: null, sourceType: entity.type, targetType: null,
        evidenceIds: [], mutationIds: [], explanation: 'Canonical identity originated from fuzzy matching without provenance.',
        recommendedAction: 'Require review and original mention evidence before retaining this canonical identity.', repairableAutomatically: false,
      }));
    }
    const trace = metadata.resolution_trace as Record<string, unknown> | undefined;
    const selected = typeof trace?.selectedEntityId === 'string' ? trace.selectedEntityId : null;
    const accepted = stringArray(trace?.acceptedCandidates);
    if (selected && !accepted.includes(selected)) {
      findings.push(finding(userId, 'SELECTED_CANDIDATE_NOT_COMPATIBLE', {
        severity: 'critical', sourceEntityId: entity.id, targetEntityId: selected, sourceType: entity.type, targetType: null,
        evidenceIds: stringArray(metadata.evidence_ids), mutationIds: [],
        explanation: 'Resolver trace selected an entity outside the compatible candidate set.',
        recommendedAction: 'Block further resolution to this target and review the mention.', repairableAutomatically: false,
      }));
    }
  }

  for (const [alias, rows] of aliases) {
    const compatiblePairs = rows.filter((row, index) => rows.some((other, otherIndex) => otherIndex !== index && areEntityTypesCompatible(row.type, other.type).compatible));
    if (compatiblePairs.length > 1) {
      findings.push(finding(userId, 'DUPLICATE_CANONICAL_ALIAS', {
        severity: 'medium', sourceEntityId: compatiblePairs[0].id, targetEntityId: compatiblePairs[1].id,
        sourceType: compatiblePairs[0].type, targetType: compatiblePairs[1].type, evidenceIds: [], mutationIds: [],
        explanation: `Alias "${alias}" belongs to multiple compatible canonical entities.`,
        recommendedAction: 'Review contextual evidence; do not auto-merge same-name entities.', repairableAutomatically: false,
      }));
    }
  }

  for (const relationship of snapshot.relationships) {
    if (!owned.has(relationship.from_entity_id) || !owned.has(relationship.to_entity_id)) {
      findings.push(finding(userId, 'ORPHAN_OR_CROSS_TENANT_REFERENCE', {
        severity: 'critical', sourceEntityId: relationship.from_entity_id, targetEntityId: relationship.to_entity_id,
        sourceType: owned.get(relationship.from_entity_id)?.type ?? null, targetType: owned.get(relationship.to_entity_id)?.type ?? null,
        evidenceIds: relationship.evidence_source_ids ?? [], mutationIds: [relationship.id],
        explanation: 'Relationship references an entity not present in the user-scoped entity batch.',
        recommendedAction: 'Verify ownership with privileged tooling; never follow or expose the foreign reference to the user.', repairableAutomatically: false,
      }));
    }
  }

  for (const mutation of snapshot.cognitionMutations) {
    if (mutation.mutation_type === 'CORRECTION' && mutation.after_state?.derived_state_invalidated !== true) {
      findings.push(finding(userId, 'STALE_DERIVED_STATE_AFTER_CORRECTION', {
        severity: 'medium', sourceEntityId: mutation.artifact_id, targetEntityId: null, sourceType: null, targetType: null,
        evidenceIds: [], mutationIds: [mutation.id], explanation: 'Correction audit does not confirm derived summary/cache/embedding invalidation.',
        recommendedAction: 'Invalidate affected projections and append completion evidence.', repairableAutomatically: false,
      }));
    }
  }

  return findings;
}

export type IdentityIntegrityScanResult = {
  userId: string;
  dryRun: true;
  scannedAt: string;
  limit: number;
  cursor: string | null;
  nextCursor: string | null;
  queryCount: number;
  findings: IdentityIntegrityFinding[];
};

export async function scanIdentityIntegrity(
  userId: string,
  options: { limit?: number; cursor?: string } = {},
): Promise<IdentityIntegrityScanResult> {
  if (!userId) throw new Error('Identity integrity scan requires an explicit user scope');
  const limit = Math.min(Math.max(options.limit ?? 200, 1), 500);
  const before = options.cursor;

  const mergeQuery = supabaseAdmin.from('entity_merge_records').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(limit);
  const cognitionQuery = supabaseAdmin.from('cognition_mutations').select('id, user_id, artifact_id, mutation_type, before_state, after_state, rationale, created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(limit);
  const identityQuery = supabaseAdmin.from('identity_mutations').select('id, user_id, entity_id, mutation_type, previous_value, new_value, reason, metadata, created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(limit);
  if (before) {
    mergeQuery.lt('created_at', before);
    cognitionQuery.lt('created_at', before);
    identityQuery.lt('created_at', before);
  }

  // NOTE: the deprecated omega relationship-edges table is intentionally NOT
  // read here (pre-deletion guard: tests/architecture/preDeletionReferences).
  // The analyzer's orphan/cross-tenant relationship check stays pure so future
  // edge sources can feed it; the live scan passes no edges.
  const [merges, entities, cognition, identity] = await Promise.all([
    mergeQuery,
    supabaseAdmin.from('omega_entities').select('id, user_id, type, primary_name, aliases, metadata').eq('user_id', userId).limit(limit),
    cognitionQuery,
    identityQuery,
  ]);
  const missingTable = (error: { code?: string; message?: string } | null | undefined): boolean =>
    error?.code === 'PGRST205' || /schema cache|does not exist/i.test(error?.message ?? '');
  for (const result of [entities, cognition, identity]) {
    if (result.error && !missingTable(result.error)) throw result.error;
  }

  let queryCount = 4;
  let mergeRows: MergeRow[] = [];
  if (!merges.error) {
    mergeRows = (merges.data ?? []) as MergeRow[];
  } else if (missingTable(merges.error)) {
    // Some deployments use the newer cognition graph merge ledger. Read it in
    // two bounded, user-scoped queries and normalize it into the scanner shape.
    const [mergeLog, graphNodes] = await Promise.all([
      supabaseAdmin.from('entity_merge_log').select('id, user_id, survivor_node_id, merged_node_id, merge_reason, evidence, merged_by, merged_at').eq('user_id', userId).order('merged_at', { ascending: false }).limit(limit),
      supabaseAdmin.from('graph_nodes').select('id, user_id, root_type, node_kind, display_name').eq('user_id', userId).limit(limit),
    ]);
    queryCount += 2;
    if (mergeLog.error && !missingTable(mergeLog.error)) throw mergeLog.error;
    if (graphNodes.error && !missingTable(graphNodes.error)) throw graphNodes.error;
    const nodes = new Map((graphNodes.data ?? []).map((node: any) => [node.id, node]));
    mergeRows = (mergeLog.data ?? []).map((row: any) => ({
      id: row.id,
      user_id: row.user_id,
      source_entity_id: row.merged_node_id,
      target_entity_id: row.survivor_node_id,
      source_entity_type: nodes.get(row.merged_node_id)?.root_type ?? nodes.get(row.merged_node_id)?.node_kind ?? 'UNKNOWN',
      target_entity_type: nodes.get(row.survivor_node_id)?.root_type ?? nodes.get(row.survivor_node_id)?.node_kind ?? 'UNKNOWN',
      reason: row.merge_reason,
      metadata: row.evidence ?? {},
      created_at: row.merged_at,
    }));
  } else {
    throw merges.error;
  }

  const cognitionRows = (cognition.data ?? []) as Array<MutationRow & { created_at?: string }>;
  const findings = analyzeIdentityIntegritySnapshot(userId, {
    merges: mergeRows,
    entities: (entities.data ?? []) as EntityRow[],
    relationships: [],
    cognitionMutations: cognitionRows,
    identityMutations: (identity.data ?? []).map((row: any) => ({
      id: row.id, user_id: row.user_id, artifact_id: row.entity_id, mutation_type: row.mutation_type,
      before_state: row.previous_value, after_state: row.new_value, rationale: row.reason, metadata: row.metadata,
    })),
  });
  if (findings.length > 0) {
    incrementEntityResolutionMetric('suspicious_persisted_merges_detected', findings.filter((item) => item.findingType.includes('MERGE')).length);
    logger.warn({ userId, findingCount: findings.length }, 'Identity integrity scanner found suspicious records');
  }
  const dated = [...mergeRows, ...cognitionRows].map((row: any) => row.created_at).filter(Boolean).sort();
  return {
    userId, dryRun: true, scannedAt: new Date().toISOString(), limit, cursor: before ?? null,
    nextCursor: dated.length >= limit ? dated[0] : null,
    queryCount,
    findings,
  };
}
