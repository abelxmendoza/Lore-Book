import { Search, X } from 'lucide-react';
import { Input } from '../../../components/ui/input';
import { Button } from '../../../components/ui/button';
import { useChatSearch } from '../hooks/useChatSearch';
import type { Message } from '../message/ChatMessage';
import { ChatSearchResult } from './ChatSearchResult';

type ChatSearchModalProps = {
  messages: Message[];
  isOpen: boolean;
  onResultClick?: (messageId: string) => void;
  onClose?: () => void;
};

export const ChatSearchModal = ({ messages, isOpen, onResultClick, onClose }: ChatSearchModalProps) => {
  const { query, setQuery, results, close } = useChatSearch(messages);

  const handleClose = () => {
    close();
    onClose?.();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-start justify-center pt-20 p-4">
      <div className="max-w-2xl w-full bg-black/90 border border-border/60 rounded-lg shadow-xl">
        {/* Search Input */}
        <div className="p-4 border-b border-border/60">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-white/40" />
              <Input
                type="text"
                placeholder="Search conversation... (⌘K)"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="pl-10 bg-black/60 border-border/50 text-white placeholder:text-white/40"
                autoFocus
              />
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClose}
              className="text-white/60 hover:text-white"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Results */}
        <div className="max-h-96 overflow-y-auto p-4 space-y-2">
          {results.length > 0 ? (
            results.map((result) => (
              <ChatSearchResult
                key={result.message.id}
                result={result}
                onClick={() => {
                  onResultClick?.(result.message.id);
                  handleClose();
                }}
              />
            ))
          ) : query ? (
            <div className="text-sm text-white/50 text-center py-8">
              No matches found
            </div>
          ) : (
            <div className="text-sm text-white/50 text-center py-8">
              Start typing to search...
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

