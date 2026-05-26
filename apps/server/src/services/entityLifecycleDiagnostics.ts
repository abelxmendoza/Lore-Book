// =====================================================
// ENTITY LIFECYCLE DIAGNOSTICS
//
// End-to-end observability for the character continuity pipeline.
//
// Answers: "Why doesn't James appear in the character book?"
//          "Why do we have two Jerrys?"
//          "What contradictions exist for Sarah?"
//
// Each stage maps to a real pipeline step.
// 'missing' means the stage never ran for this entity.
// 'ok' means it ran and produced expected output.
// 'partial' means it ran but produced degraded output.
// 'error' means it ran and is known to have failed.
// =====================================================

import { logger } from '../logger';
import { supabaseAdmin } from './supabaseClient';
import { entityRegistry } from './entityRegistry';

// ─── Report types ─────────────────────────────────────────────────────────────

export interface LifecycleStage {
  name: string;
  status: 'ok' | 'missing' | 'partial' | 'error';
  detail: string | null;
  count?: number;
  firstAt?: string | null;
  lastAt?: string | null;
}

export interface ContradictionRecord {
  sourceClaimId: string;
  targetClaimId: string;
  confidence: number;
  createdAt: string;
  meta: Record<string, unknown> | null;
}

export interface MergeRecord {
  eventId: string;
  explanation: string;
  createdAt: string;
}

export interface EntityLifecycleReport {
  entityId: string;
  entityName: string | null;
  resolvedFromTable: string | null;
  checkedAt: string;

  // Pipeline stage status
  stages: {
    extracted:       LifecycleStage;  // MENTIONED_ENTITY provenance edges exist
    persisted:       LifecycleStage;  // entity found in at least one table
    provenanceGraph: LifecycleStage;  // provenance edges connecting this entity
    relationships:   LifecycleStage;  // edges in character_relationships / entity_relationships
    contradictions:  LifecycleStage;  // CONTRADICTS events via continuity_events
    merges:          LifecycleStage;  // ENTITY_MERGED events
    consolidation:   LifecycleStage;  // claims consolidated into journal entries
  };

  // Summary counters
  mentionCount:      number;
  edgeCount:         number;
  contradictionCount: number;
  mergeCount:        number;
  relationshipCount: number;
  claimCount:        number;

  // Detail arrays for the resolution UI
  contradictions: ContradictionRecord[];
  mergeHistory:   MergeRecord[];
}

// ─── Service ──────────────────────────────────────────────────────────────────

class EntityLifecycleDiagnosticsService {

