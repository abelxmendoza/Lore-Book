import { ArrowRight, CheckCircle, Clock, FileText, Flag, History, Link as LinkIcon, ListChecks, MessageSquare, Pause, Play, Sparkles, Target, TrendingUp, X } from 'lucide-react';
import { useState } from 'react';

import { useAbandonQuest, useCompleteQuest, usePauseQuest, useQuest, useQuestHistory, useStartQuest, useUpdateQuestProgress } from '../../hooks/useQuests';
import { openChatWithFocus } from '../../lib/openChatWithFocus';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';

interface QuestDetailPanelProps {
  questId: string | null;
  onClose?: () => void;
  /** Full-screen mobile overlay — single header with safe-area padding */
  mobile?: boolean;
  /** Inside MobileBottomSheet — drop side border */
  embedded?: boolean;
}

type QuestDetailTab = 'overview' | 'progress' | 'activity' | 'focus-chat';

const QUEST_DETAIL_TABS: Array<{
  id: QuestDetailTab;
  label: string;
  icon: typeof Target;
}> = [
  { id: 'overview', label: 'Overview', icon: FileText },
  { id: 'progress', label: 'Progress', icon: ListChecks },
  { id: 'activity', label: 'Activity', icon: History },
  { id: 'focus-chat', label: 'Focus Chat', icon: MessageSquare },
];

