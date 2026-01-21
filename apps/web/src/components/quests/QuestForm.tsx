import { useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { Select } from '../ui/select';
import { useCreateQuest, useUpdateQuest } from '../../hooks/useQuests';
import type { Quest, QuestType } from '../../types/quest';

interface QuestFormProps {
  quest?: Quest;
  onClose: () => void;
  onSuccess?: () => void;
}

export const QuestForm = ({ quest, onClose, onSuccess }: QuestFormProps) => {
  const [title, setTitle] = useState(quest?.title || '');
  const [description, setDescription] = useState(quest?.description || '');
  const [questType, setQuestType] = useState<QuestType>(quest?.quest_type || 'main');
  const [priority, setPriority] = useState(quest?.priority || 5);
  const [importance, setImportance] = useState(quest?.importance || 5);
  const [impact, setImpact] = useState(quest?.impact || 5);
  const [difficulty, setDifficulty] = useState(quest?.difficulty || 5);
  const [effortHours, setEffortHours] = useState(quest?.effort_hours?.toString() || '');
  const [category, setCategory] = useState(quest?.category || '');
  const [tags, setTags] = useState(quest?.tags?.join(', ') || '');
  const [rewardDescription, setRewardDescription] = useState(quest?.reward_description || '');
  const [motivationNotes, setMotivationNotes] = useState(quest?.motivation_notes || '');

  const createQuest = useCreateQuest();
  const updateQuest = useUpdateQuest();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const questData = {
      title,
      description,
      quest_type: questType,
      priority,
      importance,
      impact,
      difficulty,
      effort_hours: effortHours ? parseFloat(effortHours) : undefined,
      category: category || undefined,
      tags: tags.split(',').map(t => t.trim()).filter(t => t.length > 0),
      reward_description: rewardDescription || undefined,
      motivation_notes: motivationNotes || undefined,
    };

    try {
      if (quest) {
        await updateQuest.mutateAsync({ questId: quest.id, updates: questData });
      } else {
        await createQuest.mutateAsync(questData);
      }
      onSuccess?.();
      onClose();
    } catch (error) {
      console.error('Failed to save quest:', error);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-black border border-border/60 rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-white">{quest ? 'Edit Quest' : 'Create Quest'}</h2>
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="title">Title *</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                className="bg-black/40 border-border/60"
              />
            </div>

            <div>
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="bg-black/40 border-border/60"
                rows={3}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="quest_type">Quest Type *</Label>
                <Select
                  id="quest_type"
                  value={questType}
                  onChange={(e) => setQuestType(e.target.value as QuestType)}
                  className="bg-black/40 border-border/60"
                >
                  <option value="main">Main Quest</option>
                  <option value="side">Side Quest</option>
                  <option value="daily">Daily Quest</option>
                  <option value="achievement">Achievement</option>
                </Select>
              </div>

              <div>
                <Label htmlFor="category">Category</Label>
                <Input
                  id="category"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  placeholder="career, health, etc."
                  className="bg-black/40 border-border/60"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label htmlFor="priority">Priority: {priority}</Label>
                <input
                  type="range"
                  id="priority"
                  min="1"
                  max="10"
                  value={priority}
                  onChange={(e) => setPriority(parseInt(e.target.value, 10))}
                  className="w-full"
                />
              </div>

              <div>
                <Label htmlFor="importance">Importance: {importance}</Label>
                <input
                  type="range"
                  id="importance"
                  min="1"
                  max="10"
                  value={importance}
                  onChange={(e) => setImportance(parseInt(e.target.value, 10))}
                  className="w-full"
                />
              </div>

              <div>
                <Label htmlFor="impact">Impact: {impact}</Label>
                <input
                  type="range"
                  id="impact"
                  min="1"
                  max="10"
                  value={impact}
                  onChange={(e) => setImpact(parseInt(e.target.value, 10))}
                  className="w-full"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="difficulty">Difficulty: {difficulty}</Label>
                <input
                  type="range"
                  id="difficulty"
                  min="1"
                  max="10"
                  value={difficulty}
                  onChange={(e) => setDifficulty(parseInt(e.target.value, 10))}
                  className="w-full"
                />
              </div>

              <div>
                <Label htmlFor="effort_hours">Effort (hours)</Label>
                <Input
                  id="effort_hours"
                  type="number"
                  step="0.5"
                  value={effortHours}
                  onChange={(e) => setEffortHours(e.target.value)}
                  className="bg-black/40 border-border/60"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="tags">Tags (comma-separated)</Label>
              <Input
                id="tags"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                placeholder="tag1, tag2, tag3"
                className="bg-black/40 border-border/60"
              />
            </div>

            <div>
              <Label htmlFor="reward">Reward Description</Label>
              <Textarea
                id="reward"
                value={rewardDescription}
                onChange={(e) => setRewardDescription(e.target.value)}
                className="bg-black/40 border-border/60"
                rows={2}
              />
            </div>

            <div>
              <Label htmlFor="motivation">Motivation Notes</Label>
              <Textarea
                id="motivation"
                value={motivationNotes}
                onChange={(e) => setMotivationNotes(e.target.value)}
                className="bg-black/40 border-border/60"
                rows={2}
              />
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={createQuest.isPending || updateQuest.isPending}>
                {quest ? 'Update' : 'Create'} Quest
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
