import { Clock, Target, TrendingUp, CheckCircle, Link as LinkIcon, Sparkles, X, Pause, Play, Flag } from 'lucide-react';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { useAbandonQuest, useCompleteQuest, usePauseQuest, useQuest, useQuestHistory, useStartQuest, useUpdateQuestProgress } from '../../hooks/useQuests';
import type { Quest } from '../../types/quest';

interface QuestDetailPanelProps {
  questId: string | null;
  onClose?: () => void;
  /** Full-screen mobile overlay — single header with safe-area padding */
  mobile?: boolean;
  /** Inside MobileBottomSheet — drop side border */
  embedded?: boolean;
}

export const QuestDetailPanel = ({ questId, onClose, mobile = false, embedded = false }: QuestDetailPanelProps) => {
  const { data: quest, isLoading } = useQuest(questId || '');
  const { data: history, isLoading: historyLoading } = useQuestHistory(questId || '');
  const updateProgress = useUpdateQuestProgress();
  const startQuest = useStartQuest();
  const pauseQuest = usePauseQuest();
  const completeQuest = useCompleteQuest();
  const abandonQuest = useAbandonQuest();

  if (!questId) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-black/30 border-l border-white/10 min-h-0">
        <div className="text-center p-6 sm:p-8 max-w-xs">
          <Target className="h-10 w-10 text-white/15 mx-auto mb-4" />
          <p className="text-sm font-medium text-white/70 mb-1">Select a quest</p>
          <p className="text-xs text-white/45">Choose a quest from the list to view details and update progress.</p>
        </div>
      </div>
    );
  }

  if (isLoading || !quest) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-black/30 border-l border-white/10 min-h-0">
        <p className="text-sm text-white/50 animate-pulse">Loading quest…</p>
      </div>
    );
  }

  const getStatusDotColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-400';
      case 'completed': return 'bg-yellow-400';
      case 'paused': return 'bg-orange-400';
      case 'abandoned': return 'bg-red-400';
      default: return 'bg-primary';
    }
  };

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

  const canResume = quest.status === 'paused';
  const canPause = quest.status === 'active';
  const canComplete = quest.status !== 'completed' && quest.status !== 'abandoned';
  const canAbandon = quest.status !== 'completed' && quest.status !== 'abandoned';
  const isMutatingStatus = startQuest.isPending || pauseQuest.isPending || completeQuest.isPending || abandonQuest.isPending;

  const actionButtonClass =
    'text-xs px-2 h-10 sm:h-9 border-primary/30 text-primary hover:bg-primary/20 hover:border-primary/50 min-h-[44px] sm:min-h-0 flex-1 sm:flex-none';

  return (
    <div
      className={`h-full w-full bg-black/30 flex flex-col min-h-0 overflow-hidden ${
        embedded ? '' : 'border-l border-white/10'
      } ${mobile ? 'pb-[max(0px,env(safe-area-inset-bottom))]' : ''}`}
    >
      <div
        className={`flex-shrink-0 sticky top-0 z-10 bg-black/90 border-b border-white/10 backdrop-blur-md ${
          mobile ? (embedded ? 'p-3 pt-1' : 'p-4 pt-3') : 'p-4 sm:p-5'
        }`}
      >
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <div className={`h-2 w-2 rounded-full ${getStatusDotColor(quest.status)} animate-pulse`} />
              <Badge
                variant="outline"
                className={`text-[10px] sm:text-xs px-2 py-0.5 border ${getTypeColor(quest.quest_type)} bg-black/60`}
              >
                {quest.quest_type}
              </Badge>
              <Badge
                variant="outline"
                className={`text-[10px] sm:text-xs px-2 py-0.5 border capitalize bg-black/60 ${getStatusColor(quest.status)}`}
              >
                {quest.status}
              </Badge>
              {quest.source === 'extracted' && (
                <Badge variant="outline" className="text-[10px] sm:text-xs text-primary/80 bg-primary/10 border-primary/30 flex items-center gap-1">
                  <Sparkles className="h-2.5 w-2.5" />
                  Auto-detected
                </Badge>
              )}
            </div>
            <h2
              className={`font-semibold text-white leading-snug ${
                mobile ? 'text-lg' : 'text-lg sm:text-xl'
              }`}
            >
              {quest.title}
            </h2>
          </div>
          {onClose && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="text-white/60 hover:text-white hover:bg-primary/20 h-10 w-10 p-0 flex-shrink-0"
              aria-label="Close quest details"
            >
              <X className="h-5 w-5" />
            </Button>
          )}
        </div>

        <div className="relative">
          <div className="flex items-center justify-between text-xs text-white/55 mb-2">
            <span>Progress</span>
            <span>{Math.round(quest.progress_percentage)}%</span>
          </div>
          <div className="relative w-full h-2 bg-black/50 rounded-full overflow-hidden border border-white/10">
            <div
              className="absolute inset-y-0 left-0 bg-gradient-to-r from-amber-500/80 to-amber-400/60 transition-all duration-500"
              style={{ width: `${quest.progress_percentage}%` }}
            />
          </div>
          <div className="flex gap-2 mt-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => { void updateProgress.mutateAsync({ questId, progress: Math.max(0, quest.progress_percentage - 10) }).catch(() => {}); }}
              className="text-xs px-2 flex-1 sm:flex-none min-h-[44px] sm:min-h-0 sm:h-9 border-primary/30 text-primary hover:bg-primary/20 hover:border-primary/50"
            >
              -10%
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => { void updateProgress.mutateAsync({ questId, progress: Math.min(100, quest.progress_percentage + 10) }).catch(() => {}); }}
              className="text-xs px-2 flex-1 sm:flex-none min-h-[44px] sm:min-h-0 sm:h-9 border-primary/30 text-primary hover:bg-primary/20 hover:border-primary/50"
            >
              +10%
            </Button>
          </div>
          <div className={`mt-3 ${mobile ? 'grid grid-cols-2 gap-2' : 'flex flex-wrap gap-2'}`}>
            {canResume && (
              <Button
                variant="outline"
                size="sm"
                disabled={isMutatingStatus}
                onClick={() => { void startQuest.mutateAsync(questId); }}
                className={actionButtonClass}
              >
                <Play className="h-3.5 w-3.5 mr-1" />
                Resume
              </Button>
            )}
            {canPause && (
              <Button
                variant="outline"
                size="sm"
                disabled={isMutatingStatus}
                onClick={() => { void pauseQuest.mutateAsync(questId); }}
                className={actionButtonClass}
              >
                <Pause className="h-3.5 w-3.5 mr-1" />
                Pause
              </Button>
            )}
            {canComplete && (
              <Button
                variant="outline"
                size="sm"
                disabled={isMutatingStatus}
                onClick={() => { void completeQuest.mutateAsync({ questId }); }}
                className={`${actionButtonClass} border-green-500/30 text-green-300 hover:bg-green-500/10 hover:border-green-500/50`}
              >
                <CheckCircle className="h-3.5 w-3.5 mr-1" />
                Complete
              </Button>
            )}
            {canAbandon && (
              <Button
                variant="outline"
                size="sm"
                disabled={isMutatingStatus}
                onClick={() => { void abandonQuest.mutateAsync({ questId, reason: 'Marked from quest details' }); }}
                className="text-xs px-2 h-10 sm:h-9 border-red-500/30 text-red-300 hover:bg-red-500/10 hover:border-red-500/50 min-h-[44px] sm:min-h-0 flex-1 sm:flex-none"
              >
                <Flag className="h-3.5 w-3.5 mr-1" />
                Abandon
              </Button>
            )}
          </div>
        </div>
      </div>

      <div
        className={`flex-1 overflow-y-auto overflow-x-hidden p-4 sm:p-5 space-y-4 min-h-0 ${
          mobile ? 'pb-[max(1rem,env(safe-area-inset-bottom))]' : ''
        }`}
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        {quest.description && (
          <div className="bg-black/30 border border-white/10 rounded-xl p-4">
            <div className="text-xs text-white/45 mb-2 uppercase tracking-wide">Description</div>
            <p className="text-sm text-white/80 leading-relaxed">{quest.description}</p>
          </div>
        )}

        {quest.tags && quest.tags.length > 0 && (
          <div>
            <div className="text-xs sm:text-sm text-primary/60 mb-2 font-mono">TAGS</div>
            <div className="flex flex-wrap gap-1.5">
              {quest.tags.map((tag) => (
                <Badge key={tag} variant="outline" className="text-[10px] sm:text-xs border-primary/25 text-primary/80">
                  {tag}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {quest.motivation_notes && (
          <div className="bg-black/30 border border-emerald-500/20 rounded p-3 sm:p-4">
            <div className="text-xs sm:text-sm text-emerald-400/60 mb-2 font-mono">WHY THIS MATTERS</div>
            <p className="text-xs sm:text-sm text-white/75 leading-relaxed">{quest.motivation_notes}</p>
          </div>
        )}

        {quest.reward_description && (
          <div className="bg-black/30 border border-yellow-500/20 rounded p-3 sm:p-4">
            <div className="text-xs sm:text-sm text-yellow-400/60 mb-2 font-mono">REWARD</div>
            <p className="text-xs sm:text-sm text-white/75 leading-relaxed">{quest.reward_description}</p>
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
            <div className="space-y-2">
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
        {(historyLoading || (history && history.length > 0)) && (
          <div>
            <div className="text-xs sm:text-sm text-primary/60 mb-3 font-mono">HISTORY</div>
            {historyLoading ? (
              <p className="text-xs text-white/40 font-mono">Loading history…</p>
            ) : (
              <div className="space-y-2">
                {history!.map((event) => (
                  <div key={event.id} className="bg-black/40 border border-primary/20 rounded p-2 sm:p-3">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <span className="text-xs sm:text-sm font-medium text-primary font-mono uppercase">
                        {event.event_type.replace(/_/g, ' ')}
                      </span>
                      <span className="text-[10px] sm:text-xs text-white/40 font-mono shrink-0">
                        {new Date(event.created_at).toLocaleDateString()}
                      </span>
                    </div>
                    {event.description && (
                      <p className="text-xs sm:text-sm text-white/70">{event.description}</p>
                    )}
                    {event.notes && (
                      <p className="text-xs sm:text-sm text-white/60 mt-1 italic">{event.notes}</p>
                    )}
                    {event.progress_before !== undefined && event.progress_after !== undefined && (
                      <div className="text-[10px] sm:text-xs text-white/50 mt-1 font-mono">
                        Progress: {event.progress_before}% → {event.progress_after}%
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
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
