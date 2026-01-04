/**
 * Hook for Insights & Predictions
 * Fetches and manages insights and predictions (read-only observations)
 */

import { useState, useCallback, useEffect } from 'react';
import { fetchJson } from '../lib/api';

export type InsightType = 'PATTERN' | 'TREND' | 'DIVERGENCE' | 'SHIFT' | 'RECURRING_THEME';
export type InsightScope = 'ENTITY' | 'TIME' | 'RELATIONSHIP' | 'SELF';

export interface Insight {
  id: string;
  user_id: string;
  type: InsightType;
  title: string;
  description: string;
  confidence: number;
  scope: InsightScope;
  related_entity_ids: string[];
  related_claim_ids: string[];
  related_perspective_ids: string[];
  time_window?: {
    start?: string;
    end?: string;
    rolling_window_days?: number;
  };
  generated_at: string;
  dismissed: boolean;
  metadata?: Record<string, any>;
}

export type PredictionType = 'BEHAVIORAL' | 'RELATIONAL' | 'CAREER' | 'EMOTIONAL' | 'DECISION_OUTCOME' | 'PATTERN_CONTINUATION';
export type PredictionScope = 'ENTITY' | 'SELF' | 'RELATIONSHIP' | 'TIME';
export type TimeHorizon = 'SHORT' | 'MEDIUM' | 'LONG';

export interface Prediction {
  id: string;
  user_id: string;
  title: string;
  description: string;
  probability: number;
  confidence: number;
  prediction_type: PredictionType;
  scope: PredictionScope;
  related_entity_ids: string[];
  related_decision_ids: string[];
  related_insight_ids: string[];
  related_claim_ids: string[];
  time_horizon: TimeHorizon;
  generated_at: string;
  dismissed: boolean;
  metadata?: Record<string, any>;
}

export interface InsightsAndPredictionsState {
  insights: Insight[];
  predictions: Prediction[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  dismissInsight: (id: string) => Promise<void>;
  dismissPrediction: (id: string) => Promise<void>;
  explainInsight: (id: string) => Promise<any>;
  explainPrediction: (id: string) => Promise<any>;
}

export const useInsightsAndPredictions = (): InsightsAndPredictionsState => {
  const [insights, setInsights] = useState<Insight[]>([]);
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [insightsRes, predictionsRes] = await Promise.all([
        fetchJson<{ insights: Insight[] }>('/api/insights?dismissed=false&limit=20'),
        fetchJson<{ predictions: Prediction[] }>('/api/predictions?dismissed=false&limit=20'),
      ]);

      setInsights(insightsRes.insights || []);
      setPredictions(predictionsRes.predictions || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load insights and predictions');
      setInsights([]);
      setPredictions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const dismissInsight = useCallback(async (id: string) => {
    try {
      await fetchJson(`/api/insights/${id}/dismiss`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      await fetchData(); // Refresh list
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : 'Failed to dismiss insight');
    }
  }, [fetchData]);

  const dismissPrediction = useCallback(async (id: string) => {
    try {
      await fetchJson(`/api/predictions/${id}/dismiss`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      await fetchData(); // Refresh list
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : 'Failed to dismiss prediction');
    }
  }, [fetchData]);

  const explainInsight = useCallback(async (id: string) => {
    try {
      const explanation = await fetchJson(`/api/insights/${id}`);
      return explanation;
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : 'Failed to explain insight');
    }
  }, []);

  const explainPrediction = useCallback(async (id: string) => {
    try {
      const explanation = await fetchJson(`/api/predictions/${id}`);
      return explanation;
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : 'Failed to explain prediction');
    }
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  return {
    insights,
    predictions,
    loading,
    error,
    refetch: fetchData,
    dismissInsight,
    dismissPrediction,
    explainInsight,
    explainPrediction,
  };
};

