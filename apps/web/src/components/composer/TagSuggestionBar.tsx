import { useEffect, useState } from 'react';
import { suggestTags } from '../../api/entries';
import { Badge } from '../ui/badge';

type TagSuggestionBarProps = {
  content?: string;
  onTagSelect?: (tag: string) => void;
  selectedTags?: string[];
};

export const TagSuggestionBar = ({ content = '', onTagSelect, selectedTags = [] }: TagSuggestionBarProps) => {
  const [suggestedTags, setSuggestedTags] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchSuggestions = async () => {
      if (!content.trim() || content.length < 10) {
        setSuggestedTags([]);
        return;
      }

      setLoading(true);
      try {
        const tags = await suggestTags(content);
        setSuggestedTags(tags.slice(0, 5)); // Limit to 5 suggestions
      } catch (error) {
        console.error('Failed to fetch tag suggestions:', error);
        setSuggestedTags([]);
      } finally {
        setLoading(false);
      }
    };

    // Debounce API calls
    const timeoutId = setTimeout(fetchSuggestions, 500);
    return () => clearTimeout(timeoutId);
  }, [content]);

  if (loading) {
    return (
      <div className="flex flex-wrap gap-2 text-xs text-white/70">
        <span className="text-white/50">Suggesting tags...</span>
      </div>
    );
  }

  if (suggestedTags.length === 0 && !content.trim()) {
    return null;
  }

  return (
    <div className="flex flex-wrap gap-2 text-xs text-white/70">
      {suggestedTags.length > 0 && (
        <>
          <span className="text-white/50">Suggested tags:</span>
          {suggestedTags.map((tag) => {
            const isSelected = selectedTags.includes(tag);
            return (
              <Badge
                key={tag}
                variant={isSelected ? 'default' : 'outline'}
                className={`cursor-pointer transition-colors ${
                  isSelected
                    ? 'bg-primary/20 text-primary border-primary/40'
                    : 'border-primary/40 text-white/70 hover:bg-primary/10'
                }`}
                onClick={() => onTagSelect?.(tag)}
              >
                #{tag}
              </Badge>
            );
          })}
        </>
      )}
    </div>
  );
};
