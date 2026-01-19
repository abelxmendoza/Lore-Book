// =====================================================
// ENTITY RESOLUTION API CLIENT
// Purpose: Frontend API functions for entity resolution
// =====================================================

import { fetchJson } from '../lib/api';

export type EntityType = 'CHARACTER' | 'LOCATION' | 'ENTITY' | 'ORG' | 'CONCEPT' | 'PERSON';
export type ConflictReason = 'NAME_SIMILARITY' | 'CONTEXT_OVERLAP' | 'COREFERENCE' | 'TEMPORAL_OVERLAP';
export type ConflictStatus = 'OPEN' | 'MERGED' | 'DISMISSED';
export type ResolutionTier = 'PRIMARY' | 'SECONDARY' | 'TERTIARY';

export interface EntityCandidate {
  entity_id: string;
  primary_name: string;
  aliases: string[];
  entity_type: EntityType;
  confidence: number;
  usage_count: number;
  last_seen: string;
  source_table: string; // 'characters', 'locations', 'entities', 'omega_entities'
  is_user_visible: boolean;
  resolution_tier: ResolutionTier;
  has_conflicts?: boolean;
  conflict_count?: number;
}

export interface EntityConflict {
  id: string;
  user_id: string;
  entity_a_id: string;
  entity_b_id: string;
  entity_a_type: EntityType;
  entity_b_type: EntityType;
  similarity_score: number;
  conflict_reason: ConflictReason;
  status: ConflictStatus;
  detected_at: string;
  resolved_at: string | null;
  metadata: Record<string, unknown>;
}

export interface EntityMergeRecord {
  id: string;
  user_id: string;
  source_entity_id: string;
  target_entity_id: string;
  source_entity_type: EntityType;
  target_entity_type: EntityType;
  merged_by: 'SYSTEM' | 'USER';
  reason: string | null;
  created_at: string;
  reversible: boolean;
  reverted_at: string | null;
  metadata: Record<string, unknown>;
}

export interface EntityResolutionDashboardData {
  entities: EntityCandidate[];
  conflicts: EntityConflict[];
  merge_history: EntityMergeRecord[];
}

export interface MergePreview {
  aliases_union: string[];
  references_to_move: number;
  events_affected: number;
  claims_affected: number;
  timeline_preview: any[];
}

export const entityResolutionApi = {
  /**
   * Get all dashboard data
   */
  async getDashboard(): Promise<EntityResolutionDashboardData> {
    const result = await fetchJson<{ success: boolean; data: EntityResolutionDashboardData }>(
      '/api/entity-resolution/dashboard'
    );
    if (!result.success) {
      throw new Error('Failed to fetch entity resolution dashboard');
    }
    return result.data;
  },

  /**
   * List all entities with tiered loading
   */
  async listEntities(options?: {
    include_secondary?: boolean;
    include_tertiary?: boolean;
  }): Promise<EntityCandidate[]> {
    const params = new URLSearchParams();
    if (options?.include_secondary) {
      params.append('include_secondary', 'true');
    }
    if (options?.include_tertiary) {
      params.append('include_tertiary', 'true');
    }

    const url = `/api/entity-resolution/entities${params.toString() ? `?${params.toString()}` : ''}`;
    const result = await fetchJson<{ success: boolean; entities: EntityCandidate[] }>(url);
    if (!result.success) {
      throw new Error('Failed to fetch entities');
    }
    return result.entities;
  },

  /**
   * List open conflicts
   */
  async listConflicts(): Promise<EntityConflict[]> {
    const result = await fetchJson<{ success: boolean; conflicts: EntityConflict[] }>(
      '/api/entity-resolution/conflicts'
    );
    if (!result.success) {
      throw new Error('Failed to fetch conflicts');
    }
    return result.conflicts;
  },

  /**
   * List merge history
   */
  async listMergeHistory(): Promise<EntityMergeRecord[]> {
    const result = await fetchJson<{ success: boolean; history: EntityMergeRecord[] }>(
      '/api/entity-resolution/merge-history'
    );
    if (!result.success) {
      throw new Error('Failed to fetch merge history');
    }
    return result.history;
  },

  /**
   * Merge two entities
   */
  async mergeEntities(
    sourceId: string,
    targetId: string,
    sourceType: EntityType,
    targetType: EntityType,
    reason: string
  ): Promise<void> {
    const result = await fetchJson<{ success: boolean; message?: string }>(
      '/api/entity-resolution/merge',
      {
        method: 'POST',
        body: JSON.stringify({
          source_id: sourceId,
          target_id: targetId,
          source_type: sourceType,
          target_type: targetType,
          reason,
        }),
      }
    );
    if (!result.success) {
      throw new Error('Failed to merge entities');
    }
  },

  /**
   * Revert a merge
   */
  async revertMerge(mergeId: string): Promise<void> {
    const result = await fetchJson<{ success: boolean; message?: string }>(
      `/api/entity-resolution/revert-merge/${mergeId}`,
      {
        method: 'POST',
      }
    );
    if (!result.success) {
      throw new Error('Failed to revert merge');
    }
  },

  /**
   * Edit an entity
   */
  async editEntity(
    entityId: string,
    entityType: EntityType,
    updates: {
      name?: string;
      aliases?: string[];
      metadata?: Record<string, any>;
    }
  ): Promise<void> {
    const result = await fetchJson<{ success: boolean; message?: string }>(
      '/api/entity-resolution/edit',
      {
        method: 'POST',
        body: JSON.stringify({
          entity_id: entityId,
          entity_type: entityType,
          updates,
        }),
      }
    );
    if (!result.success) {
      throw new Error('Failed to edit entity');
    }
  },

  /**
   * Dismiss a conflict
   */
  async dismissConflict(conflictId: string): Promise<void> {
    const result = await fetchJson<{ success: boolean; message?: string }>(
      `/api/entity-resolution/conflicts/${conflictId}/dismiss`,
      {
        method: 'POST',
      }
    );
    if (!result.success) {
      throw new Error('Failed to dismiss conflict');
    }
  },
};

