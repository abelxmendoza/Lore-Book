import { CheckCircle, PauseCircle, XCircle, Play, Target, Clock, TrendingUp, Sparkles } from 'lucide-react';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import type { Quest } from '../../../types/quest';

interface QuestCardProps {
  quest: Quest;
  onStart?: () => void;
  onPause?: () => void;
  onComplete?: () => void;
  onAbandon?: () => void;
  onClick?: () => void;
}

const QUEST_TYPE_COLORS: Record<string, { bg: string; text: string; border: string; glow: string }> = {
  main: {
    bg: 'bg-blue-500/10',
    text: 'text-blue-400',
    border: 'border-blue-500/30',
    glow: 'shadow-blue-500/20',
  },
  side: {
    bg: 'bg-purple-500/10',
    text: 'text-purple-400',
    border: 'border-purple-500/30',
    glow: 'shadow-purple-500/20',
  },
  daily: {
    bg: 'bg-green-500/10',
    text: 'text-green-400',
    border: 'border-green-500/30',
    glow: 'shadow-green-500/20',
  },
  achievement: {
    bg: 'bg-yellow-500/10',
    text: 'text-yellow-400',
    border: 'border-yellow-500/30',
    glow: 'shadow-yellow-500/20',
  },
};

const STATUS_ICONS = {
  active: Play,
  paused: PauseCircle,
  completed: CheckCircle,
  abandoned: XCircle,
  archived: XCircle,
};

const STATUS_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  active: { bg: 'bg-green-500/10', text: 'text-green-400', border: 'border-green-500/30' },
  paused: { bg: 'bg-yellow-500/10', text: 'text-yellow-400', border: 'border-yellow-500/30' },
  completed: { bg: 'bg-blue-500/10', text: 'text-blue-400', border: 'border-blue-500/30' },
  abandoned: { bg: 'bg-red-500/10', text: 'text-red-400', border: 'border-red-500/30' },
  archived: { bg: 'bg-gray-500/10', text: 'text-gray-400', border: 'border-gray-500/30' },
};

