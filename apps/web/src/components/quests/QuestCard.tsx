import { CheckCircle, PauseCircle, XCircle, Play, Target, Clock, TrendingUp } from 'lucide-react';
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

const QUEST_TYPE_COLORS: Record<string, string> = {
  main: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
  side: 'bg-purple-500/10 text-purple-400 border-purple-500/30',
  daily: 'bg-green-500/10 text-green-400 border-green-500/30',
  achievement: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30',
};

const STATUS_ICONS = {
  active: Play,
  paused: PauseCircle,
  completed: CheckCircle,
  abandoned: XCircle,
  archived: XCircle,
};

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-green-500/10 text-green-400 border-green-500/30',
  paused: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30',
  completed: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
  abandoned: 'bg-red-500/10 text-red-400 border-red-500/30',
  archived: 'bg-gray-500/10 text-gray-400 border-gray-500/30',
};

export const QuestCard = ({ quest, onStart, onPause, onComplete, onAbandon, onClick }: QuestCardProps) => {
  const StatusIcon = STATUS_ICONS[quest.status] || Target;

  const getCompositeScore = () => {
    return (quest.priority * 0.3) + (quest.importance * 0.4) + (quest.impact * 0.3);
  };

  return (
    <div
      className={`border rounded-lg p-4 cursor-pointer transition-all ${
        onClick
          ? 'border-border/60 bg-black/40 hover:border-primary/50 hover:bg-primary/5'
          : 'border-border/60 bg-black/40'
      }`}
      onClick={onClick}
    >
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          {/* Header */}
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <Badge variant="outline" className={`text-xs ${QUEST_TYPE_COLORS[quest.quest_type] || ''}`}>
              {quest.quest_type}
            </Badge>
            <Badge variant="outline" className={`text-xs ${STATUS_COLORS[quest.status] || ''}`}>
              <StatusIcon className="h-3 w-3 mr-1" />
              {quest.status}
            </Badge>
            {quest.category && (
              <Badge variant="outline" className="text-xs text-white/60">
                {quest.category}
              </Badge>
            )}
          </div>

          {/* Title and Description */}
          <h3 className="text-base font-semibold text-white mb-1">{quest.title}</h3>
          {quest.description && (
            <p className="text-sm text-white/70 mb-3 line-clamp-2">{quest.description}</p>
          )}

          {/* Progress Bar */}
          <div className="mb-3">
            <div className="flex items-center justify-between text-xs text-white/60 mb-1">
              <span>Progress</span>
              <span>{Math.round(quest.progress_percentage)}%</span>
            </div>
            <div className="w-full bg-black/60 rounded-full h-2">
              <div
                className="bg-primary h-2 rounded-full transition-all"
                style={{ width: `${quest.progress_percentage}%` }}
              />
            </div>
          </div>

          {/* Ranking Indicators */}
          <div className="flex items-center gap-4 mb-3 text-xs">
            <div className="flex items-center gap-1 text-white/60">
              <TrendingUp className="h-3 w-3" />
              <span>P:{quest.priority}</span>
            </div>
            <div className="flex items-center gap-1 text-white/60">
              <Target className="h-3 w-3" />
              <span>I:{quest.importance}</span>
            </div>
            <div className="flex items-center gap-1 text-white/60">
              <TrendingUp className="h-3 w-3" />
              <span>Impact:{quest.impact}</span>
            </div>
            {quest.difficulty && (
              <div className="flex items-center gap-1 text-white/60">
                <span>Diff:{quest.difficulty}</span>
              </div>
            )}
          </div>

          {/* Time Estimate */}
          {quest.effort_hours && (
            <div className="flex items-center gap-1 text-xs text-white/50 mb-2">
              <Clock className="h-3 w-3" />
              <span>~{quest.effort_hours}h</span>
            </div>
          )}

          {/* Tags */}
          {quest.tags && quest.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-2">
              {quest.tags.slice(0, 3).map((tag, idx) => (
                <span key={idx} className="text-xs px-2 py-0.5 bg-white/5 rounded text-white/60">
                  {tag}
                </span>
              ))}
            </div>
          )}

          {/* Actions */}
          {quest.status === 'active' && (
            <div className="flex gap-2 mt-3">
              {onPause && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    onPause();
                  }}
                  className="text-xs"
                >
                  <PauseCircle className="h-3 w-3 mr-1" />
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
                  className="text-xs"
                >
                  <CheckCircle className="h-3 w-3 mr-1" />
                  Complete
                </Button>
              )}
            </div>
          )}

          {quest.status === 'paused' && onStart && (
            <div className="flex gap-2 mt-3">
              <Button
                variant="outline"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  onStart();
                }}
                className="text-xs"
              >
                <Play className="h-3 w-3 mr-1" />
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
              className="text-xs text-red-400 hover:text-red-300 mt-2"
            >
              Abandon
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};
