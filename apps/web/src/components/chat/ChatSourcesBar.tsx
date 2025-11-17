import { Sparkles, ExternalLink } from 'lucide-react';
import { Badge } from '../ui/badge';
import type { ChatSource } from './ChatMessage';

type ChatSourcesBarProps = {
  sources?: ChatSource[];
  onSourceClick?: (source: ChatSource) => void;
};

export const ChatSourcesBar = ({ sources, onSourceClick }: ChatSourcesBarProps) => {
  if (!sources || sources.length === 0) return null;

  const groupedSources = sources.reduce((acc, source) => {
    if (!acc[source.type]) {
      acc[source.type] = [];
    }
    acc[source.type].push(source);
    return acc;
  }, {} as Record<string, ChatSource[]>);

  return (
    <div className="px-4 py-2 border-t border-border/30 bg-black/20">
      <div className="flex items-center gap-2 mb-2">
        <Sparkles className="h-3 w-3 text-primary/70" />
        <span className="text-xs font-semibold text-primary/70">Sources Used</span>
        <span className="text-xs text-white/40">({sources.length})</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {Object.entries(groupedSources).map(([type, typeSources]) => (
          <div key={type} className="flex items-center gap-1">
            <Badge variant="outline" className="text-xs border-border/30 text-white/50">
              {type}
            </Badge>
            {typeSources.slice(0, 3).map((source, idx) => (
              <button
                key={idx}
                onClick={() => onSourceClick?.(source)}
                className="px-2 py-0.5 rounded text-xs text-white/60 hover:text-white hover:bg-black/40 transition-colors truncate max-w-[100px]"
                title={source.title}
              >
                {source.title}
              </button>
            ))}
            {typeSources.length > 3 && (
              <span className="text-xs text-white/40">+{typeSources.length - 3}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