  async diagnose(entityId: string, userId: string): Promise<EntityLifecycleReport> {
    const checkedAt = new Date().toISOString();

    // All queries run concurrently — this is read-only observability
    const [
      resolved,
      provenanceEdges,
      mentionEdges,
      contradictionEvents,
      mergeEvents,
      charRelationships,
      entityRelationships,
      claims,
    ] = await Promise.allSettled([
      entityRegistry.resolveById(entityId, userId),
      this.queryProvenanceEdges(entityId, userId),
      this.queryMentionEdges(entityId, userId),
      this.queryContinuityEvents(entityId, userId, 'CONTRADICTION_FOUND'),
      this.queryContinuityEvents(entityId, userId, 'ENTITY_MERGED'),
      this.queryCharacterRelationships(entityId, userId),
      this.queryEntityRelationships(entityId, userId),
      this.queryOmegaClaims(entityId, userId),
    ]);

    const entity        = resolved.status           === 'fulfilled' ? resolved.value           : null;
    const edges         = provenanceEdges.status    === 'fulfilled' ? provenanceEdges.value    : [];
    const mentions      = mentionEdges.status        === 'fulfilled' ? mentionEdges.value        : [];
    const contradicts   = contradictionEvents.status === 'fulfilled' ? contradictionEvents.value : [];
    const merges        = mergeEvents.status         === 'fulfilled' ? mergeEvents.value         : [];
    const charRels      = charRelationships.status   === 'fulfilled' ? charRelationships.value   : [];
    const entRels       = entityRelationships.status === 'fulfilled' ? entityRelationships.value : [];
    const claimRows     = claims.status              === 'fulfilled' ? claims.value              : [];

    const relationshipCount = charRels.length + entRels.length;

    // ── CONTRADICTS provenance edges (claim-level, linked via entity) ──────────
    // Look for CONTRADICTS edges where meta.entityId matches
    const contradictEdges = edges.filter(
      (e) => e.relation === 'CONTRADICTS'
    );

    // ── Stage: extracted ─────────────────────────────────────────────────────
    const extractedStage: LifecycleStage = mentions.length > 0
      ? {
          name: 'extracted',
          status: 'ok',
          detail: `Mentioned in ${mentions.length} provenance edge(s)`,
          count: mentions.length,
          firstAt: mentions[mentions.length - 1]?.created_at ?? null,
          lastAt:  mentions[0]?.created_at ?? null,
        }
      : {
          name: 'extracted',
          status: 'missing',
          detail: 'No MENTIONED_ENTITY provenance edges found. Entity may have been created manually or before provenance tracking was enabled.',
          count: 0,
        };

    // ── Stage: persisted ─────────────────────────────────────────────────────
    const persistedStage: LifecycleStage = entity
      ? {
          name: 'persisted',
          status: 'ok',
          detail: `Found in '${entity.source}' table as "${entity.name}"`,
        }
      : {
          name: 'persisted',
          status: 'missing',
          detail: 'Not found in characters, omega_entities, people_places, or entities tables. May have been deleted or never persisted.',
        };

    // ── Stage: provenanceGraph ────────────────────────────────────────────────
    const provenanceStage: LifecycleStage = edges.length > 0
      ? {
          name: 'provenanceGraph',
          status: 'ok',
          detail: `${edges.length} provenance edge(s) in causal graph`,
          count: edges.length,
          firstAt: edges[edges.length - 1]?.created_at ?? null,
          lastAt:  edges[0]?.created_at ?? null,
        }
      : {
          name: 'provenanceGraph',
          status: 'missing',
          detail: 'No provenance edges. Causal history cannot be reconstructed.',
          count: 0,
        };

    // ── Stage: relationships ──────────────────────────────────────────────────
    const relationshipsStage: LifecycleStage = relationshipCount > 0
      ? {
          name: 'relationships',
          status: 'ok',
          detail: `${charRels.length} character relationship(s), ${entRels.length} entity relationship(s)`,
          count: relationshipCount,
        }
      : {
          name: 'relationships',
          status: 'missing',
          detail: 'No relationships persisted yet. Entity may need more conversation mentions.',
          count: 0,
        };

    // ── Stage: contradictions ─────────────────────────────────────────────────
    const totalContradictions = contradicts.length + contradictEdges.length;
    const contradictionsStage: LifecycleStage = totalContradictions > 0
      ? {
          name: 'contradictions',
          status: 'partial',
          detail: `${totalContradictions} contradiction(s) detected — review required`,
          count: totalContradictions,
        }
      : {
          name: 'contradictions',
          status: 'ok',
          detail: 'No contradictions detected',
          count: 0,
        };

    // ── Stage: merges ─────────────────────────────────────────────────────────
    const mergesStage: LifecycleStage = merges.length > 0
      ? {
          name: 'merges',
          status: 'ok',
          detail: `Entity was involved in ${merges.length} merge event(s)`,
          count: merges.length,
        }
      : {
          name: 'merges',
          status: 'ok',
          detail: 'No merge events — entity identity is stable',
          count: 0,
        };

    // ── Stage: consolidation ──────────────────────────────────────────────────
    const compiledEdges = edges.filter((e) => e.relation === 'COMPILED_INTO');
    const consolidationStage: LifecycleStage = claimRows.length > 0
      ? compiledEdges.length > 0
        ? {
            name: 'consolidation',
            status: 'ok',
            detail: `${claimRows.length} claim(s), ${compiledEdges.length} compiled into journal entries`,
            count: claimRows.length,
          }
        : {
            name: 'consolidation',
            status: 'partial',
            detail: `${claimRows.length} claim(s) extracted but none confirmed consolidated into journal entries yet`,
            count: claimRows.length,
          }
      : {
          name: 'consolidation',
          status: 'missing',
          detail: 'No claims found for this entity in omega_claims',
          count: 0,
        };

    // ── Contradiction detail records ──────────────────────────────────────────
    const contradictionRecords: ContradictionRecord[] = contradictEdges.map((e) => ({
      sourceClaimId: e.source_id,
      targetClaimId: e.target_id,
      confidence:    e.confidence,
      createdAt:     e.created_at,
      meta:          e.meta as Record<string, unknown> | null,
    }));

    // ── Merge history ─────────────────────────────────────────────────────────
    const mergeHistory: MergeRecord[] = merges.map((ev) => ({
      eventId:     ev.id,
      explanation: ev.explanation ?? '',
      createdAt:   ev.created_at,
    }));

    return {
      entityId,
      entityName:         entity?.name ?? null,
      resolvedFromTable:  entity?.source ?? null,
      checkedAt,
      stages: {
        extracted:       extractedStage,
        persisted:       persistedStage,
        provenanceGraph: provenanceStage,
        relationships:   relationshipsStage,
        contradictions:  contradictionsStage,
        merges:          mergesStage,
        consolidation:   consolidationStage,
      },
      mentionCount:       mentions.length,
      edgeCount:          edges.length,
      contradictionCount: totalContradictions,
      mergeCount:         merges.length,
      relationshipCount,
      claimCount:         claimRows.length,
      contradictions:     contradictionRecords,
      mergeHistory,
    };
  }

