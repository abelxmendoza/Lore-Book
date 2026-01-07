import { useMemo } from 'react';
import { TrendingUp, Clock } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../ui/card';
import { ChartCard } from '../ChartCard';
import { EmptyState } from '../EmptyState';
import { AlignmentTooltip } from './AlignmentTooltip';
import type { AlignmentSnapshot, Goal } from '../../../hooks/useGoalsAndValues';

interface AlignmentTimelineSectionProps {
  alignmentSnapshots: AlignmentSnapshot[];
  goals: Goal[];
  selectedGoalIds: string[];
}

// Goal type color mapping
const GOAL_TYPE_COLORS: Record<string, string> = {
  PERSONAL: '#ec4899', // fuchsia
  CAREER: '#3b82f6', // blue
  RELATIONSHIP: '#10b981', // emerald
  HEALTH: '#f59e0b', // amber
  FINANCIAL: '#8b5cf6', // violet
  CREATIVE: '#06b6d4', // cyan
};

export const AlignmentTimelineSection = ({
  alignmentSnapshots,
  goals,
  selectedGoalIds,
}: AlignmentTimelineSectionProps) => {
  // Filter snapshots by selected goals
  const filteredSnapshots = useMemo(() => {
    if (selectedGoalIds.length === 0) return [];
    return alignmentSnapshots.filter(snapshot => selectedGoalIds.includes(snapshot.goal_id));
  }, [alignmentSnapshots, selectedGoalIds]);

  // Build chart data series - one line per goal
  const chartData = useMemo(() => {
    if (filteredSnapshots.length === 0) return [];

    // Group snapshots by goal_id
    const snapshotsByGoal = filteredSnapshots.reduce((acc, snapshot) => {
      if (!acc[snapshot.goal_id]) {
        acc[snapshot.goal_id] = [];
      }
      acc[snapshot.goal_id].push(snapshot);
      return acc;
    }, {} as Record<string, AlignmentSnapshot[]>);

    // Sort snapshots by time for each goal
    Object.keys(snapshotsByGoal).forEach(goalId => {
      snapshotsByGoal[goalId].sort((a, b) => 
        new Date(a.generated_at).getTime() - new Date(b.generated_at).getTime()
      );
    });

    // Get all unique timestamps
    const allTimestamps = new Set<string>();
    Object.values(snapshotsByGoal).forEach(snapshots => {
      snapshots.forEach(s => {
        allTimestamps.add(s.generated_at);
      });
    });
    const sortedTimestamps = Array.from(allTimestamps).sort((a, b) => 
      new Date(a).getTime() - new Date(b).getTime()
    );

    // Build data points for each timestamp
    const dataPoints = sortedTimestamps.map(timestamp => {
      const point: Record<string, any> = {
        date: new Date(timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        timestamp,
      };

      // Add alignment score for each selected goal at this timestamp
      selectedGoalIds.forEach(goalId => {
        const goal = goals.find(g => g.id === goalId);
        if (!goal) return;

        const snapshot = snapshotsByGoal[goalId]?.find(s => s.generated_at === timestamp);
        if (snapshot) {
          point[goal.title] = Math.round(snapshot.alignment_score * 100) / 100;
          // Store snapshot metadata for tooltip
          point[`${goal.title}_snapshot`] = snapshot;
        }
      });

      return point;
    });

    return dataPoints;
  }, [filteredSnapshots, goals, selectedGoalIds]);

  // Build series configuration for ChartCard (array of data keys)
  const series = useMemo(() => {
    return selectedGoalIds
      .map(goalId => {
        const goal = goals.find(g => g.id === goalId);
        return goal?.title;
      })
      .filter(Boolean) as string[];
  }, [selectedGoalIds, goals]);

  if (selectedGoalIds.length === 0) {
    return (
      <Card className="bg-black/40 border-border/60">
        <CardHeader>
          <div className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg font-semibold text-white">Alignment Over Time</CardTitle>
          </div>
          <CardDescription className="text-white/60">
            How closely your actions align with what you value
          </CardDescription>
        </CardHeader>
        <CardContent>
          <EmptyState
            title="No Goals Selected"
            description="Select goals from the list below to view alignment over time"
          />
        </CardContent>
      </Card>
    );
  }

  if (chartData.length === 0) {
    return (
      <Card className="bg-black/40 border-border/60">
        <CardHeader>
          <div className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg font-semibold text-white">Alignment Over Time</CardTitle>
          </div>
          <CardDescription className="text-white/60">
            How closely your actions align with what you value
          </CardDescription>
        </CardHeader>
        <CardContent>
          <EmptyState
            title="No Alignment History"
            description="Alignment data will appear here as you track progress toward your goals"
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-black/40 border-border/60">
      <CardHeader>
        <div className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-primary" />
          <CardTitle className="text-lg font-semibold text-white">Alignment Over Time</CardTitle>
        </div>
        <CardDescription className="text-white/60">
          How closely your actions align with what you value
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ChartCard
          title=""
          chartType="line"
          data={chartData}
          xAxis="date"
          yAxis="alignment_score"
          series={series}
          yAxisDomain={[-1, 1]}
          customTooltip={<AlignmentTooltip />}
          description="Alignment scores range from -1.0 (misaligned) to +1.0 (aligned). Each line represents a selected goal."
        />
      </CardContent>
    </Card>
  );
};

