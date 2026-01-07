/**
 * Hook for Goals & Values Alignment Engine
 * Fetches and manages values, goals, alignment, and drift
 */

import { useState, useCallback, useEffect } from 'react';
import { fetchJson } from '../lib/api';
import { useMockData, subscribeToMockDataState, getGlobalMockDataEnabled } from '../contexts/MockDataContext';
import { mockDataService } from '../services/mockDataService';
import { MOCK_GOALS_VALUES_DATA } from '../mocks/goalsValues';

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

export interface GoalsValuesPanelData {
  goals: Goal[];
  values: Value[];
  alignmentSnapshots: AlignmentSnapshot[];
  driftObservations: DriftObservation[];
  dataSource: 'MOCK' | 'REAL';
}

export interface GoalsAndValuesState {
  values: Value[];
  goals: Goal[];
  alignmentSnapshots: AlignmentSnapshot[];
  driftObservations: DriftObservation[];
  loading: boolean;
  error: string | null;
  dataSource: 'MOCK' | 'REAL';
  refetch: () => Promise<void>;
  updateValuePriority: (id: string, priority: number) => Promise<void>;
  getGoalWithAlignment: (id: string) => Promise<GoalWithAlignment | null>;
  computeAlignment: (goalId: string) => Promise<AlignmentSnapshot>;
  detectDrift: (goalId: string) => Promise<DriftObservation | null>;
  getPanelData: () => GoalsValuesPanelData;
}

