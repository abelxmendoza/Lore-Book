import { Target, Heart, CheckCircle, PauseCircle, XCircle, AlertCircle } from 'lucide-react';
import { Badge } from '../../ui/badge';
import type { Goal, AlignmentSnapshot } from '../../../hooks/useGoalsAndValues';

interface GoalRowProps {
  goal: Goal;
  isSelected: boolean;
  onToggle: () => void;
  latestAlignment: AlignmentSnapshot | null;
}

const GOAL_TYPE_ICONS = {
  PERSONAL: Heart,
  CAREER: Target,
  RELATIONSHIP: Heart,
  HEALTH: Heart,
  FINANCIAL: Target,
  CREATIVE: Target,
};

const GOAL_TYPE_COLORS: Record<string, string> = {
  PERSONAL: 'bg-pink-500/10 text-pink-400 border-pink-500/30',
  CAREER: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
  RELATIONSHIP: 'bg-green-500/10 text-green-400 border-green-500/30',
  HEALTH: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
  FINANCIAL: 'bg-purple-500/10 text-purple-400 border-purple-500/30',
  CREATIVE: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30',
};

const STATUS_ICONS = {
  ACTIVE: CheckCircle,
  PAUSED: PauseCircle,
  COMPLETED: CheckCircle,
  ABANDONED: XCircle,
};

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: 'bg-green-500/10 text-green-400 border-green-500/30',
  PAUSED: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30',
  COMPLETED: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
  ABANDONED: 'bg-red-500/10 text-red-400 border-red-500/30',
};

export const GoalRow = ({ goal, isSelected, onToggle, latestAlignment }: GoalRowProps) => {
  const GoalIcon = GOAL_TYPE_ICONS[goal.goal_type] || Target;
  const StatusIcon = STATUS_ICONS[goal.status] || AlertCircle;

  const getAlignmentColor = (score: number) => {
    if (score >= 0.3) return 'text-green-400';
    if (score >= -0.3) return 'text-yellow-400';
    return 'text-red-400';
  };

  const getAlignmentLabel = (score: number) => {
    if (score >= 0.3) return 'Aligned';
    if (score >= -0.3) return 'Neutral';
    return 'Misaligned';
  };

  return (
    <div
      className={`border rounded-lg p-4 cursor-pointer transition-all ${
        isSelected
          ? 'border-primary bg-primary/10'
          : 'border-border/60 bg-black/40 hover:border-primary/50 hover:bg-primary/5'
      }`}
      onClick={onToggle}
    >
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={isSelected}
          onChange={onToggle}
          onClick={(e) => e.stopPropagation()}
          className="mt-1 h-4 w-4 rounded border-border/60 bg-black/40 text-primary focus:ring-primary"
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <GoalIcon className={`h-4 w-4 ${GOAL_TYPE_COLORS[goal.goal_type]?.split(' ')[1] || 'text-primary'}`} />
            <Badge variant="outline" className={`text-xs ${GOAL_TYPE_COLORS[goal.goal_type] || ''}`}>
              {goal.goal_type}
            </Badge>
            <Badge variant="outline" className={`text-xs ${STATUS_COLORS[goal.status] || ''}`}>
              <StatusIcon className="h-3 w-3 mr-1" />
              {goal.status}
            </Badge>
            <span className="text-xs text-white/40">•</span>
            <span className="text-xs text-white/60">{goal.target_timeframe}</span>
          </div>
          <h3 className="text-base font-semibold text-white mb-1">{goal.title}</h3>
          <p className="text-sm text-white/70 mb-2">{goal.description}</p>
          {latestAlignment && (
            <div className="flex items-center gap-2 mt-2">
              <span className="text-xs text-white/60">Latest Alignment:</span>
              <span className={`text-xs font-medium ${getAlignmentColor(latestAlignment.alignment_score)}`}>
                {getAlignmentLabel(latestAlignment.alignment_score)} ({Math.round(latestAlignment.alignment_score * 100)}%)
              </span>
              <span className="text-xs text-white/40">
                (Confidence: {Math.round(latestAlignment.confidence * 100)}%)
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

