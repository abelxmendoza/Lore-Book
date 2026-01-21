/**
 * Goals & Values Panel - Alignment-Centered UI
 * Single-panel UI where alignment over time is the primary narrative.
 * All other sections support interpretation, not analytics overload.
 */

import { useState, useMemo, useEffect } from 'react';
import { Target, Heart, AlertCircle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { MetricCard } from './MetricCard';
import { LoadingSkeleton } from './LoadingSkeleton';
import { EmptyState } from './EmptyState';
import { useGoalsAndValues } from '../../hooks/useGoalsAndValues';
import { AlignmentTimelineSection } from './goals/AlignmentTimelineSection';
import { GoalRow } from './goals/GoalRow';
import { ValuesPrioritySection } from './goals/ValuesPrioritySection';
import { DriftSection } from './goals/DriftSection';
import { useMockData } from '../../contexts/MockDataContext';
import { useQuests } from '../../hooks/useQuests';
import { Button } from '../ui/button';
import { mockDataService } from '../../services/mockDataService';
import { MOCK_GOALS_VALUES_DATA } from '../../mocks/goalsValues';

export const GoalsAndValuesPanel = () => {
  const { isMockDataEnabled } = useMockData();
  const {
    values,
    goals,
    alignmentSnapshots,
    driftObservations,
    loading,
    error,
    dataSource,
    refetch,
    updateValuePriority,
  } = useGoalsAndValues();

  // Selected goal IDs for timeline filtering (default: all goals)
  const [selectedGoalIds, setSelectedGoalIds] = useState<string[]>([]);

  // Filter to only active goals (must be declared before useEffects that use it)
  const activeGoals = useMemo(() => {
    return goals.filter(g => g.status === 'ACTIVE');
  }, [goals]);

  // Initialize selectedGoalIds to all active goals when goals load
  useEffect(() => {
    if (activeGoals.length > 0 && selectedGoalIds.length === 0) {
      setSelectedGoalIds(activeGoals.map(g => g.id));
    }
  }, [activeGoals, selectedGoalIds.length]);

  // Mock data is already registered when module loads (see mocks/goalsValues.ts)
  // This useEffect ensures it's registered if the module hasn't loaded yet
  useEffect(() => {
    const existing = mockDataService.get.goalsValues();
    if (!existing) {
      mockDataService.register.goalsValues(MOCK_GOALS_VALUES_DATA);
      console.log('[GoalsAndValuesPanel] Mock data registered (fallback)');
    }
  }, []);

  // Toggle goal selection
  const toggleGoalSelection = (goalId: string) => {
    setSelectedGoalIds(prev => {
      if (prev.includes(goalId)) {
        return prev.filter(id => id !== goalId);
      } else {
        return [...prev, goalId];
      }
    });
  };

  // Get latest alignment for a goal
  const getLatestAlignment = (goalId: string) => {
    const goalSnapshots = alignmentSnapshots
      .filter(s => s.goal_id === goalId)
      .sort((a, b) => new Date(b.generated_at).getTime() - new Date(a.generated_at).getTime());
    return goalSnapshots[0] || null;
  };

  // Count active goals
  const activeGoalsCount = useMemo(() => {
    return activeGoals.length;
  }, [activeGoals]);

  // Sort values by priority (highest first)
  const sortedValues = useMemo(() => {
    return [...values].sort((a, b) => b.priority - a.priority);
  }, [values]);

  // Calculate average alignment
  const averageAlignment = useMemo(() => {
    if (alignmentSnapshots.length === 0) return 0;
    const sum = alignmentSnapshots.reduce((acc, s) => acc + s.alignment_score, 0);
    return sum / alignmentSnapshots.length;
  }, [alignmentSnapshots]);


  // Debug: Log current state and force load mock data if needed - MUST be before any early returns
  useEffect(() => {
    console.log('[GoalsAndValuesPanel] Current state:', {
      loading,
      error,
      valuesCount: values.length,
      goalsCount: goals.length,
      activeGoalsCount: activeGoals.length,
      alignmentSnapshotsCount: alignmentSnapshots.length,
      driftObservationsCount: driftObservations.length,
      dataSource,
      isMockDataEnabled,
      values: values.map(v => ({ id: v.id, name: v.name, priority: v.priority })),
      goals: goals.map(g => ({ id: g.id, title: g.title, status: g.status })),
    });
    
    // If no data and mock is enabled, force register and refetch
    if (values.length === 0 && goals.length === 0 && !loading && isMockDataEnabled) {
      console.warn('[GoalsAndValuesPanel] No data but mock enabled, forcing refetch...');
      mockDataService.register.goalsValues(MOCK_GOALS_VALUES_DATA);
      void refetch();
    }
  }, [loading, error, values.length, goals.length, activeGoals.length, alignmentSnapshots.length, driftObservations.length, dataSource, isMockDataEnabled, refetch, values, goals]);

  // Show loading state (early return AFTER all hooks)
  if (loading) {
    return <LoadingSkeleton />;
  }

  // Show error state (early return AFTER all hooks)
  if (error) {
    return (
      <div className="text-center py-12">
        <AlertCircle className="h-12 w-12 mx-auto mb-4 text-red-400" />
        <p className="text-red-400 mb-2">Failed to load</p>
        <p className="text-sm text-white/60 mb-4">{error}</p>
        <button
          onClick={() => refetch()}
          className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/80 transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  // Always render the UI, even if data is empty
  return (
    <div className="space-y-6">
      {/* Debug info - remove in production */}
      {process.env.NODE_ENV === 'development' && (
        <div className="p-2 bg-yellow-500/20 border border-yellow-500/50 rounded text-xs text-yellow-400">
          Debug: loading={String(loading)}, values={values.length}, goals={goals.length}, activeGoals={activeGoals.length}, dataSource={dataSource}, mockEnabled={String(isMockDataEnabled)}
        </div>
      )}
      
      {/* Panel Header */}
      <Card className="bg-gradient-to-r from-red-900/30 to-pink-900/30 border-red-500/50">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-500/20 rounded-lg">
                <Target className="h-6 w-6 text-red-400" />
              </div>
          <div>
                <CardTitle className="text-2xl text-white">Goals & Values</CardTitle>
                <CardDescription className="text-white/70">
                  Alignment between intent and action over time
                </CardDescription>
          </div>
        </div>
            {dataSource === 'MOCK' && (
              <Badge variant="outline" className="bg-yellow-500/20 text-yellow-400 border-yellow-500/50">
                Demo Data
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
            <MetricCard
              label="Values"
              value={values.length || 0}
            />
            <MetricCard
              label="Active Goals"
              value={activeGoalsCount || 0}
            />
            <MetricCard
              label="Avg Alignment"
              value={alignmentSnapshots.length > 0 ? `${Math.round(averageAlignment * 100)}%` : '0%'}
            />
          </div>
        </CardContent>
      </Card>

      {/* Primary: Alignment Timeline */}
      <AlignmentTimelineSection
        alignmentSnapshots={alignmentSnapshots}
        goals={activeGoals}
        selectedGoalIds={selectedGoalIds}
      />

      {/* Context: Goals + Values */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Goals List */}
        <Card className="bg-black/40 border-border/60">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg font-semibold text-white">Active Goals</CardTitle>
                <CardDescription className="text-white/60">
                  Select goals to view in the alignment timeline
                </CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const route = '/quests';
                  window.location.href = route;
                }}
                className="text-xs"
              >
                <Target className="h-3 w-3 mr-1" />
                View Quests
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {activeGoals.length > 0 ? (
          <div className="space-y-3">
                {activeGoals.map((goal) => (
                  <GoalRow
                key={goal.id}
                goal={goal}
                    isSelected={selectedGoalIds.includes(goal.id)}
                    onToggle={() => toggleGoalSelection(goal.id)}
                    latestAlignment={getLatestAlignment(goal.id)}
              />
            ))}
          </div>
        ) : (
              <EmptyState
                title="No Active Goals"
                description="Declare goals to track your progress and alignment over time"
              />
            )}
          </CardContent>
        </Card>

        {/* Values Priority */}
        <ValuesPrioritySection
          values={sortedValues}
          onPriorityChange={updateValuePriority}
        />
      </div>

      {/* Drift Observations */}
      {driftObservations.length > 0 && (
        <DriftSection driftObservations={driftObservations} />
      )}
    </div>
  );
};
