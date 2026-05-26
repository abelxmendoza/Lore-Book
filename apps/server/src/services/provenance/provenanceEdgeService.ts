// =====================================================
// PROVENANCE EDGE SERVICE
//
// Writes and queries the provenance_edges table.
// Every cognition artifact's causal history is persisted here.
//
// This is the runtime implementation of the type contract in types.ts.
// =====================================================

import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';
import type { ArtifactType, ProvenanceRelation, TruthState } from './types';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface CreateEdgeParams {
  userId: string;
  sourceId: string;
  sourceType: ArtifactType;
  targetId: string;
  targetType: ArtifactType;
  relation: ProvenanceRelation | 'MENTIONED_ENTITY';
  confidence?: number;
  toTruthState?: TruthState;
  meta?: Record<string, unknown>;
}

export interface PersistedEdge {
  id: string;
  user_id: string;
  source_id: string;
  source_type: string;
  target_id: string;
  target_type: string;
  relation: string;
  confidence: number;
  to_truth_state: string | null;
  meta: Record<string, unknown> | null;
  created_at: string;
}

export interface EntityProvenanceReport {
  entityId: string;
  edges: PersistedEdge[];
  sourceMessageIds: string[];
  mentionCount: number;
  firstMentionedAt: string | null;
  lastMentionedAt: string | null;
  extractedFromIrIds: string[];
}

// ─── Service ─────────────────────────────────────────────────────────────────

class ProvenanceEdgeService {
  /**
   * Write a single provenance edge to the DB.
   * Fire-and-forget safe — logs errors but does not throw.
   * Returns the new edge ID, or null if the write failed.
   */
  async createEdge(params: CreateEdgeParams): Promise<string | null> {
    const { data, error } = await supabaseAdmin
      .from('provenance_edges')
      .insert({
        user_id:       params.userId,
        source_id:     params.sourceId,
        source_type:   params.sourceType,
        target_id:     params.targetId,
        target_type:   params.targetType,
        relation:      params.relation,
        confidence:    params.confidence ?? 1.0,
        to_truth_state: params.toTruthState ?? null,
        meta:          params.meta ?? null,
      })
      .select('id')
      .single();

    if (error) {
      logger.warn(
        { error, relation: params.relation, sourceType: params.sourceType, targetType: params.targetType },
        'ProvenanceEdgeService: edge write failed'
      );
      return null;
    }

    return data.id as string;
  }

  /**
   * Batch-write multiple edges in a single insert.
   * Use when one pipeline step produces many edges.
   */
  async createEdges(edges: CreateEdgeParams[]): Promise<void> {
    if (edges.length === 0) return;

    const rows = edges.map((p) => ({
      user_id:       p.userId,
      source_id:     p.sourceId,
      source_type:   p.sourceType,
      target_id:     p.targetId,
      target_type:   p.targetType,
      relation:      p.relation,
      confidence:    p.confidence ?? 1.0,
      to_truth_state: p.toTruthState ?? null,
      meta:          p.meta ?? null,
    }));

    const { error } = await supabaseAdmin.from('provenance_edges').insert(rows);

    if (error) {
      logger.warn({ error, count: edges.length }, 'ProvenanceEdgeService: batch edge write failed');
    }
  }

  // ─── Queries ───────────────────────────────────────────────────────────────

  /**
   * All edges touching a given artifact (both as source and target).
   */
  async getEdgesForArtifact(artifactId: string, userId: string): Promise<PersistedEdge[]> {
    const { data, error } = await supabaseAdmin
      .from('provenance_edges')
      .select('*')
      .eq('user_id', userId)
      .or(`source_id.eq.${artifactId},target_id.eq.${artifactId}`)
      .order('created_at', { ascending: true });

    if (error) {
      logger.warn({ error, artifactId }, 'ProvenanceEdgeService: getEdgesForArtifact failed');
      return [];
    }

    return (data as PersistedEdge[]) ?? [];
  }

