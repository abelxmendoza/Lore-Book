import { Badge } from '../../../components/ui/badge';

type TagSuggestion = {
  tag: string;
  rationale: string;
};

type TagSuggestionsProps = {
  suggestions: TagSuggestion[];
  onToggle?: (tag: string) => void;
  activeTags?: Set<string>;
};

export const TagSuggestions = ({ suggestions, onToggle, activeTags }: TagSuggestionsProps) => {
  if (suggestions.length === 0) return null;

  return (
    <div className="px-4 pb-2 flex flex-wrap gap-2">
      {suggestions.map((suggestion, idx) => (
        <Badge
          key={idx}
          variant={activeTags?.has(suggestion.tag) ? 'default' : 'outline'}
          className="cursor-pointer text-xs"
          onClick={() => onToggle?.(suggestion.tag)}
          title={suggestion.rationale}
        >
          {suggestion.tag}
        </Badge>
      ))}
    </div>
  );
};

