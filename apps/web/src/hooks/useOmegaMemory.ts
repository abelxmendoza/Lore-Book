/**
 * Hook for Omega Memory Engine
 * Better than ChatGPT's memory - time-aware, evidence-based, with confidence scores
 */

import { useState, useCallback, useEffect } from 'react';
import { fetchJson } from '../lib/api';

export type EntityType = 'PERSON' | 'CHARACTER' | 'LOCATION' | 'ORG' | 'EVENT';
export type ClaimSource = 'USER' | 'AI' | 'EXTERNAL';
export type Sentiment = 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL' | 'MIXED';

export interface Entity {
  id: string;
  user_id: string;
  type: EntityType;
  primary_name: string;
  aliases: string[];
  created_at: string;
  updated_at: string;
  metadata?: Record<string, any>;
}

export interface Claim {
  id: string;
  user_id: string;
  entity_id: string;
  text: string;
  source: ClaimSource;
  confidence: number; // 0.0 - 1.0
  sentiment?: Sentiment;
  start_time: string;
  end_time?: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  metadata?: Record<string, any>;
}

export interface RankedClaim extends Claim {
  score: number;
  evidence_count?: number;
}

export interface EntitySummary {
  entity: Entity;
  summary: string;
  ranked_claims: RankedClaim[];
}

export interface OmegaMemoryState {
  entities: Entity[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  getEntityClaims: (entityId: string) => Promise<Claim[]>;
  getEntitySummary: (entityId: string) => Promise<EntitySummary | null>;
  updateClaim: (claimId: string, updates: Partial<Claim>) => Promise<void>;
  deleteClaim: (claimId: string) => Promise<void>;
  mergeEntities: (sourceId: string, targetId: string) => Promise<void>;
}

export const useOmegaMemory = (filters?: { type?: EntityType }): OmegaMemoryState => {
  const [entities, setEntities] = useState<Entity[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchEntities = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (filters?.type) params.append('type', filters.type);

      const result = await fetchJson<{ entities: Entity[] }>(`/api/omega-memory/entities?${params.toString()}`);
      setEntities(result.entities || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load entities');
      setEntities([]);
    } finally {
      setLoading(false);
    }
  }, [filters?.type]);

  const getEntityClaims = useCallback(async (entityId: string): Promise<Claim[]> => {
    try {
      const result = await fetchJson<{ claims: Claim[] }>(`/api/omega-memory/entities/${entityId}/claims?active_only=false`);
      return result.claims || [];
    } catch (err) {
      console.error('Failed to get entity claims:', err);
      return [];
    }
  }, []);

  const getEntitySummary = useCallback(async (entityId: string): Promise<EntitySummary | null> => {
    try {
      const result = await fetchJson<EntitySummary>(`/api/omega-memory/entities/${entityId}/summary`);
      return result;
    } catch (err) {
      console.error('Failed to get entity summary:', err);
      return null;
    }
  }, []);

  const updateClaim = useCallback(async (claimId: string, updates: Partial<Claim>) => {
    try {
      // Note: We'll need to add this endpoint
      await fetchJson(`/api/omega-memory/claims/${claimId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updates),
      });
      await fetchEntities(); // Refresh
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : 'Failed to update claim');
    }
  }, [fetchEntities]);

  const deleteClaim = useCallback(async (claimId: string) => {
    try {
      // Mark as inactive instead of deleting (preserve history)
      await updateClaim(claimId, { is_active: false });
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : 'Failed to delete claim');
    }
  }, [updateClaim]);

  const mergeEntities = useCallback(async (sourceId: string, targetId: string) => {
    try {
      await fetchJson('/api/omega-memory/entities/merge', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          source_entity_id: sourceId,
          target_entity_id: targetId,
        }),
      });
      await fetchEntities(); // Refresh
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : 'Failed to merge entities');
    }
  }, [fetchEntities]);

  useEffect(() => {
    void fetchEntities();
  }, [fetchEntities]);

  return {
    entities,
    loading,
    error,
    refetch: fetchEntities,
    getEntityClaims,
    getEntitySummary,
    updateClaim,
    deleteClaim,
    mergeEntities,
  };
};

