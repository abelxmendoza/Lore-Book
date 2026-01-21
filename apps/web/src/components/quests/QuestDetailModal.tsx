import { useState } from 'react';
import { X, Clock, Target, TrendingUp, CheckCircle, Link as LinkIcon } from 'lucide-react';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Textarea } from '../ui/textarea';
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
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="text-white/60">Loading quest...</div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-black border border-border/60 rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-2xl font-bold text-white">{quest.title}</h2>
              <div className="flex items-center gap-2 mt-2">
                <Badge variant="outline" className="text-xs">
                  {quest.quest_type}
                </Badge>
                <Badge variant="outline" className="text-xs">
                  {quest.status}
                </Badge>
                {quest.category && (
                  <Badge variant="outline" className="text-xs">
                    {quest.category}
                  </Badge>
                )}
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Description */}
          {quest.description && (
            <div className="mb-6">
              <p className="text-white/80">{quest.description}</p>
            </div>
          )}

          {/* Progress Section */}
          <div className="mb-6">
            <div className="flex items-center justify-between text-sm text-white/60 mb-2">
              <span>Progress</span>
              <span>{Math.round(quest.progress_percentage)}%</span>
            </div>
            <div className="w-full bg-black/60 rounded-full h-3 mb-4">
              <div
                className="bg-primary h-3 rounded-full transition-all"
                style={{ width: `${quest.progress_percentage}%` }}
              />
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => updateProgress.mutate({ questId, progress: Math.max(0, quest.progress_percentage - 10) })}
              >
                -10%
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => updateProgress.mutate({ questId, progress: Math.min(100, quest.progress_percentage + 10) })}
              >
                +10%
              </Button>
            </div>
          </div>

          {/* Ranking Metrics */}
          <div className="grid grid-cols-4 gap-4 mb-6">
            <div className="bg-black/40 rounded-lg p-3">
              <div className="flex items-center gap-2 text-white/60 text-sm mb-1">
                <TrendingUp className="h-4 w-4" />
                Priority
              </div>
              <div className="text-2xl font-bold text-white">{quest.priority}</div>
            </div>
            <div className="bg-black/40 rounded-lg p-3">
              <div className="flex items-center gap-2 text-white/60 text-sm mb-1">
                <Target className="h-4 w-4" />
                Importance
              </div>
              <div className="text-2xl font-bold text-white">{quest.importance}</div>
            </div>
            <div className="bg-black/40 rounded-lg p-3">
              <div className="flex items-center gap-2 text-white/60 text-sm mb-1">
                <TrendingUp className="h-4 w-4" />
                Impact
              </div>
              <div className="text-2xl font-bold text-white">{quest.impact}</div>
            </div>
            {quest.difficulty && (
              <div className="bg-black/40 rounded-lg p-3">
                <div className="flex items-center gap-2 text-white/60 text-sm mb-1">
                  Difficulty
                </div>
                <div className="text-2xl font-bold text-white">{quest.difficulty}</div>
              </div>
            )}
          </div>

          {/* Milestones */}
          {quest.milestones && quest.milestones.length > 0 && (
            <div className="mb-6">
              <h3 className="text-lg font-semibold text-white mb-3">Milestones</h3>
              <div className="space-y-2">
                {quest.milestones.map((milestone) => (
                  <div key={milestone.id} className="flex items-center gap-2 bg-black/40 rounded-lg p-3">
                    <CheckCircle
                      className={`h-5 w-5 ${milestone.achieved ? 'text-green-400' : 'text-white/40'}`}
                    />
                    <div className="flex-1">
                      <div className={`text-white ${milestone.achieved ? 'line-through text-white/60' : ''}`}>
                        {milestone.description}
                      </div>
                      {milestone.target_date && (
                        <div className="text-xs text-white/40 mt-1">
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
            <div className="mb-6">
              <h3 className="text-lg font-semibold text-white mb-3">History</h3>
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {history.map((event) => (
                  <div key={event.id} className="bg-black/40 rounded-lg p-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-white">{event.event_type}</span>
                      <span className="text-xs text-white/40">
                        {new Date(event.created_at).toLocaleDateString()}
                      </span>
                    </div>
                    {event.description && (
                      <p className="text-sm text-white/70">{event.description}</p>
                    )}
                    {event.notes && (
                      <p className="text-sm text-white/60 mt-1 italic">{event.notes}</p>
                    )}
                    {event.progress_before !== undefined && event.progress_after !== undefined && (
                      <div className="text-xs text-white/50 mt-1">
                        Progress: {event.progress_before}% → {event.progress_after}%
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Reflection Section */}
          <div className="mb-6">
            <h3 className="text-lg font-semibold text-white mb-3">Add Reflection</h3>
            <Textarea
              value={reflectionText}
              onChange={(e) => setReflectionText(e.target.value)}
              placeholder="What did you learn? What would you do differently?"
              className="bg-black/40 border-border/60 mb-2"
              rows={3}
            />
            <Button onClick={handleAddReflection} disabled={!reflectionText.trim() || addReflection.isPending}>
              Add Reflection
            </Button>
          </div>

          {/* Links */}
          {(quest.related_goal_id || quest.related_task_id) && (
            <div className="mb-6">
              <h3 className="text-lg font-semibold text-white mb-3">Related</h3>
              <div className="flex gap-2">
                {quest.related_goal_id && (
                  <Badge variant="outline" className="text-xs">
                    <LinkIcon className="h-3 w-3 mr-1" />
                    Goal Linked
                  </Badge>
                )}
                {quest.related_task_id && (
                  <Badge variant="outline" className="text-xs">
                    <LinkIcon className="h-3 w-3 mr-1" />
                    Task Linked
                  </Badge>
                )}
              </div>
            </div>
          )}

          {/* Time Tracking */}
          {(quest.effort_hours || quest.time_spent_hours) && (
            <div className="mb-6">
              <h3 className="text-lg font-semibold text-white mb-3">Time</h3>
              <div className="flex items-center gap-4 text-sm text-white/70">
                {quest.effort_hours && (
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4" />
                    <span>Estimated: {quest.effort_hours}h</span>
                  </div>
                )}
                {quest.time_spent_hours && (
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4" />
                    <span>Spent: {quest.time_spent_hours}h</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Completion Notes */}
          {quest.completion_notes && (
            <div className="mb-6">
              <h3 className="text-lg font-semibold text-white mb-3">Completion Notes</h3>
              <p className="text-white/80 bg-black/40 rounded-lg p-3">{quest.completion_notes}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
