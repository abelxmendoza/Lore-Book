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
    <div className="space-y-2">
      <div className="flex items-center gap-1.5">
        <Sparkles className="h-3.5 w-3.5 text-primary" />
        <h2 className="text-xs font-semibold text-white sm:text-sm">AI Quest Suggestions</h2>
      </div>

      <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
        {suggestions.map((suggestion, index) => (
          <article
            key={index}
            title={suggestion.reasoning}
            className="flex items-center gap-2 rounded-md border border-border/60 bg-black/40 px-2 py-1.5 hover:border-primary/50 transition-colors"
          >
            <div className="min-w-0 flex-1 space-y-0.5">
              <div className="flex items-center gap-1 min-w-0">
                <Badge variant="outline" className="shrink-0 px-1 py-px text-[8px] uppercase">
                  {suggestion.quest_type}
                </Badge>
                <h3 className="truncate text-[11px] font-semibold text-white sm:text-xs">
                  {suggestion.title}
                </h3>
              </div>
              {suggestion.description && (
                <p className="line-clamp-1 text-[10px] text-white/50">{suggestion.description}</p>
              )}
              <div className="flex flex-wrap items-center gap-x-2 text-[9px] text-white/40">
                {suggestion.confidence != null && (
                  <span>{Math.round(suggestion.confidence * 100)}%</span>
                )}
                {suggestion.priority != null && (
                  <>
                    <span>·</span>
                    <span>P{suggestion.priority}</span>
                  </>
                )}
              </div>
            </div>
            <Button
              size="sm"
              onClick={() => handleCreateQuest(suggestion)}
              disabled={createQuest.isPending}
              className="h-6 shrink-0 px-2 text-[10px]"
            >
              <Plus className="h-3 w-3" />
            </Button>
          </article>
        ))}
      </div>
    </div>
  );
};
