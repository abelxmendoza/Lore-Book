import { useState } from 'react';
import { Clock, Target, TrendingUp, CheckCircle, Link as LinkIcon, Sparkles } from 'lucide-react';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Textarea } from '../ui/textarea';
import { Modal } from '../ui/modal';
import { useQuest, useQuestHistory, useUpdateQuestProgress, useAddQuestReflection } from '../../hooks/useQuests';
import type { Quest } from '../../types/quest';

interface QuestDetailModalProps {
  questId: string;
  onClose: () => void;
}

export const QuestDetailModal = ({ questId, onClose }: QuestDetailModalProps) => {
  const [reflectionText, setReflectionText] = useState('');
  const { data: quest, isLoading } = useQuest(questId);
  const { data: history } = useQuestHistory(questId);
  const updateProgress = useUpdateQuestProgress();
  const addReflection = useAddQuestReflection();

  const handleAddReflection = async () => {
    if (!reflectionText.trim()) return;
    await addReflection.mutateAsync({ questId, reflection: reflectionText });
    setReflectionText('');
  };

  if (isLoading || !quest) {
    return (
      <Modal isOpen={true} onClose={onClose} title="Quest Details" maxWidth="lg">
        <div className="flex items-center justify-center py-12">
          <div className="text-white/60">Loading quest...</div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal isOpen={true} onClose={onClose} title={quest.title} maxWidth="lg">
      <div className="space-y-3 sm:space-y-4 max-h-[calc(600px-100px)] sm:max-h-[calc(600px-120px)] overflow-y-auto">
        {/* Badges */}
        <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
          <Badge variant="outline" className="text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5">
            {quest.quest_type}
          </Badge>
          <Badge variant="outline" className="text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5">
            {quest.status}
          </Badge>
          {quest.category && (
            <Badge variant="outline" className="text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5">
              {quest.category}
            </Badge>
          )}
          {quest.source === 'extracted' && (
            <Badge variant="outline" className="text-[10px] sm:text-xs text-primary/80 bg-primary/10 border-primary/20 flex items-center gap-1 px-1.5 sm:px-2 py-0.5">
              <Sparkles className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
              Auto-detected
            </Badge>
          )}
        </div>

        {/* Description */}
        {quest.description && (
          <div>
            <p className="text-sm sm:text-base text-white/80 leading-relaxed">{quest.description}</p>
          </div>
        )}

        {/* Progress Section */}
        <div>
          <div className="flex items-center justify-between text-xs sm:text-sm text-white/60 mb-2">
            <span>Progress</span>
            <span>{Math.round(quest.progress_percentage)}%</span>
          </div>
          <div className="w-full bg-black/60 rounded-full h-2 sm:h-3 mb-3 sm:mb-4">
            <div
              className="bg-primary h-2 sm:h-3 rounded-full transition-all"
              style={{ width: `${quest.progress_percentage}%` }}
            />
          </div>
          <div className="flex gap-1.5 sm:gap-2">
            <Button
              variant="outline"
              size="sm"
              className="text-xs px-2 sm:px-3 h-7 sm:h-8"
              onClick={() => updateProgress.mutate({ questId, progress: Math.max(0, quest.progress_percentage - 10) })}
            >
              -10%
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="text-xs px-2 sm:px-3 h-7 sm:h-8"
              onClick={() => updateProgress.mutate({ questId, progress: Math.min(100, quest.progress_percentage + 10) })}
            >
              +10%
            </Button>
          </div>
        </div>

        {/* Ranking Metrics */}
        <div className="grid grid-cols-2 gap-2 sm:gap-3">
          <div className="bg-black/40 rounded-lg p-2 sm:p-3">
            <div className="flex items-center gap-1 sm:gap-2 text-white/60 text-[10px] sm:text-xs mb-1">
              <TrendingUp className="h-3 w-3 sm:h-4 sm:w-4" />
              Priority
            </div>
            <div className="text-xl sm:text-2xl font-bold text-white">{quest.priority}</div>
          </div>
          <div className="bg-black/40 rounded-lg p-2 sm:p-3">
            <div className="flex items-center gap-1 sm:gap-2 text-white/60 text-[10px] sm:text-xs mb-1">
              <Target className="h-3 w-3 sm:h-4 sm:w-4" />
              Importance
            </div>
            <div className="text-xl sm:text-2xl font-bold text-white">{quest.importance}</div>
          </div>
          <div className="bg-black/40 rounded-lg p-2 sm:p-3">
            <div className="flex items-center gap-1 sm:gap-2 text-white/60 text-[10px] sm:text-xs mb-1">
              <TrendingUp className="h-3 w-3 sm:h-4 sm:w-4" />
              Impact
            </div>
            <div className="text-xl sm:text-2xl font-bold text-white">{quest.impact}</div>
          </div>
          {quest.difficulty && (
            <div className="bg-black/40 rounded-lg p-2 sm:p-3">
              <div className="flex items-center gap-1 sm:gap-2 text-white/60 text-[10px] sm:text-xs mb-1">
                Difficulty
              </div>
              <div className="text-xl sm:text-2xl font-bold text-white">{quest.difficulty}</div>
            </div>
          )}
        </div>

        {/* Milestones */}
        {quest.milestones && quest.milestones.length > 0 && (
          <div>
            <h3 className="text-sm sm:text-base font-semibold text-white mb-2 sm:mb-3">Milestones</h3>
            <div className="space-y-1.5 sm:space-y-2 max-h-32 sm:max-h-40 overflow-y-auto">
              {quest.milestones.map((milestone) => (
                <div key={milestone.id} className="flex items-center gap-1.5 sm:gap-2 bg-black/40 rounded-lg p-2 sm:p-3">
                  <CheckCircle
                    className={`h-4 w-4 sm:h-5 sm:w-5 flex-shrink-0 ${milestone.achieved ? 'text-green-400' : 'text-white/40'}`}
                  />
                  <div className="flex-1 min-w-0">
                    <div className={`text-xs sm:text-sm text-white ${milestone.achieved ? 'line-through text-white/60' : ''}`}>
                      {milestone.description}
                    </div>
                    {milestone.target_date && (
                      <div className="text-[10px] sm:text-xs text-white/40 mt-0.5 sm:mt-1">
                        Target: {new Date(milestone.target_date).toLocaleDateString()}
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
            <h3 className="text-sm sm:text-base font-semibold text-white mb-2 sm:mb-3">History</h3>
            <div className="space-y-1.5 sm:space-y-2 max-h-32 sm:max-h-40 overflow-y-auto">
              {history.map((event) => (
                <div key={event.id} className="bg-black/40 rounded-lg p-2 sm:p-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs sm:text-sm font-medium text-white">{event.event_type}</span>
                    <span className="text-[10px] sm:text-xs text-white/40">
                      {new Date(event.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  {event.description && (
                    <p className="text-xs sm:text-sm text-white/70">{event.description}</p>
                  )}
                  {event.notes && (
                    <p className="text-xs sm:text-sm text-white/60 mt-0.5 sm:mt-1 italic">{event.notes}</p>
                  )}
                  {event.progress_before !== undefined && event.progress_after !== undefined && (
                    <div className="text-[10px] sm:text-xs text-white/50 mt-0.5 sm:mt-1">
                      Progress: {event.progress_before}% → {event.progress_after}%
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Reflection Section */}
        <div>
          <h3 className="text-sm sm:text-base font-semibold text-white mb-2 sm:mb-3">Add Reflection</h3>
          <Textarea
            value={reflectionText}
            onChange={(e) => setReflectionText(e.target.value)}
            placeholder="What did you learn? What would you do differently?"
            className="bg-black/40 border-border/60 mb-2 text-xs sm:text-sm"
            rows={2}
          />
          <Button 
            onClick={handleAddReflection} 
            disabled={!reflectionText.trim() || addReflection.isPending}
            className="w-full sm:w-auto text-xs sm:text-sm h-8 sm:h-9"
          >
            Add Reflection
          </Button>
        </div>

        {/* Links */}
        {(quest.related_goal_id || quest.related_task_id) && (
          <div>
            <h3 className="text-sm sm:text-base font-semibold text-white mb-2 sm:mb-3">Related</h3>
            <div className="flex gap-1.5 sm:gap-2 flex-wrap">
              {quest.related_goal_id && (
                <Badge variant="outline" className="text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5">
                  <LinkIcon className="h-2.5 w-2.5 sm:h-3 sm:w-3 mr-0.5 sm:mr-1" />
                  Goal Linked
                </Badge>
              )}
              {quest.related_task_id && (
                <Badge variant="outline" className="text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5">
                  <LinkIcon className="h-2.5 w-2.5 sm:h-3 sm:w-3 mr-0.5 sm:mr-1" />
                  Task Linked
                </Badge>
              )}
            </div>
          </div>
        )}

        {/* Time Tracking */}
        {(quest.effort_hours || quest.time_spent_hours) && (
          <div>
            <h3 className="text-sm sm:text-base font-semibold text-white mb-2 sm:mb-3">Time</h3>
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-4 text-xs sm:text-sm text-white/70">
              {quest.effort_hours && (
                <div className="flex items-center gap-1.5 sm:gap-2">
                  <Clock className="h-3 w-3 sm:h-4 sm:w-4" />
                  <span>Estimated: {quest.effort_hours}h</span>
                </div>
              )}
              {quest.time_spent_hours && (
                <div className="flex items-center gap-1.5 sm:gap-2">
                  <Clock className="h-3 w-3 sm:h-4 sm:w-4" />
                  <span>Spent: {quest.time_spent_hours}h</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Completion Notes */}
        {quest.completion_notes && (
          <div>
            <h3 className="text-sm sm:text-base font-semibold text-white mb-2 sm:mb-3">Completion Notes</h3>
            <p className="text-xs sm:text-sm text-white/80 bg-black/40 rounded-lg p-2 sm:p-3">{quest.completion_notes}</p>
          </div>
        )}
      </div>
    </Modal>
  );
};
