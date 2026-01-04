/**
 * Goals & Values Dashboard
 * Gives the system meaning and anchors everything else
 */

import { useState } from 'react';
import { 
  Target, 
  Heart,
  TrendingDown,
  TrendingUp,
  Minus,
  AlertCircle,
  Info
} from 'lucide-react';
import { 
  useGoalsAndValues, 
  type Value, 
  type Goal,
  type GoalType,
  type AlignmentSnapshot,
  type DriftObservation
} from '../../hooks/useGoalsAndValues';

const GoalTypeIcon = ({ type }: { type: GoalType }) => {
  const icons = {
    PERSONAL: Heart,
    CAREER: Target,
    RELATIONSHIP: Heart,
    HEALTH: Heart,
    FINANCIAL: Target,
    CREATIVE: Target,
  };
  const Icon = icons[type] || Target;
  return <Icon className="h-4 w-4" />;
};

const AlignmentScoreBar = ({ score }: { score: number }) => {
  // Score ranges from -1.0 (misaligned) to +1.0 (aligned)
  const percentage = Math.round((score + 1) * 50); // Convert -1..1 to 0..100
  const color = score >= 0.3 ? 'bg-green-500' : score >= -0.3 ? 'bg-yellow-500' : 'bg-red-500';
  
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-3 bg-white/10 rounded-full overflow-hidden">
        <div 
          className={`h-full ${color} transition-all`}
          style={{ width: `${percentage}%` }}
        />
      </div>
      <span className="text-xs text-white/60 w-16 text-right">
        {score >= 0.3 ? 'Aligned' : score >= -0.3 ? 'Neutral' : 'Misaligned'}
      </span>
    </div>
  );
};

const ValueCard = ({ value, onPriorityChange }: { 
  value: Value; 
  onPriorityChange: (id: string, priority: number) => Promise<void>;
}) => {
  const [priority, setPriority] = useState(value.priority);
  const [updating, setUpdating] = useState(false);

  const handlePriorityChange = async (newPriority: number) => {
    setPriority(newPriority);
    setUpdating(true);
    try {
      await onPriorityChange(value.id, newPriority);
    } catch (error) {
      console.error('Failed to update priority:', error);
      setPriority(value.priority); // Revert on error
    } finally {
      setUpdating(false);
    }
  };

  return (
    <div className="border border-border/60 rounded-lg bg-black/40 p-4">
      <div className="flex items-start justify-between gap-4 mb-3">
        <div className="flex-1">
          <h3 className="text-base font-semibold text-white mb-1">{value.name}</h3>
          <p className="text-sm text-white/70">{value.description}</p>
        </div>
      </div>
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs font-medium text-white/60">Priority</label>
          <span className="text-xs text-white/60">{Math.round(priority * 100)}%</span>
        </div>
        <input
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={priority}
          onChange={(e) => {
            const newPriority = parseFloat(e.target.value);
            setPriority(newPriority);
          }}
          onMouseUp={(e) => {
            const newPriority = parseFloat((e.target as HTMLInputElement).value);
            void handlePriorityChange(newPriority);
          }}
          disabled={updating}
          className="w-full"
        />
      </div>
    </div>
  );
};