  /**
   * Upstream lineage of an artifact.
   * Traverses "target → source" edges up to `depth` hops.
   * Returns edges in topological order (oldest ancestor first).
   */
  async getUpstreamLineage(
    artifactId: string,
    userId: string,
    depth = 5
  ): Promise<PersistedEdge[]> {
    const collected: PersistedEdge[] = [];
    const visited = new Set<string>();
    let frontier = [artifactId];

    for (let hop = 0; hop < depth && frontier.length > 0; hop++) {
      const { data, error } = await supabaseAdmin
        .from('provenance_edges')
        .select('*')
        .eq('user_id', userId)
        .in('target_id', frontier)
        .order('created_at', { ascending: true });

      if (error || !data || data.length === 0) break;

      const nextFrontier: string[] = [];
      for (const edge of data as PersistedEdge[]) {
        if (!visited.has(edge.id)) {
          visited.add(edge.id);
          collected.unshift(edge); // oldest first
          nextFrontier.push(edge.source_id);
        }
      }
      frontier = nextFrontier;
    }

    return collected;
  }

  /**
   * Downstream descendants of an artifact.
   * Traverses "source → target" edges up to `depth` hops.
   */
  async getDescendants(
    artifactId: string,
    userId: string,
    depth = 5
  ): Promise<PersistedEdge[]> {
    const collected: PersistedEdge[] = [];
    const visited = new Set<string>();
    let frontier = [artifactId];

    for (let hop = 0; hop < depth && frontier.length > 0; hop++) {
      const { data, error } = await supabaseAdmin
        .from('provenance_edges')
        .select('*')
        .eq('user_id', userId)
        .in('source_id', frontier)
        .order('created_at', { ascending: true });

      if (error || !data || data.length === 0) break;

      const nextFrontier: string[] = [];
      for (const edge of data as PersistedEdge[]) {
        if (!visited.has(edge.id)) {
          visited.add(edge.id);
          collected.push(edge);
          nextFrontier.push(edge.target_id);
        }
      }
      frontier = nextFrontier;
    }

    return collected;
  }

  /**
   * Full provenance report for an entity (character card explainability).
   * Returns every edge that produced or touched this entity,
   * plus derived statistics about mentions and source conversations.
   */
  async getEntityProvenance(entityId: string, userId: string): Promise<EntityProvenanceReport> {
    const { data, error } = await supabaseAdmin
      .from('provenance_edges')
      .select('*')
      .eq('user_id', userId)
      .or(`source_id.eq.${entityId},target_id.eq.${entityId}`)
      .order('created_at', { ascending: true });

    if (error) {
      logger.warn({ error, entityId }, 'ProvenanceEdgeService: getEntityProvenance failed');
      return {
        entityId,
        edges: [],
        sourceMessageIds: [],
        mentionCount: 0,
        firstMentionedAt: null,
        lastMentionedAt: null,
        extractedFromIrIds: [],
      };
    }

    const edges = (data as PersistedEdge[]) ?? [];

    // Mentions: edges where entity is TARGET and relation is MENTIONED_ENTITY
    const mentionEdges = edges.filter(
      (e) => e.target_id === entityId && e.relation === 'MENTIONED_ENTITY'
    );

    // IR extraction: edges where entity is TARGET and source is entry_ir
    const irEdges = edges.filter(
      (e) => e.target_id === entityId && e.source_type === 'entry_ir'
    );

    return {
      entityId,
      edges,
      sourceMessageIds: mentionEdges.map((e) => e.source_id),
      mentionCount: mentionEdges.length,
      firstMentionedAt: mentionEdges[0]?.created_at ?? null,
      lastMentionedAt: mentionEdges[mentionEdges.length - 1]?.created_at ?? null,
      extractedFromIrIds: irEdges.map((e) => e.source_id),
    };
  }
}

export const provenanceEdgeService = new ProvenanceEdgeService();
