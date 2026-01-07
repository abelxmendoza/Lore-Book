/**
 * Individual Recall Source Item
 * 
 * Displays a single past moment with date, summary, and confidence indicator
 */

import { Badge } from '../../../components/ui/badge';
import type { RecallSource } from './recallTypes';

type RecallSourceItemProps = {
  source: RecallSource;
};

export const RecallSourceItem = ({ source }: RecallSourceItemProps) => {
  const date = new Date(source.timestamp).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <li className="recall-source p-3 rounded-lg bg-black/20 border border-border/10 hover:border-border/30 transition-colors">
      <div className="flex items-start justify-between gap-2 mb-1">
        <time className="text-xs text-white/50 font-mono">{date}</time>
        {source.confidence < 0.5 && (
          <Badge
            variant="outline"
            className="text-xs border-yellow-500/30 text-yellow-400/70 bg-yellow-500/5"
          >
            Tentative match
          </Badge>
        )}
      </div>
      <p className="text-sm text-white/80 leading-relaxed">{source.summary}</p>
      
      {/* Optional: Show emotions/themes if available */}
      {(source.emotions?.length || source.themes?.length) && (
        <div className="mt-2 flex flex-wrap gap-1">
          {source.emotions?.slice(0, 3).map((emotion, idx) => (
            <Badge
              key={idx}
              variant="outline"
              className="text-xs border-primary/20 text-primary/60 bg-primary/5"
            >
              {emotion}
            </Badge>
          ))}
          {source.themes?.slice(0, 2).map((theme, idx) => (
            <Badge
              key={idx}
              variant="outline"
              className="text-xs border-purple-500/20 text-purple-400/60 bg-purple-500/5"
            >
              {theme}
            </Badge>
          ))}
        </div>
      )}
    </li>
  );
};

