import React from 'react';
import { AlertCircle, Brain, Heart, Activity, Clock, X } from 'lucide-react';
import type { ReactionEntry } from '../../types/reaction';
import { formatDistanceToNow } from 'date-fns';

interface ReactionChipProps {
  reaction: ReactionEntry;
  onRemove?: (reactionId: string) => void;
  showDetails?: boolean;
}

const REACTION_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  anxiety: { bg: 'bg-yellow-500/10', border: 'border-yellow-500/30', text: 'text-yellow-400' },
  anger: { bg: 'bg-red-500/10', border: 'border-red-500/30', text: 'text-red-400' },
  sadness: { bg: 'bg-blue-500/10', border: 'border-blue-500/30', text: 'text-blue-400' },
  fear: { bg: 'bg-purple-500/10', border: 'border-purple-500/30', text: 'text-purple-400' },
  avoidance: { bg: 'bg-orange-500/10', border: 'border-orange-500/30', text: 'text-orange-400' },
  withdrawal: { bg: 'bg-gray-500/10', border: 'border-gray-500/30', text: 'text-gray-400' },
  shutdown: { bg: 'bg-slate-500/10', border: 'border-slate-500/30', text: 'text-slate-400' },
  rumination: { bg: 'bg-pink-500/10', border: 'border-pink-500/30', text: 'text-pink-400' },
  overthinking: { bg: 'bg-indigo-500/10', border: 'border-indigo-500/30', text: 'text-indigo-400' },
  default: { bg: 'bg-white/5', border: 'border-white/10', text: 'text-white/70' }
};

const getReactionIcon = (type: string) => {
  switch (type) {
    case 'emotional':
      return Heart;
    case 'behavioral':
      return Activity;
    case 'cognitive':
      return Brain;
    case 'physical':
      return AlertCircle;
    default:
      return AlertCircle;
  }
};

export const ReactionChip: React.FC<ReactionChipProps> = ({
  reaction,
  onRemove,
  showDetails = false
}) => {
  const colors = REACTION_COLORS[reaction.reaction_label.toLowerCase()] || REACTION_COLORS.default;
  const Icon = getReactionIcon(reaction.reaction_type);
  const isResolved = reaction.timestamp_resolved !== null;

  return (
    <div
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border ${colors.bg} ${colors.border} ${colors.text} text-xs transition-all hover:opacity-80 ${
        isResolved ? 'opacity-60' : ''
      }`}
      title={showDetails ? undefined : `${reaction.reaction_label} (${reaction.intensity ? Math.round(reaction.intensity * 100) + '%' : 'N/A'})`}
    >
      <Icon className="h-3 w-3" />
      <span className="font-medium">{reaction.reaction_label}</span>
      {reaction.intensity !== null && (
        <span className="text-white/50">({Math.round(reaction.intensity * 100)})</span>
      )}
      {showDetails && (
        <>
          {reaction.duration && (
            <span className="flex items-center gap-0.5 text-white/40">
              <Clock className="h-2.5 w-2.5" />
              {reaction.duration}
            </span>
          )}
          {isResolved && (
            <span className="text-white/30 text-[10px]">resolved</span>
          )}
        </>
      )}
      {onRemove && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove(reaction.id);
          }}
          className="ml-1 hover:bg-white/10 rounded p-0.5 transition-colors"
        >
          <X className="h-2.5 w-2.5" />
        </button>
      )}
    </div>
  );
};
