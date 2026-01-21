import { Sparkles, Plus } from 'lucide-react';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { useQuestSuggestions, useCreateQuest } from '../../hooks/useQuests';

export const QuestSuggestions = () => {
  const { data: suggestions, isLoading } = useQuestSuggestions();
  const createQuest = useCreateQuest();

  const handleCreateQuest = async (suggestion: any) => {
    try {
      await createQuest.mutateAsync({
        title: suggestion.title,
        description: suggestion.description,
        quest_type: suggestion.quest_type,
        priority: suggestion.priority || 5,
        importance: suggestion.importance || 5,
        impact: suggestion.impact || 5,
        source: 'suggested',
      });
    } catch (error) {
      console.error('Failed to create quest from suggestion:', error);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <div className="text-white/60">Loading suggestions...</div>
      </div>
    );
  }

  if (!suggestions || suggestions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[200px] text-center">
        <Sparkles className="h-12 w-12 text-white/20 mb-4" />
        <p className="text-white/60">No quest suggestions available</p>
        <p className="text-white/40 text-sm mt-2">
          Write more journal entries to get AI-generated quest suggestions
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Sparkles className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-semibold text-white">AI Quest Suggestions</h2>
      </div>

      <div className="space-y-3">
        {suggestions.map((suggestion, index) => (
          <div
            key={index}
            className="bg-black/40 border border-border/60 rounded-lg p-4 hover:border-primary/50 transition-colors"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <h3 className="text-base font-semibold text-white">{suggestion.title}</h3>
                  <Badge variant="outline" className="text-xs">
                    {suggestion.quest_type}
                  </Badge>
                  {suggestion.confidence && (
                    <Badge variant="outline" className="text-xs text-white/60">
                      {Math.round(suggestion.confidence * 100)}% confidence
                    </Badge>
                  )}
                </div>
                {suggestion.description && (
                  <p className="text-sm text-white/70 mb-2">{suggestion.description}</p>
                )}
                {suggestion.reasoning && (
                  <p className="text-xs text-white/50 italic mb-2">{suggestion.reasoning}</p>
                )}
                <div className="flex items-center gap-4 text-xs text-white/60">
                  {suggestion.priority && <span>Priority: {suggestion.priority}</span>}
                  {suggestion.importance && <span>Importance: {suggestion.importance}</span>}
                  {suggestion.impact && <span>Impact: {suggestion.impact}</span>}
                </div>
              </div>
              <Button
                size="sm"
                onClick={() => handleCreateQuest(suggestion)}
                disabled={createQuest.isPending}
              >
                <Plus className="h-4 w-4 mr-1" />
                Create Quest
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
