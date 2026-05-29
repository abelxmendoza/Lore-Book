import type { FC } from 'react';

import { cn } from '../../lib/utils';
import type { useAutoTagger } from '../../hooks/useAutoTagger';

export const AutoTagSuggestions: FC<{ tagger: ReturnType<typeof useAutoTagger> }> = ({ tagger }) => {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs text-white/60">
        <span>Auto Tagger</span>
        <span className="text-white/40">regex + keyword map</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {tagger.suggestions.map((suggestion) => (
          <button
            key={suggestion.tag}
            onClick={() => tagger.toggleTag(suggestion.tag)}
            className={cn(
              'rounded-full border px-3 py-1 text-xs transition',
              tagger.activeMap.has(suggestion.tag)
                ? 'border-neon-aqua/60 bg-neon-aqua/10 text-neon-aqua'
                : 'border-white/10 bg-white/5 text-white/70 hover:border-neon-pink/50 hover:text-white'
            )}
          >
            #{suggestion.tag}
          </button>
        ))}
        {tagger.suggestions.length === 0 && (
          <span className="text-sm text-white/40">Start typing to generate tag chips.</span>
        )}
      </div>
    </div>
  );
};
