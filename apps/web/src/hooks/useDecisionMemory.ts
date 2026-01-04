/**
 * Hook for Decision Memory Engine
 * Fetches and manages decisions, options, rationale, and outcomes
 */

import { useState, useCallback, useEffect } from 'react';
import { fetchJson } from '../lib/api';

export type DecisionType =
  | 'RELATIONSHIP'
  | 'CAREER'
  | 'HEALTH'
  | 'FINANCIAL'
  | 'CREATIVE'
  | 'SOCIAL'
  | 'PERSONAL'
  | 'OTHER';

export type OutcomeSentiment = 'POSITIVE' | 'NEGATIVE' | 'MIXED' | 'UNCLEAR';

export interface Decision {
  id: string;
  user_id: string;
  title: string;
  description: string;
  decision_type: DecisionType;
  entity_ids: string[];
  related_claim_ids: string[];
  related_insight_ids: string[];
  perspective_id?: string | null;
  created_at: string;
  confidence: number;
  uncertainty_notes?: string | null;
  metadata?: Record<string, any>;
}

export interface DecisionOption {
  id: string;
  user_id: string;
  decision_id: string;
  option_text: string;
  perceived_risks?: string;
  perceived_rewards?: string;
  confidence?: number;
  created_at: string;
  metadata?: Record<string, any>;
}

export interface DecisionRationale {
  id: string;
  user_id: string;
  decision_id: string;
  reasoning: string;
  values_considered: string[];
  emotions_present: string[];
  constraints: string[];
  known_unknowns?: string;
  created_at: string;
  metadata?: Record<string, any>;
}

export interface DecisionOutcome {
  id: string;
  user_id: string;
  decision_id: string;
  outcome_text: string;
  recorded_at: string;
  sentiment?: OutcomeSentiment;
  linked_claim_ids: string[];
  created_at: string;
  metadata?: Record<string, any>;
}

export interface DecisionSummary {
  decision: Decision;
  options: DecisionOption[];
  rationale?: DecisionRationale;
  outcomes: DecisionOutcome[];
}

export interface DecisionMemoryState {
  decisions: DecisionSummary[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  getDecision: (id: string) => Promise<DecisionSummary | null>;
  recordOutcome: (decisionId: string, outcome: { outcome_text: string; sentiment?: OutcomeSentiment; linked_claim_ids?: string[] }) => Promise<void>;
}

export const useDecisionMemory = (filters?: { decision_type?: DecisionType; limit?: number }): DecisionMemoryState => {
  const [decisions, setDecisions] = useState<DecisionSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchDecisions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (filters?.decision_type) params.append('decision_type', filters.decision_type);
      if (filters?.limit) params.append('limit', filters.limit.toString());

      const result = await fetchJson<{ decisions: Decision[] }>(`/api/decisions?${params.toString()}`);
      
      // Fetch full summaries for each decision
      const summaries = await Promise.all(
        (result.decisions || []).map(async (decision) => {
          try {
            const summary = await fetchJson<DecisionSummary>(`/api/decisions/${decision.id}`);
            return summary;
          } catch {
            // If summary fetch fails, return basic structure
            return {
              decision,
              options: [],
              outcomes: [],
            } as DecisionSummary;
          }
        })
      );

      setDecisions(summaries);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load decisions');
      setDecisions([]);
    } finally {
      setLoading(false);
    }
  }, [filters?.decision_type, filters?.limit]);

  const getDecision = useCallback(async (id: string): Promise<DecisionSummary | null> => {
    try {
      const summary = await fetchJson<DecisionSummary>(`/api/decisions/${id}`);
      return summary;
    } catch (err) {
      console.error('Failed to get decision:', err);
      return null;
    }
  }, []);

  const recordOutcome = useCallback(async (
    decisionId: string,
    outcome: { outcome_text: string; sentiment?: OutcomeSentiment; linked_claim_ids?: string[] }
  ) => {
    try {
      await fetchJson(`/api/decisions/${decisionId}/outcomes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(outcome),
      });
      await fetchDecisions(); // Refresh list
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : 'Failed to record outcome');
    }
  }, [fetchDecisions]);

  useEffect(() => {
    void fetchDecisions();
  }, [fetchDecisions]);

  return {
    decisions,
    loading,
    error,
    refetch: fetchDecisions,
    getDecision,
    recordOutcome,
  };
};