export const useGoalsAndValues = (): GoalsAndValuesState => {
  const { isMockDataEnabled } = useMockData();
  const [values, setValues] = useState<Value[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [alignmentSnapshots, setAlignmentSnapshots] = useState<AlignmentSnapshot[]>([]);
  const [driftObservations, setDriftObservations] = useState<DriftObservation[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dataSource, setDataSource] = useState<'MOCK' | 'REAL'>('REAL');

  const fetchAlignmentSnapshots = useCallback(async (goalIds: string[]): Promise<AlignmentSnapshot[]> => {
    const snapshots: AlignmentSnapshot[] = [];
    for (const goalId of goalIds) {
      try {
        const goalData = await fetchJson<GoalWithAlignment>(`/api/goals/goals/${goalId}`);
        if (goalData?.snapshots) {
          snapshots.push(...goalData.snapshots);
        }
      } catch (err) {
        // Silently fail for individual goals
        console.warn(`Failed to fetch snapshots for goal ${goalId}:`, err);
      }
    }
    return snapshots;
  }, []);

  const fetchDriftObservations = useCallback(async (goalIds: string[]): Promise<DriftObservation[]> => {
    const observations: DriftObservation[] = [];
    for (const goalId of goalIds) {
      try {
        const result = await fetchJson<{ drift: DriftObservation | null }>(`/api/goals/goals/${goalId}/drift`);
        if (result?.drift) {
          observations.push(result.drift);
        }
      } catch (err) {
        // Silently fail for individual goals
        console.warn(`Failed to fetch drift for goal ${goalId}:`, err);
      }
    }
    return observations;
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [valuesRes, goalsRes] = await Promise.all([
        fetchJson<{ values: Value[] }>('/api/goals/values?active_only=true').catch(() => ({ values: [] })),
        fetchJson<{ goals: Goal[] }>('/api/goals/goals?status=ACTIVE&limit=20').catch(() => ({ goals: [] })),
      ]);

      let fetchedValues = valuesRes.values || [];
      const fetchedGoals = goalsRes.goals || [];
      
      // If no values exist, try to extract from conversations
      if (fetchedValues.length === 0 && !isMockDataEnabled) {
        try {
          const extractedRes = await fetchJson<{ values: Value[] }>('/api/goals/values/extract', {
            method: 'POST',
          }).catch(() => ({ values: [] }));
          fetchedValues = extractedRes.values || [];
          console.log('[useGoalsAndValues] Extracted values from conversations:', fetchedValues.length);
        } catch (err) {
          console.warn('[useGoalsAndValues] Failed to extract values:', err);
        }
      }

      // If values exist, trigger evolution in background (non-blocking)
      if (fetchedValues.length > 0 && !isMockDataEnabled) {
        // Check last evolution time (stored in metadata)
        const lastEvolution = fetchedValues[0]?.metadata?.last_evolution_at;
        const shouldEvolve = !lastEvolution || 
          (Date.now() - new Date(lastEvolution).getTime()) > 24 * 60 * 60 * 1000;

        if (shouldEvolve) {
          // Trigger evolution in background
          fetchJson('/api/goals/values/evolve', { method: 'POST' })
            .then((result: any) => {
              if (result.updated?.length > 0 || result.newValues?.length > 0) {
                console.log('[useGoalsAndValues] Values evolved:', result);
                // Refetch to get updated values
                void fetchData();
              }
            })
            .catch(err => {
              console.warn('[useGoalsAndValues] Evolution failed:', err);
            });
        }
      }
      
      // Always use mock data for now (show demo data by default)
      // Determine data source - use mock if toggle is enabled OR if no real data
      const hasRealData = fetchedValues.length > 0 || fetchedGoals.length > 0;
      const useMock = isMockDataEnabled || !hasRealData;
      
      console.log('[useGoalsAndValues] Fetching data:', { 
        useMock, 
        isMockDataEnabled, 
        hasRealValues: fetchedValues.length, 
        hasRealGoals: fetchedGoals.length,
        hasRealData,
        globalMockEnabled: getGlobalMockDataEnabled(),
      });
      setDataSource(useMock ? 'MOCK' : 'REAL');

      // Use mock data if toggle is enabled or no real data exists
      if (useMock) {
        // Always register mock data first
        mockDataService.register.goalsValues(MOCK_GOALS_VALUES_DATA);
        const existingMock = mockDataService.get.goalsValues();
        
        console.log('[useGoalsAndValues] Using mock data:', {
          values: MOCK_GOALS_VALUES_DATA.values.length,
          goals: MOCK_GOALS_VALUES_DATA.goals.length,
          snapshots: MOCK_GOALS_VALUES_DATA.alignmentSnapshots.length,
          drift: MOCK_GOALS_VALUES_DATA.driftObservations.length,
          existingMock: !!existingMock,
        });
        
        // Always use MOCK_GOALS_VALUES_DATA directly to ensure it's loaded
        setValues(MOCK_GOALS_VALUES_DATA.values);
        setGoals(MOCK_GOALS_VALUES_DATA.goals);
        setAlignmentSnapshots(MOCK_GOALS_VALUES_DATA.alignmentSnapshots);
        setDriftObservations(MOCK_GOALS_VALUES_DATA.driftObservations);
        
        console.log('[useGoalsAndValues] Set mock data directly:', {
          valuesSet: MOCK_GOALS_VALUES_DATA.values.length,
          goalsSet: MOCK_GOALS_VALUES_DATA.goals.length,
          snapshotsSet: MOCK_GOALS_VALUES_DATA.alignmentSnapshots.length,
          driftSet: MOCK_GOALS_VALUES_DATA.driftObservations.length,
        });
      } else {
        // Use real data
        setValues(fetchedValues);
        setGoals(fetchedGoals);
        
        // Fetch alignment snapshots and drift for all goals
        if (fetchedGoals.length > 0) {
          const [snapshots, observations] = await Promise.all([
            fetchAlignmentSnapshots(fetchedGoals.map(g => g.id)),
            fetchDriftObservations(fetchedGoals.map(g => g.id)),
          ]);
          setAlignmentSnapshots(snapshots);
          setDriftObservations(observations);
        } else {
          setAlignmentSnapshots([]);
          setDriftObservations([]);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load goals and values');
      setValues([]);
      setGoals([]);
      setAlignmentSnapshots([]);
      setDriftObservations([]);
    } finally {
      setLoading(false);
    }
  }, [isMockDataEnabled, fetchAlignmentSnapshots, fetchDriftObservations]);

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

  // Refresh when mock data toggle changes
  useEffect(() => {
    const unsubscribe = subscribeToMockDataState(() => {
      void fetchData();
    });
    return unsubscribe;
  }, [fetchData]);

  const getPanelData = useCallback((): GoalsValuesPanelData => {
    return {
      goals,
      values,
      alignmentSnapshots,
      driftObservations,
      dataSource,
    };
  }, [goals, values, alignmentSnapshots, driftObservations, dataSource]);

  return {
    values,
    goals,
    alignmentSnapshots,
    driftObservations,
    loading,
    error,
    dataSource,
    refetch: fetchData,
    updateValuePriority,
    getGoalWithAlignment,
    computeAlignment,
    detectDrift,
    getPanelData,
  };
};

