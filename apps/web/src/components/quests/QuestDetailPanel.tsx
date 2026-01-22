import { Clock, Target, TrendingUp, CheckCircle, Link as LinkIcon, Sparkles, X } from 'lucide-react';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { useQuest, useQuestHistory, useUpdateQuestProgress } from '../../hooks/useQuests';
import type { Quest } from '../../types/quest';

interface QuestDetailPanelProps {
  questId: string | null;
  onClose?: () => void;
}

export const QuestDetailPanel = ({ questId, onClose }: QuestDetailPanelProps) => {
  const { data: quest, isLoading } = useQuest(questId || '');
  const { data: history } = useQuestHistory(questId || '');
  const updateProgress = useUpdateQuestProgress();

  if (!questId) {
    return (
      <div className="h-full flex items-center justify-center bg-black/40 border-l-0 sm:border-l border-primary/20 backdrop-blur-sm min-h-0">
        <div className="text-center p-4 sm:p-8">
          <div className="text-primary/60 text-2xl sm:text-4xl mb-4 font-mono">[SELECT QUEST]</div>
          <p className="text-white/40 text-xs sm:text-sm font-mono">Choose a quest from the list to view details</p>
        </div>
      </div>
    );
  }

  if (isLoading || !quest) {
    return (
      <div className="h-full flex items-center justify-center bg-black/40 border-l-0 sm:border-l border-primary/20 backdrop-blur-sm min-h-0">
        <div className="text-primary/60 animate-pulse font-mono text-sm sm:text-base">LOADING...</div>
      </div>
    );
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'text-green-400';
      case 'completed': return 'text-yellow-400';
      case 'paused': return 'text-orange-400';
      case 'abandoned': return 'text-red-400';
      default: return 'text-primary';
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'main': return 'text-blue-400 border-blue-400/30';
      case 'side': return 'text-purple-400 border-purple-400/30';
      case 'daily': return 'text-green-400 border-green-400/30';
      case 'achievement': return 'text-yellow-400 border-yellow-400/30';
      default: return 'text-primary border-primary/30';
    }
  };

  return (
    <div className="h-full bg-black/40 border-l-0 sm:border-l border-primary/20 backdrop-blur-sm flex flex-col min-h-0 overflow-hidden">
      {/* Cyberpunk Header - Desktop Only */}
      <div className="hidden sm:block sticky top-0 z-10 bg-black/80 border-b border-primary/30 backdrop-blur-md flex-shrink-0">
        <div className="p-3 sm:p-4 sm:p-6">
          <div className="flex items-start justify-between gap-4 mb-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <div className={`h-1 w-1 rounded-full ${getStatusColor(quest.status)} animate-pulse`} />
                <Badge 
                  variant="outline" 
                  className={`text-[10px] sm:text-xs px-2 py-0.5 border ${getTypeColor(quest.quest_type)} bg-black/60`}
                >
                  {quest.quest_type.toUpperCase()}
                </Badge>
                <Badge 
                  variant="outline" 
                  className={`text-[10px] sm:text-xs px-2 py-0.5 border ${getStatusColor(quest.status)}/30 bg-black/60 ${getStatusColor(quest.status)}`}
                >
                  {quest.status.toUpperCase()}
                </Badge>
                {quest.source === 'extracted' && (
                  <Badge variant="outline" className="text-[10px] sm:text-xs text-primary/80 bg-primary/10 border-primary/30 flex items-center gap-1">
                    <Sparkles className="h-2.5 w-2.5" />
                    AUTO-DETECTED
                  </Badge>
                )}
              </div>
              <h2 className="text-base sm:text-lg sm:text-xl md:text-2xl font-bold text-white mb-2 font-mono tracking-wide">
                {quest.title}
              </h2>
            </div>
            {onClose && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onClose}
                className="text-white/60 hover:text-white hover:bg-primary/20 h-8 w-8 sm:h-10 sm:w-10 p-0 flex-shrink-0"
              >
                <X className="h-4 w-4 sm:h-5 sm:w-5" />
              </Button>
            )}
          </div>
          
          {/* Progress Bar with Cyberpunk Style */}
          <div className="relative">
            <div className="flex items-center justify-between text-xs sm:text-sm text-primary/80 mb-2 font-mono">
              <span>PROGRESS</span>
              <span>{Math.round(quest.progress_percentage)}%</span>
            </div>
            <div className="relative w-full h-2 sm:h-3 bg-black/60 rounded-sm overflow-hidden border border-primary/20">
              <div
                className="absolute inset-0 bg-gradient-to-r from-primary via-secondary to-primary h-full transition-all duration-500 shadow-neon"
                style={{ width: `${quest.progress_percentage}%` }}
              />
              <div className="absolute inset-0 bg-[linear-gradient(90deg,transparent_50%,rgba(255,255,255,0.1)_50%)] bg-[length:8px_100%] opacity-30" />
            </div>
            <div className="flex gap-2 mt-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => updateProgress.mutate({ questId, progress: Math.max(0, quest.progress_percentage - 10) })}
                className="text-xs px-2 h-9 sm:h-11 border-primary/30 text-primary hover:bg-primary/20 hover:border-primary/50 min-h-[44px] sm:min-h-0"
              >
                -10%
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => updateProgress.mutate({ questId, progress: Math.min(100, quest.progress_percentage + 10) })}
                className="text-xs px-2 h-9 sm:h-11 border-primary/30 text-primary hover:bg-primary/20 hover:border-primary/50 min-h-[44px] sm:min-h-0"
              >
                +10%
              </Button>
            </div>
          </div>
        </div>
      </div>
      
      {/* Mobile Header - Simplified (shown only on mobile) */}
      <div className="sm:hidden flex-shrink-0 p-4 border-b border-primary/30 bg-black/80">
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <div className={`h-1 w-1 rounded-full ${getStatusColor(quest.status)} animate-pulse`} />
          <Badge 
            variant="outline" 
            className={`text-[10px] px-2 py-0.5 border ${getTypeColor(quest.quest_type)} bg-black/60`}
          >
            {quest.quest_type.toUpperCase()}
          </Badge>
          <Badge 
            variant="outline" 
            className={`text-[10px] px-2 py-0.5 border ${getStatusColor(quest.status)}/30 bg-black/60 ${getStatusColor(quest.status)}`}
          >
            {quest.status.toUpperCase()}
          </Badge>
          {quest.source === 'extracted' && (
            <Badge variant="outline" className="text-[10px] text-primary/80 bg-primary/10 border-primary/30 flex items-center gap-1">
              <Sparkles className="h-2.5 w-2.5" />
              AUTO-DETECTED
            </Badge>
          )}
        </div>
        <h2 className="text-lg font-bold text-white mb-3 font-mono tracking-wide">
          {quest.title}
        </h2>
        {/* Progress Bar for Mobile */}
        <div className="relative">
          <div className="flex items-center justify-between text-xs text-primary/80 mb-2 font-mono">
            <span>PROGRESS</span>
            <span>{Math.round(quest.progress_percentage)}%</span>
          </div>
          <div className="relative w-full h-2 bg-black/60 rounded-sm overflow-hidden border border-primary/20">
            <div
              className="absolute inset-0 bg-gradient-to-r from-primary via-secondary to-primary h-full transition-all duration-500 shadow-neon"
              style={{ width: `${quest.progress_percentage}%` }}
            />
            <div className="absolute inset-0 bg-[linear-gradient(90deg,transparent_50%,rgba(255,255,255,0.1)_50%)] bg-[length:8px_100%] opacity-30" />
          </div>
          <div className="flex gap-2 mt-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => updateProgress.mutate({ questId, progress: Math.max(0, quest.progress_percentage - 10) })}
              className="text-xs px-2 h-11 border-primary/30 text-primary hover:bg-primary/20 hover:border-primary/50 min-h-[44px] flex-1"
            >
              -10%
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => updateProgress.mutate({ questId, progress: Math.min(100, quest.progress_percentage + 10) })}
              className="text-xs px-2 h-11 border-primary/30 text-primary hover:bg-primary/20 hover:border-primary/50 min-h-[44px] flex-1"
            >
              +10%
            </Button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden p-3 sm:p-4 sm:p-6 space-y-3 sm:space-y-4 sm:space-y-6 min-h-0" style={{ WebkitOverflowScrolling: 'touch' }}>
        {/* Description */}
        {quest.description && (
          <div className="bg-black/30 border border-primary/20 rounded p-2.5 sm:p-3 sm:p-4 holo-border">
            <div className="text-xs sm:text-sm text-primary/60 mb-2 font-mono">DESCRIPTION</div>
            <p className="text-xs sm:text-sm sm:text-base text-white/80 leading-relaxed">{quest.description}</p>
          </div>
        )}

        {/* Stats Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
          <div className="bg-black/40 border border-primary/20 rounded p-2 sm:p-3 hover:border-primary/50 transition-colors">
            <div className="flex items-center gap-1.5 text-primary/60 text-[10px] sm:text-xs mb-1 font-mono">
              <TrendingUp className="h-3 w-3" />
              PRIORITY
            </div>
            <div className="text-lg sm:text-2xl font-bold text-primary font-mono">{quest.priority}</div>
          </div>
          <div className="bg-black/40 border border-purple-500/20 rounded p-2 sm:p-3 hover:border-purple-500/50 transition-colors">
            <div className="flex items-center gap-1.5 text-purple-400/60 text-[10px] sm:text-xs mb-1 font-mono">
              <Target className="h-3 w-3" />
              IMPORTANCE
            </div>
            <div className="text-lg sm:text-2xl font-bold text-purple-400 font-mono">{quest.importance}</div>
          </div>
          <div className="bg-black/40 border border-blue-500/20 rounded p-2 sm:p-3 hover:border-blue-500/50 transition-colors">
            <div className="flex items-center gap-1.5 text-blue-400/60 text-[10px] sm:text-xs mb-1 font-mono">
              <TrendingUp className="h-3 w-3" />
              IMPACT
            </div>
            <div className="text-lg sm:text-2xl font-bold text-blue-400 font-mono">{quest.impact}</div>
          </div>
          {quest.difficulty && (
            <div className="bg-black/40 border border-orange-500/20 rounded p-2 sm:p-3 hover:border-orange-500/50 transition-colors">
              <div className="text-orange-400/60 text-[10px] sm:text-xs mb-1 font-mono">DIFFICULTY</div>
              <div className="text-lg sm:text-2xl font-bold text-orange-400 font-mono">{quest.difficulty}</div>
            </div>
          )}
        </div>

        {/* Milestones */}
        {quest.milestones && quest.milestones.length > 0 && (
          <div>
            <div className="text-xs sm:text-sm text-primary/60 mb-3 font-mono">MILESTONES</div>
            <div className="space-y-2 max-h-48 sm:max-h-60 overflow-y-auto">
              {quest.milestones.map((milestone) => (
                <div 
                  key={milestone.id} 
                  className={`flex items-center gap-2 sm:gap-3 bg-black/40 border rounded p-2 sm:p-3 ${
                    milestone.achieved 
                      ? 'border-green-500/30 bg-green-500/5' 
                      : 'border-primary/20 hover:border-primary/40'
                  } transition-colors`}
                >
                  <CheckCircle
                    className={`h-4 w-4 sm:h-5 sm:w-5 flex-shrink-0 ${
                      milestone.achieved ? 'text-green-400' : 'text-primary/40'
                    }`}
                  />
                  <div className="flex-1 min-w-0">
                    <div className={`text-xs sm:text-sm ${
                      milestone.achieved 
                        ? 'line-through text-white/40' 
                        : 'text-white'
                    }`}>
                      {milestone.description}
                    </div>
                    {milestone.target_date && (
                      <div className="text-[10px] sm:text-xs text-primary/40 mt-0.5 sm:mt-1 font-mono">
                        TARGET: {new Date(milestone.target_date).toLocaleDateString()}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* History */}
        {history && history.length > 0 && (
          <div>
            <div className="text-xs sm:text-sm text-primary/60 mb-3 font-mono">HISTORY</div>
            <div className="space-y-2 max-h-48 sm:max-h-60 overflow-y-auto">
              {history.map((event) => (
                <div key={event.id} className="bg-black/40 border border-primary/20 rounded p-2 sm:p-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs sm:text-sm font-medium text-primary font-mono">{event.event_type}</span>
                    <span className="text-[10px] sm:text-xs text-white/40 font-mono">
                      {new Date(event.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  {event.description && (
                    <p className="text-xs sm:text-sm text-white/70">{event.description}</p>
                  )}
                  {event.notes && (
                    <p className="text-xs sm:text-sm text-white/60 mt-1 italic">{event.notes}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}


        {/* Time & Links */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {(quest.effort_hours || quest.time_spent_hours) && (
            <div>
              <div className="text-xs sm:text-sm text-primary/60 mb-2 font-mono">TIME</div>
              <div className="space-y-1 text-xs sm:text-sm text-white/70">
                {quest.effort_hours && (
                  <div className="flex items-center gap-2">
                    <Clock className="h-3 w-3 sm:h-4 sm:w-4 text-primary/60" />
                    <span>EST: {quest.effort_hours}h</span>
                  </div>
                )}
                {quest.time_spent_hours && (
                  <div className="flex items-center gap-2">
                    <Clock className="h-3 w-3 sm:h-4 sm:w-4 text-primary/60" />
                    <span>SPENT: {quest.time_spent_hours}h</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {(quest.related_goal_id || quest.related_task_id) && (
            <div>
              <div className="text-xs sm:text-sm text-primary/60 mb-2 font-mono">LINKS</div>
              <div className="flex flex-wrap gap-2">
                {quest.related_goal_id && (
                  <Badge variant="outline" className="text-[10px] sm:text-xs border-primary/30 text-primary/80">
                    <LinkIcon className="h-2.5 w-2.5 mr-1" />
                    GOAL
                  </Badge>
                )}
                {quest.related_task_id && (
                  <Badge variant="outline" className="text-[10px] sm:text-xs border-primary/30 text-primary/80">
                    <LinkIcon className="h-2.5 w-2.5 mr-1" />
                    TASK
                  </Badge>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Completion Notes */}
        {quest.completion_notes && (
          <div className="bg-black/40 border border-yellow-500/30 rounded p-3 sm:p-4">
            <div className="text-xs sm:text-sm text-yellow-400/60 mb-2 font-mono">COMPLETION NOTES</div>
            <p className="text-xs sm:text-sm text-white/80">{quest.completion_notes}</p>
          </div>
        )}
      </div>
    </div>
  );
};
