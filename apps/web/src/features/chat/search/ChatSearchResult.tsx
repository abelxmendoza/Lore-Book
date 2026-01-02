import type { SearchResult } from '../hooks/useChatSearch';

type ChatSearchResultProps = {
  result: SearchResult;
  onClick?: () => void;
};

export const ChatSearchResult = ({ result, onClick }: ChatSearchResultProps) => {
  return (
    <button
      onClick={onClick}
      className="w-full text-left p-3 rounded border border-border/30 bg-black/40 hover:border-primary/50 hover:bg-black/60 transition-colors"
    >
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-white/50">
          {result.message.timestamp.toLocaleDateString()} {result.message.timestamp.toLocaleTimeString()}
        </span>
        <span className="text-xs text-primary/70">{result.matches} match{result.matches > 1 ? 'es' : ''}</span>
      </div>
      <p 
        className="text-sm text-white/80 line-clamp-2"
        dangerouslySetInnerHTML={{ __html: result.highlightedContent.substring(0, 150) + '...' }}
      />
    </button>
  );
};

