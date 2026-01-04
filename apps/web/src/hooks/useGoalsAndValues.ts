/**
 * Hook for Goals & Values Alignment Engine
 * Fetches and manages values, goals, alignment, and drift
 */

import { useState, useCallback, useEffect } from 'react';
import { fetchJson } from '../lib/api';

export type GoalType = 'PERSONAL' | 'CAREER' | 'RELATIONSHIP' | 'HEALTH' | 'FINANCIAL' | 'CREATIVE';
export type GoalStatus = 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'ABANDONED';
export type TargetTimeframe = 'SHORT' | 'MEDIUM' | 'LONG';

export interface Value {
  id: string;
  user_id: string;
  name: string;
  description: string;
  priority: number; // 0.0 - 1.0
  created_at: string;
  ended_at?: string | null;
  metadata?: Record<string, any>;
}

export interface Goal {
  id: string;
  user_id: string;
  title: string;
  description: string;
  goal_type: GoalType;
  related_value_ids: string[];
  target_timeframe: TargetTimeframe;
  confidence: number;
  status: GoalStatus;
  created_at: string;
  ended_at?: string | null;
  metadata?: Record<string, any>;
}

export interface AlignmentSnapshot {
  id: string;
  user_id: string;
  goal_id: string;
  alignment_score: number; // -1.0 to +1.0
  confidence: number;
  time_window: {
    start: string;
    end: string;
  };
  generated_at: string;
  metadata?: Record<string, any>;
}

export interface GoalWithAlignment {
  goal: Goal;
  signals: any[];
  snapshots: AlignmentSnapshot[];
}

export interface DriftObservation {
  title: string;
  description: string;
  disclaimer: string;
  goal_id: string;
  trend: 'downward' | 'upward' | 'stable';
}

export interface GoalsAndValuesState {
  values: Value[];
  goals: Goal[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  updateValuePriority: (id: string, priority: number) => Promise<void>;
  getGoalWithAlignment: (id: string) => Promise<GoalWithAlignment | null>;
  computeAlignment: (goalId: string) => Promise<AlignmentSnapshot>;
  detectDrift: (goalId: string) => Promise<DriftObservation | null>;
}

export const useGoalsAndValues = (): GoalsAndValuesState => {
  const [values, setValues] = useState<Value[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [valuesRes, goalsRes] = await Promise.all([
        fetchJson<{ values: Value[] }>('/api/goals/values?active_only=true'),
        fetchJson<{ goals: Goal[] }>('/api/goals/goals?status=ACTIVE&limit=20'),
      ]);

      setValues(valuesRes.values || []);
      setGoals(goalsRes.goals || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load goals and values');
      setValues([]);
      setGoals([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const updateValuePriority = useCallback(async (id: string, priority: number) => {
    try {
      await fetchJson(`/api/goals/values/${id}/priority`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ priority }),
      });
      await fetchData(); // Refresh list
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : 'Failed to update value priority');
    }
  }, [fetchData]);

  const getGoalWithAlignment = useCallback(async (id: string): Promise<GoalWithAlignment | null> => {
    try {
      const result = await fetchJson<GoalWithAlignment>(`/api/goals/goals/${id}`);
      return result;
    } catch (err) {
      console.error('Failed to get goal with alignment:', err);
      return null;
    }
  }, []);

  const computeAlignment = useCallback(async (goalId: string): Promise<AlignmentSnapshot> => {
    try {
      const result = await fetchJson<{ snapshot: AlignmentSnapshot }>(`/api/goals/goals/${goalId}/alignment`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      return result.snapshot;
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : 'Failed to compute alignment');
    }
  }, []);

  const detectDrift = useCallback(async (goalId: string): Promise<DriftObservation | null> => {
    try {
      const result = await fetchJson<{ drift: DriftObservation | null }>(`/api/goals/goals/${goalId}/drift`);
      return result.drift;
    } catch (err) {
      console.error('Failed to detect drift:', err);
      return null;
    }
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  return {
    values,
    goals,
    loading,
    error,
    refetch: fetchData,
    updateValuePriority,
    getGoalWithAlignment,
    computeAlignment,
    detectDrift,
  };
};

