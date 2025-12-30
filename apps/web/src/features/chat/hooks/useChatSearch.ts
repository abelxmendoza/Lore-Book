import { useState, useCallback, useMemo } from 'react';
import type { Message } from '../message/ChatMessage';
import { highlightMatches, findMatchPositions } from '../utils/highlightMatches';

export type SearchResult = {
  message: Message;
  matches: number;
  highlightedContent: string;
};

export const useChatSearch = (messages: Message[]) => {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);

  const results = useMemo<SearchResult[]>(() => {
    if (!query.trim()) return [];

    const lowerQuery = query.toLowerCase();
    const matches = messages
      .map((message) => {
        const contentMatches = (message.content.toLowerCase().match(new RegExp(lowerQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
        const connectionMatches = (message.connections || [])
          .filter(c => c.toLowerCase().includes(lowerQuery)).length;
        const sourceMatches = (message.sources || [])
          .filter(s => s.title.toLowerCase().includes(lowerQuery)).length;
        
        const totalMatches = contentMatches + connectionMatches + sourceMatches;
        
        if (totalMatches > 0) {
          return {
            message,
            matches: totalMatches,
            highlightedContent: highlightMatches(message.content, query)
          };
        }
        return null;
      })
      .filter((r): r is SearchResult => r !== null)
      .sort((a, b) => b.matches - a.matches)
      .slice(0, 10);

    return matches;
  }, [messages, query]);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => {
    setIsOpen(false);
    setQuery('');
  }, []);

  return {
    query,
    setQuery,
    results,
    isOpen,
    open,
    close
  };
};