export const QuestDetailPanel = ({ questId, onClose, mobile = false, embedded = false }: QuestDetailPanelProps) => {
  const [activeTab, setActiveTab] = useState<QuestDetailTab>('overview');
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

  const openQuestInMainChat = () => {
    onClose?.();
    openChatWithFocus({
      entityId: quest.id,
      entityName: quest.title,
      entityType: 'quest',
      sourceSurface: 'quests',
      sourceLabel: 'Quest Log',
      knowledgeScope: 'this quest, its current status, progress, milestones, motivation, blockers, history, and connected evidence',
      initialPrompt:
        `Let’s focus on my quest “${quest.title}.” Start by giving me a grounded update on where it stands ` +
        `(${Math.round(quest.progress_percentage)}% complete, ${quest.status}), what progress or blockers LoreBook can support, ` +
        'and the most useful next step. Clearly separate recorded details from suggestions, then invite me to update the quest.',
      autoSubmit: true,
      startNewThread: true,
    });
  };

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
              className={`font-semibold text-white leading-snug break-words ${
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

      </div>

      <nav
        aria-label="Quest details"
        role="tablist"
        className="flex shrink-0 gap-1 overflow-x-auto border-b border-white/10 bg-black/80 px-2 pt-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:px-4"
      >
        {QUEST_DETAIL_TABS.map((tab) => {
          const Icon = tab.icon;
          const selected = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={selected}
              data-testid={`quest-detail-tab-${tab.id}`}
              onClick={() => setActiveTab(tab.id)}
              className={`flex min-h-10 shrink-0 items-center gap-1.5 rounded-t-lg border-b-2 px-3 py-2 text-xs font-medium transition-colors touch-manipulation sm:text-sm ${
                selected
                  ? 'border-amber-400 bg-amber-500/10 text-amber-200'
                  : 'border-transparent text-white/55 hover:bg-white/5 hover:text-white'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {tab.label}
            </button>
          );
        })}
      </nav>

      <div
        className={`flex-1 overflow-y-auto overflow-x-hidden p-4 sm:p-5 space-y-4 min-h-0 ${
          mobile ? 'pb-[max(1rem,env(safe-area-inset-bottom))]' : ''
        }`}
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        {activeTab === 'progress' && (
          <div className="space-y-4">
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.06] p-4">
              <div className="mb-2 flex items-center justify-between text-sm text-white/70">
                <span className="font-medium">Quest progress</span>
                <span className="font-semibold text-amber-300">{Math.round(quest.progress_percentage)}%</span>
              </div>
              <div className="relative h-2.5 w-full overflow-hidden rounded-full border border-white/10 bg-black/50">
                <div
                  className="absolute inset-y-0 left-0 bg-gradient-to-r from-amber-500/80 to-amber-400/60 transition-all duration-500"
                  style={{ width: `${quest.progress_percentage}%` }}
                />
              </div>
              <div className="mt-3 flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { void updateProgress.mutateAsync({ questId, progress: Math.max(0, quest.progress_percentage - 10) }).catch(() => {}); }}
                  className="min-h-[44px] flex-1 border-primary/30 px-2 text-xs text-primary hover:border-primary/50 hover:bg-primary/20 sm:h-9 sm:min-h-0 sm:flex-none"
                >
                  -10%
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { void updateProgress.mutateAsync({ questId, progress: Math.min(100, quest.progress_percentage + 10) }).catch(() => {}); }}
                  className="min-h-[44px] flex-1 border-primary/30 px-2 text-xs text-primary hover:border-primary/50 hover:bg-primary/20 sm:h-9 sm:min-h-0 sm:flex-none"
                >
                  +10%
                </Button>
              </div>
              <div className={`mt-3 ${mobile ? 'grid grid-cols-2 gap-2' : 'flex flex-wrap gap-2'}`}>
                {canResume && (
                  <Button variant="outline" size="sm" disabled={isMutatingStatus} onClick={() => { void startQuest.mutateAsync(questId); }} className={actionButtonClass}>
                    <Play className="mr-1 h-3.5 w-3.5" /> Resume
                  </Button>
                )}
                {canPause && (
                  <Button variant="outline" size="sm" disabled={isMutatingStatus} onClick={() => { void pauseQuest.mutateAsync(questId); }} className={actionButtonClass}>
                    <Pause className="mr-1 h-3.5 w-3.5" /> Pause
                  </Button>
                )}
                {canComplete && (
                  <Button variant="outline" size="sm" disabled={isMutatingStatus} onClick={() => { void completeQuest.mutateAsync({ questId }); }} className={`${actionButtonClass} border-green-500/30 text-green-300 hover:border-green-500/50 hover:bg-green-500/10`}>
                    <CheckCircle className="mr-1 h-3.5 w-3.5" /> Complete
                  </Button>
                )}
                {canAbandon && (
                  <Button variant="outline" size="sm" disabled={isMutatingStatus} onClick={() => { void abandonQuest.mutateAsync({ questId, reason: 'Marked from quest details' }); }} className="min-h-[44px] flex-1 border-red-500/30 px-2 text-xs text-red-300 hover:border-red-500/50 hover:bg-red-500/10 sm:h-9 sm:min-h-0 sm:flex-none">
                    <Flag className="mr-1 h-3.5 w-3.5" /> Abandon
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'focus-chat' && (
          <div className="rounded-2xl border border-amber-500/30 bg-gradient-to-br from-amber-500/15 via-amber-500/[0.06] to-transparent p-4 sm:p-5">
            <div className="mb-4 flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/20 text-amber-300">
                <MessageSquare className="h-5 w-5" />
              </span>
              <div>
                <h3 className="font-semibold text-white">Focus this quest in main chat</h3>
                <p className="mt-1 text-xs leading-relaxed text-white/60 sm:text-sm">
                  LoreBook responds first with a grounded status update, supported progress, possible blockers, and a useful next step.
                </p>
              </div>
            </div>
            <div className="mb-4 rounded-xl border border-white/10 bg-black/30 p-3 text-xs text-white/60">
              <p><span className="text-white/40">Focused quest:</span> {quest.title}</p>
              <p className="mt-1"><span className="text-white/40">Current state:</span> {Math.round(quest.progress_percentage)}% · {quest.status}</p>
            </div>
            <Button
              type="button"
              onClick={openQuestInMainChat}
              data-testid="quest-open-focus-chat"
              className="group min-h-11 w-full bg-amber-500 text-black hover:bg-amber-400"
            >
              Open focused chat
              <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Button>
            <p className="mt-3 text-center text-[11px] text-white/40">Opens a fresh focused thread. Nothing is changed until you confirm an update.</p>
          </div>
        )}

        {activeTab === 'overview' && quest.description && (
          <div className="bg-black/30 border border-white/10 rounded-xl p-4">
            <div className="text-xs text-white/45 mb-2 uppercase tracking-wide">Description</div>
            <p className="text-sm text-white/80 leading-relaxed">{quest.description}</p>
          </div>
        )}

        {activeTab === 'overview' && quest.tags && quest.tags.length > 0 && (
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

        {activeTab === 'overview' && quest.motivation_notes && (
          <div className="bg-black/30 border border-emerald-500/20 rounded p-3 sm:p-4">
            <div className="text-xs sm:text-sm text-emerald-400/60 mb-2 font-mono">WHY THIS MATTERS</div>
            <p className="text-xs sm:text-sm text-white/75 leading-relaxed">{quest.motivation_notes}</p>
          </div>
        )}

        {activeTab === 'overview' && quest.reward_description && (
          <div className="bg-black/30 border border-yellow-500/20 rounded p-3 sm:p-4">
            <div className="text-xs sm:text-sm text-yellow-400/60 mb-2 font-mono">REWARD</div>
            <p className="text-xs sm:text-sm text-white/75 leading-relaxed">{quest.reward_description}</p>
          </div>
        )}

        {/* Stats Grid */}
        {activeTab === 'overview' && <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
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
        </div>}

        {/* Milestones */}
        {activeTab === 'progress' && quest.milestones && quest.milestones.length > 0 && (
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
        {activeTab === 'activity' && (historyLoading || (history && history.length > 0)) && (
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

        {activeTab === 'activity' && !historyLoading && (!history || history.length === 0) && (
          <div className="flex min-h-[220px] flex-col items-center justify-center rounded-xl border border-dashed border-white/10 bg-black/20 px-5 text-center">
            <History className="mb-3 h-8 w-8 text-white/20" />
            <p className="text-sm font-medium text-white/70">No activity recorded yet</p>
            <p className="mt-1 max-w-xs text-xs leading-relaxed text-white/45">Progress changes and quest status updates will appear here.</p>
          </div>
        )}


        {/* Time & Links */}
        {activeTab === 'overview' && <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
        </div>}

        {/* Completion Notes */}
        {activeTab === 'overview' && quest.completion_notes && (
          <div className="bg-black/40 border border-yellow-500/30 rounded p-3 sm:p-4">
            <div className="text-xs sm:text-sm text-yellow-400/60 mb-2 font-mono">COMPLETION NOTES</div>
            <p className="text-xs sm:text-sm text-white/80">{quest.completion_notes}</p>
          </div>
        )}
      </div>
    </div>
  );
};