export const QuestCard = ({ quest, onStart, onPause, onComplete, onAbandon, onClick }: QuestCardProps) => {
  const StatusIcon = STATUS_ICONS[quest.status] || Target;
  const typeColors = QUEST_TYPE_COLORS[quest.quest_type] || QUEST_TYPE_COLORS.main;
  const statusColors = STATUS_COLORS[quest.status] || STATUS_COLORS.active;

  const getCompositeScore = () => {
    return (quest.priority * 0.3) + (quest.importance * 0.4) + (quest.impact * 0.3);
  };

  const compositeScore = getCompositeScore();

  return (
    <div
      className={`group relative border rounded-xl p-5 cursor-pointer transition-all duration-300 ${
        onClick
          ? `border-border/60 bg-gradient-to-br from-black/60 to-black/40 hover:border-primary/50 hover:bg-gradient-to-br hover:from-primary/10 hover:to-black/60 hover:shadow-lg hover:shadow-primary/10 hover:scale-[1.02]`
          : 'border-border/60 bg-gradient-to-br from-black/60 to-black/40'
      }`}
      onClick={onClick}
    >
      {/* Glow effect for active quests */}
      {quest.status === 'active' && (
        <div className={`absolute inset-0 rounded-xl ${typeColors.glow} opacity-0 group-hover:opacity-100 blur-xl transition-opacity duration-300`} />
      )}

      <div className="relative z-10">
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            {/* Header with badges */}
            <div className="flex items-center gap-2 mb-3 flex-wrap">
              <Badge 
                variant="outline" 
                className={`text-xs font-semibold ${typeColors.bg} ${typeColors.text} ${typeColors.border} border`}
              >
                {quest.quest_type}
              </Badge>
              <Badge 
                variant="outline" 
                className={`text-xs font-semibold ${statusColors.bg} ${statusColors.text} ${statusColors.border} border flex items-center gap-1`}
              >
                <StatusIcon className="h-3 w-3" />
                {quest.status}
              </Badge>
              {quest.category && (
                <Badge variant="outline" className="text-xs text-white/70 bg-white/5 border-white/10">
                  {quest.category}
                </Badge>
              )}
              {quest.source === 'extracted' && (
                <Badge variant="outline" className="text-xs text-primary/80 bg-primary/10 border-primary/20 flex items-center gap-1">
                  <Sparkles className="h-3 w-3" />
                  Auto-detected
                </Badge>
              )}
            </div>

            {/* Title and Description */}
            <h3 className="text-lg font-bold text-white mb-2 leading-tight">{quest.title}</h3>
            {quest.description && (
              <p className="text-sm text-white/70 mb-4 line-clamp-2 leading-relaxed">{quest.description}</p>
            )}

            {/* Progress Bar with enhanced styling */}
            <div className="mb-4">
              <div className="flex items-center justify-between text-xs text-white/70 mb-2">
                <span className="font-medium">Progress</span>
                <span className="font-semibold">{Math.round(quest.progress_percentage)}%</span>
              </div>
              <div className="w-full bg-black/60 rounded-full h-2.5 overflow-hidden border border-white/5">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${typeColors.bg} ${typeColors.border} border`}
                  style={{ 
                    width: `${quest.progress_percentage}%`,
                    boxShadow: `0 0 8px ${typeColors.text.replace('text-', '').replace('-400', '')}/30`
                  }}
                />
              </div>
            </div>

            {/* Ranking Indicators with enhanced styling */}
            <div className="flex items-center gap-4 mb-4 text-xs">
              <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-white/5 text-white/80">
                <TrendingUp className="h-3.5 w-3.5 text-primary" />
                <span className="font-semibold">P:{quest.priority}</span>
              </div>
              <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-white/5 text-white/80">
                <Target className="h-3.5 w-3.5 text-primary" />
                <span className="font-semibold">I:{quest.importance}</span>
              </div>
              <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-white/5 text-white/80">
                <TrendingUp className="h-3.5 w-3.5 text-primary" />
                <span className="font-semibold">Impact:{quest.impact}</span>
              </div>
              {quest.difficulty && (
                <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-white/5 text-white/80">
                  <span className="font-semibold">Diff:{quest.difficulty}</span>
                </div>
              )}
            </div>

            {/* Composite Score Badge */}
            <div className="mb-4">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gradient-to-r from-primary/20 to-primary/10 border border-primary/30">
                <Sparkles className="h-3.5 w-3.5 text-primary" />
                <span className="text-xs font-bold text-primary">Score: {compositeScore.toFixed(1)}</span>
              </div>
            </div>

            {/* Time Estimate */}
            {quest.effort_hours && (
              <div className="flex items-center gap-1.5 text-xs text-white/60 mb-3 px-2 py-1 rounded-md bg-white/5">
                <Clock className="h-3.5 w-3.5" />
                <span>~{quest.effort_hours}h estimated</span>
              </div>
            )}

            {/* Tags */}
            {quest.tags && quest.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-3">
                {quest.tags.slice(0, 3).map((tag, idx) => (
                  <span key={idx} className="text-xs px-2 py-1 rounded-md bg-white/5 border border-white/10 text-white/70">
                    {tag}
                  </span>
                ))}
                {quest.tags.length > 3 && (
                  <span className="text-xs px-2 py-1 rounded-md bg-white/5 border border-white/10 text-white/50">
                    +{quest.tags.length - 3}
                  </span>
                )}
              </div>
            )}

            {/* Actions */}
            {quest.status === 'active' && (
              <div className="flex gap-2 mt-4 pt-4 border-t border-white/10">
                {onPause && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      onPause();
                    }}
                    className="text-xs flex-1 bg-black/40 border-border/60 hover:bg-yellow-500/10 hover:border-yellow-500/30"
                  >
                    <PauseCircle className="h-3.5 w-3.5 mr-1.5" />
                    Pause
                  </Button>
                )}
                {onComplete && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      onComplete();
                    }}
                    className="text-xs flex-1 bg-black/40 border-border/60 hover:bg-green-500/10 hover:border-green-500/30"
                  >
                    <CheckCircle className="h-3.5 w-3.5 mr-1.5" />
                    Complete
                  </Button>
                )}
              </div>
            )}

            {quest.status === 'paused' && onStart && (
              <div className="flex gap-2 mt-4 pt-4 border-t border-white/10">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    onStart();
                  }}
                  className="text-xs w-full bg-black/40 border-border/60 hover:bg-green-500/10 hover:border-green-500/30"
                >
                  <Play className="h-3.5 w-3.5 mr-1.5" />
                  Resume
                </Button>
              </div>
            )}

            {quest.status === 'active' && onAbandon && (
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  onAbandon();
                }}
                className="text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10 mt-2 w-full"
              >
                <XCircle className="h-3.5 w-3.5 mr-1.5" />
                Abandon Quest
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
