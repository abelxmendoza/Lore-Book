/**
 * Hook for Memory Review Queue (MRQ)
 * Fetches and manages pending memory proposals
 */

import { useState, useCallback, useEffect } from 'react';
import { fetchJson } from '../lib/api';
import { useMockData, subscribeToMockDataState } from '../contexts/MockDataContext';
import { mockDataService } from '../services/mockDataService';

export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH';
export type ProposalStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'EDITED' | 'DEFERRED';

export interface MemoryProposal {
  id: string;
  user_id: string;
  entity_id: string;
  claim_text: string;
  perspective_id?: string | null;
  confidence: number; // 0.0 - 1.0
  temporal_context?: Record<string, any>;
  source_excerpt?: string;
  reasoning?: string;
  affected_claim_ids: string[];
  risk_level: RiskLevel;
  status: ProposalStatus;
  created_at: string;
  resolved_at?: string | null;
  metadata?: Record<string, any>;
}

export interface MemoryReviewQueueState {
  proposals: MemoryProposal[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  approveProposal: (id: string) => Promise<void>;
  rejectProposal: (id: string, reason?: string) => Promise<void>;
  editProposal: (id: string, newText: string, newConfidence?: number) => Promise<void>;
  deferProposal: (id: string) => Promise<void>;
}

export const useMemoryReviewQueue = (): MemoryReviewQueueState => {
  const { isMockDataEnabled } = useMockData();
  const [proposals, setProposals] = useState<MemoryProposal[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchProposals = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (isMockDataEnabled) {
        // Use mock data if toggle is enabled
        const result = mockDataService.getWithFallback.memoryProposals(null, true);
        setProposals(result.data);
      } else {
        // Try to fetch real data
        try {
          const result = await fetchJson<{ items: MemoryProposal[] }>('/api/mrq/pending');
          setProposals(result.items || []);
        } catch (apiErr) {
          // If API fails and mock is available, use mock as fallback
          const result = mockDataService.getWithFallback.memoryProposals(null, true);
          setProposals(result.data);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load memory proposals');
      // Fallback to mock data if available
      const result = mockDataService.getWithFallback.memoryProposals(null, true);
      setProposals(result.data);
    } finally {
      setLoading(false);
    }
  }, [isMockDataEnabled]);

  const approveProposal = useCallback(async (id: string) => {
    try {
      await fetchJson(`/api/mrq/proposals/${id}/approve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      await fetchProposals(); // Refresh list
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : 'Failed to approve proposal');
    }
  }, [fetchProposals]);

  const rejectProposal = useCallback(async (id: string, reason?: string) => {
    try {
      await fetchJson(`/api/mrq/proposals/${id}/reject`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ reason }),
      });
      await fetchProposals(); // Refresh list
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : 'Failed to reject proposal');
    }
  }, [fetchProposals]);

  const editProposal = useCallback(async (id: string, newText: string, newConfidence?: number) => {
    try {
      await fetchJson(`/api/mrq/proposals/${id}/edit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          new_text: newText,
          new_confidence: newConfidence,
        }),
      });
      await fetchProposals(); // Refresh list
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : 'Failed to edit proposal');
    }
  }, [fetchProposals]);

  const deferProposal = useCallback(async (id: string) => {
    try {
      await fetchJson(`/api/mrq/proposals/${id}/defer`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      await fetchProposals(); // Refresh list
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : 'Failed to defer proposal');
    }
  }, [fetchProposals]);

  useEffect(() => {
    void fetchProposals();
  }, [fetchProposals]);

  // Subscribe to mock data toggle changes
  useEffect(() => {
    const unsubscribe = subscribeToMockDataState(() => {
      void fetchProposals();
    });
    return unsubscribe;
  }, [fetchProposals]);

  return {
    proposals,
    loading,
    error,
    refetch: fetchProposals,
    approveProposal,
    rejectProposal,
    editProposal,
    deferProposal,
  };
};