  // ─── Queries ────────────────────────────────────────────────────────────────

  private async queryProvenanceEdges(entityId: string, userId: string) {
    const { data, error } = await supabaseAdmin
      .from('provenance_edges')
      .select('id, source_id, source_type, target_id, target_type, relation, confidence, to_truth_state, meta, created_at')
      .eq('user_id', userId)
      .or(`source_id.eq.${entityId},target_id.eq.${entityId}`)
      .order('created_at', { ascending: false })
      .limit(200);

    if (error) {
      logger.warn({ err: error, entityId }, 'EntityLifecycleDiagnostics: provenance edge query failed');
      return [];
    }
    return data ?? [];
  }

  private async queryMentionEdges(entityId: string, userId: string) {
    const { data, error } = await supabaseAdmin
      .from('provenance_edges')
      .select('id, source_id, created_at')
      .eq('user_id', userId)
      .eq('target_id', entityId)
      .eq('relation', 'MENTIONED_ENTITY')
      .order('created_at', { ascending: false });

    if (error) {
      logger.warn({ err: error, entityId }, 'EntityLifecycleDiagnostics: mention edge query failed');
      return [];
    }
    return data ?? [];
  }

  private async queryContinuityEvents(entityId: string, userId: string, type: string) {
    const { data, error } = await supabaseAdmin
      .from('continuity_events')
      .select('id, type, explanation, context, related_entity_ids, created_at')
      .eq('user_id', userId)
      .eq('type', type)
      .contains('related_entity_ids', [entityId])
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      logger.warn({ err: error, entityId, type }, 'EntityLifecycleDiagnostics: continuity event query failed');
      return [];
    }
    return data ?? [];
  }

  private async queryCharacterRelationships(entityId: string, userId: string) {
    const { data, error } = await supabaseAdmin
      .from('character_relationships')
      .select('id, related_character_id, relationship_type, closeness_score')
      .eq('user_id', userId)
      .eq('character_id', entityId)
      .limit(50);

    if (error) {
      logger.warn({ err: error, entityId }, 'EntityLifecycleDiagnostics: character relationships query failed');
      return [];
    }
    return data ?? [];
  }

  private async queryEntityRelationships(entityId: string, userId: string) {
    const { data, error } = await supabaseAdmin
      .from('entity_relationships')
      .select('id, related_entity_id, relation_type, evidence_count')
      .eq('source_entity_id', entityId)
      .limit(50);

    if (error) {
      // entity_relationships may not exist for all deployments
      logger.debug({ err: error, entityId }, 'EntityLifecycleDiagnostics: entity_relationships query skipped');
      return [];
    }
    return data ?? [];
  }

  private async queryOmegaClaims(entityId: string, userId: string) {
    const { data, error } = await supabaseAdmin
      .from('omega_claims')
      .select('id, text, confidence, is_active, created_at')
      .eq('user_id', userId)
      .eq('entity_id', entityId)
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) {
      logger.warn({ err: error, entityId }, 'EntityLifecycleDiagnostics: omega_claims query failed');
      return [];
    }
    return data ?? [];
  }
}

export const entityLifecycleDiagnostics = new EntityLifecycleDiagnosticsService();
