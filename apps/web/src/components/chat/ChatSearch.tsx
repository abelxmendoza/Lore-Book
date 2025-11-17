import { useState } from 'react';
import { Search, X } from 'lucide-react';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import type { Message } from './ChatMessage';

type ChatSearchProps = {
  messages: Message[];
  onResultClick?: (messageId: string) => void;
  onClose?: () => void;
};

export const ChatSearch = ({ messages, onResultClick, onClose }: ChatSearchProps) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Array<{ message: Message; matches: number }>>([]);

  const handleSearch = (searchQuery: string) => {
    if (!searchQuery.trim()) {
      setResults([]);
      return;
    }

    const lowerQuery = searchQuery.toLowerCase();
    const matches = messages
      .map((message) => {
        const contentMatches = (message.content.toLowerCase().match(new RegExp(lowerQuery, 'g')) || []).length;
        const connectionMatches = (message.connections || [])
          .filter(c => c.toLowerCase().includes(lowerQuery)).length;
        const sourceMatches = (message.sources || [])
          .filter(s => s.title.toLowerCase().includes(lowerQuery)).length;
        
        const totalMatches = contentMatches + connectionMatches + sourceMatches;
        
        return totalMatches > 0 ? { message, matches: totalMatches } : null;
      })
      .filter((r): r is { message: Message; matches: number } => r !== null)
      .sort((a, b) => b.matches - a.matches)
      .slice(0, 10);

    setResults(matches);
  };

  return (
    <div className="border-b border-border/60 bg-black/40 p-4">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-white/40" />
          <Input
            type="text"
            placeholder="Search conversation..."
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              handleSearch(e.target.value);
            }}
            className="pl-10 bg-black/60 border-border/50 text-white placeholder:text-white/40"
            autoFocus
          />
        </div>
        {onClose && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="text-white/60 hover:text-white"
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>
      
      {results.length > 0 && (
        <div className="mt-3 space-y-2 max-h-64 overflow-y-auto">
          {results.map(({ message, matches }) => (
            <button
              key={message.id}
              onClick={() => {
                onResultClick?.(message.id);
                onClose?.();
              }}
              className="w-full text-left p-2 rounded border border-border/30 bg-black/40 hover:border-primary/50 hover:bg-black/60 transition-colors"
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-white/50">
                  {message.timestamp.toLocaleDateString()} {message.timestamp.toLocaleTimeString()}
                </span>
                <span className="text-xs text-primary/70">{matches} match{matches > 1 ? 'es' : ''}</span>
              </div>
              <p className="text-sm text-white/80 line-clamp-2">
                {message.content.substring(0, 150)}...
              </p>
            </button>
          ))}
        </div>
      )}
      
      {query && results.length === 0 && (
        <div className="mt-3 text-sm text-white/50 text-center">
          No matches found
        </div>
      )}
    </div>
  );
};