const GoalCard = ({ goal, onComputeAlignment, onDetectDrift }: { 
  goal: Goal;
  onComputeAlignment: (goalId: string) => Promise<AlignmentSnapshot>;
  onDetectDrift: (goalId: string) => Promise<DriftObservation | null>;
}) => {
  const [expanded, setExpanded] = useState(false);
  const [alignment, setAlignment] = useState<AlignmentSnapshot | null>(null);
  const [drift, setDrift] = useState<DriftObservation | null>(null);
  const [loadingAlignment, setLoadingAlignment] = useState(false);
  const [loadingDrift, setLoadingDrift] = useState(false);

  const handleComputeAlignment = async () => {
    setLoadingAlignment(true);
    try {
      const snapshot = await onComputeAlignment(goal.id);
      setAlignment(snapshot);
    } catch (error) {
      console.error('Failed to compute alignment:', error);
    } finally {
      setLoadingAlignment(false);
    }
  };

  const handleDetectDrift = async () => {
    setLoadingDrift(true);
    try {
      const driftObs = await onDetectDrift(goal.id);
      setDrift(driftObs);
    } catch (error) {
      console.error('Failed to detect drift:', error);
    } finally {
      setLoadingDrift(false);
    }
  };

  return (
    <div className="border border-border/60 rounded-lg bg-black/40 p-4 space-y-3">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <GoalTypeIcon type={goal.goal_type} />
            <span className="text-xs text-white/60">{goal.goal_type}</span>
            <span className="text-xs text-white/40">•</span>
            <span className="text-xs text-white/60">{goal.target_timeframe}</span>
          </div>
          <h3 className="text-base font-semibold text-white mb-1">{goal.title}</h3>
          <p className="text-sm text-white/70">{goal.description}</p>
        </div>
        <button
          onClick={() => setExpanded(!expanded)}
          className="p-1 rounded hover:bg-white/10 transition-colors"
        >
          {expanded ? '−' : '+'}
        </button>
      </div>

      {expanded && (
        <div className="pt-3 border-t border-white/10 space-y-3">
          <div className="flex items-center gap-2">
            <button
              onClick={handleComputeAlignment}
              disabled={loadingAlignment}
              className="px-3 py-1 bg-primary/20 text-primary border border-primary/50 rounded text-xs hover:bg-primary/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loadingAlignment ? 'Computing...' : 'Compute Alignment'}
            </button>
            <button
              onClick={handleDetectDrift}
              disabled={loadingDrift}
              className="px-3 py-1 bg-yellow-500/20 text-yellow-400 border border-yellow-500/50 rounded text-xs hover:bg-yellow-500/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loadingDrift ? 'Checking...' : 'Check Drift'}
            </button>
          </div>

          {alignment && (
            <div>
              <h4 className="text-xs font-semibold text-white/60 mb-2">Alignment Score</h4>
              <AlignmentScoreBar score={alignment.alignment_score} />
              <p className="text-xs text-white/60 mt-1">
                Confidence: {Math.round(alignment.confidence * 100)}%
              </p>
            </div>
          )}

          {drift && (
            <div className="p-3 bg-yellow-500/10 border border-yellow-500/30 rounded">
              <div className="flex items-start gap-2 mb-1">
                {drift.trend === 'downward' && <TrendingDown className="h-4 w-4 text-yellow-400 flex-shrink-0 mt-0.5" />}
                {drift.trend === 'upward' && <TrendingUp className="h-4 w-4 text-green-400 flex-shrink-0 mt-0.5" />}
                {drift.trend === 'stable' && <Minus className="h-4 w-4 text-white/60 flex-shrink-0 mt-0.5" />}
                <div>
                  <h4 className="text-xs font-semibold text-white mb-1">{drift.title}</h4>
                  <p className="text-xs text-white/80 mb-1">{drift.description}</p>
                  <p className="text-xs text-yellow-400 italic">{drift.disclaimer}</p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export const GoalsAndValuesPanel = () => {
  const { values, goals, loading, error, refetch, updateValuePriority, computeAlignment, detectDrift } = useGoalsAndValues();

  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        <p className="mt-4 text-white/60">Loading goals and values...</p>
      </div>
    );
  }

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

  return (
    <div className="space-y-6">
      {/* Header Info */}
      <div className="bg-primary/10 border border-primary/30 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <Target className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="text-sm font-semibold text-white mb-1">Goals & Values</h3>
            <p className="text-sm text-white/70">
              Your declared values and goals anchor the system's understanding of what matters to you. 
              Alignment is observational, not evaluative. Drift is surfaced neutrally, not criticized.
            </p>
          </div>
        </div>
      </div>

      {/* Values Section */}
      <div>
        <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
          <Heart className="h-5 w-5 text-red-400" />
          Values ({values.length})
        </h3>
        {values.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {values.map((value) => (
              <ValueCard
                key={value.id}
                value={value}
                onPriorityChange={updateValuePriority}
              />
            ))}
          </div>
        ) : (
          <div className="text-center py-8 border border-border/60 rounded-lg bg-black/20">
            <Heart className="h-8 w-8 mx-auto mb-2 text-white/40" />
            <p className="text-sm text-white/60">No values declared yet</p>
            <p className="text-xs text-white/40 mt-1">
              Declare your core values to help the system understand what matters to you.
            </p>
          </div>
        )}
      </div>

      {/* Goals Section */}
      <div>
        <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
          <Target className="h-5 w-5 text-blue-400" />
          Active Goals ({goals.length})
        </h3>
        {goals.length > 0 ? (
          <div className="space-y-3">
            {goals.map((goal) => (
              <GoalCard
                key={goal.id}
                goal={goal}
                onComputeAlignment={computeAlignment}
                onDetectDrift={detectDrift}
              />
            ))}
          </div>
        ) : (
          <div className="text-center py-8 border border-border/60 rounded-lg bg-black/20">
            <Target className="h-8 w-8 mx-auto mb-2 text-white/40" />
            <p className="text-sm text-white/60">No active goals yet</p>
            <p className="text-xs text-white/40 mt-1">
              Declare goals to track your progress and alignment over time.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

