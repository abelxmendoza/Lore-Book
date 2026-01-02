import { useState, useEffect, useRef, useCallback } from 'react';
import { Search, X, Eye, Clock, User, AlertTriangle } from 'lucide-react';
import { perceptionApi } from '../../api/perceptions';
import type { PerceptionEntry } from '../../types/perception';
import { formatDistanceToNow } from 'date-fns';

interface PerceptionSearchBarProps {
  onSelect?: (perception: PerceptionEntry) => void;
  onSearchChange?: (query: string) => void;
  initialQuery?: string;
}

export const PerceptionSearchBar = ({ onSelect, onSearchChange, initialQuery = '' }: PerceptionSearchBarProps) => {
  const [query, setQuery] = useState(initialQuery);
  
  // Sync with external query changes
  useEffect(() => {
    setQuery(initialQuery);
  }, [initialQuery]);
  const [suggestions, setSuggestions] = useState<PerceptionEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const searchRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Debounced search
  useEffect(() => {
    if (!query.trim()) {
      setSuggestions([]);
      setShowSuggestions(false);
      onSearchChange?.('');
      return;
    }

    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        // Search perceptions by subject_alias and content
        const allPerceptions = await perceptionApi.getPerceptions({
          limit: 20
        });

        const queryLower = query.toLowerCase();
        const filtered = allPerceptions.filter(p => 
          p.subject_alias.toLowerCase().includes(queryLower) ||
          p.content.toLowerCase().includes(queryLower) ||
          p.impact_on_me.toLowerCase().includes(queryLower) ||
          (p.source_detail && p.source_detail.toLowerCase().includes(queryLower))
        );

        // Sort by relevance (exact matches first, then by recency)
        const sorted = filtered.sort((a, b) => {
          const aExact = a.subject_alias.toLowerCase() === queryLower ? 1 : 0;
          const bExact = b.subject_alias.toLowerCase() === queryLower ? 1 : 0;
          if (aExact !== bExact) return bExact - aExact;
          return new Date(b.timestamp_heard).getTime() - new Date(a.timestamp_heard).getTime();
        });

        setSuggestions(sorted.slice(0, 8)); // Limit to 8 suggestions
        setShowSuggestions(true);
        onSearchChange?.(query);
      } catch (error) {
        console.error('Failed to search perceptions:', error);
        setSuggestions([]);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [query, onSearchChange]);

  // Close suggestions when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showSuggestions || suggestions.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => (prev < suggestions.length - 1 ? prev + 1 : prev));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => (prev > 0 ? prev - 1 : -1));
    } else if (e.key === 'Enter' && selectedIndex >= 0) {
      e.preventDefault();
      handleSelect(suggestions[selectedIndex]);
    } else if (e.key === 'Escape') {
      setShowSuggestions(false);
      setQuery('');
    }
  };

  const handleSelect = (perception: PerceptionEntry) => {
    onSelect?.(perception);
    setQuery('');
    setShowSuggestions(false);
    setSelectedIndex(-1);
  };

  const handleClear = () => {
    setQuery('');
    setSuggestions([]);
    setShowSuggestions(false);
    onSearchChange?.('');
    inputRef.current?.focus();
  };

  const getSourceIcon = (source: string) => {
    switch (source) {
      case 'overheard':
        return <Eye className="h-3 w-3" />;
      case 'told_by':
        return <User className="h-3 w-3" />;
      case 'rumor':
        return <AlertTriangle className="h-3 w-3" />;
      default:
        return <Eye className="h-3 w-3" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'unverified':
        return 'text-orange-400';
      case 'confirmed':
        return 'text-green-400';
      case 'disproven':
        return 'text-red-400';
      case 'retracted':
        return 'text-gray-400';
      default:
        return 'text-white/60';
    }
  };

  return (
    <div ref={searchRef} className="relative w-full">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-white/40" />
        <input
          ref={inputRef}
          type="text"
          className="w-full pl-10 pr-10 py-2 rounded-lg bg-black/40 border border-orange-500/30 text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500/50"
          placeholder="Search perceptions by person, content, or impact..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            if (suggestions.length > 0) {
              setShowSuggestions(true);
            }
          }}
        />
        {query && (
          <button
            onClick={handleClear}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/60 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        )}
        {loading && (
          <div className="absolute right-10 top-1/2 -translate-y-1/2">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-orange-500/20 border-t-orange-500" />
          </div>
        )}
      </div>

      {/* Suggestions Dropdown */}
      {showSuggestions && suggestions.length > 0 && (
        <div className="absolute top-full mt-2 left-0 w-full bg-black/95 backdrop-blur-sm border border-orange-500/30 rounded-lg shadow-xl z-50 max-h-[400px] overflow-y-auto">
          <div className="p-2 space-y-1">
            {suggestions.map((perception, index) => (
              <button
                key={perception.id}
                onClick={() => handleSelect(perception)}
                className={`w-full text-left p-3 rounded-lg transition-colors ${
                  selectedIndex === index
                    ? 'bg-orange-500/20 border border-orange-500/40'
                    : 'bg-black/40 hover:bg-orange-500/10 border border-transparent'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold text-white text-sm truncate">
                        {perception.subject_alias}
                      </span>
                      <span className={`text-xs ${getStatusColor(perception.status)}`}>
                        {perception.status}
                      </span>
                      <div className="flex items-center gap-1 text-orange-400/60">
                        {getSourceIcon(perception.source)}
                        <span className="text-xs capitalize">{perception.source.replace('_', ' ')}</span>
                      </div>
                    </div>
                    <p className="text-xs text-white/70 line-clamp-2 mb-1">
                      {perception.content}
                    </p>
                    <div className="flex items-center gap-3 text-xs text-white/50">
                      <div className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        <span>{formatDistanceToNow(new Date(perception.timestamp_heard), { addSuffix: true })}</span>
                      </div>
                      <span className="text-orange-400/60">
                        {Math.round(perception.confidence_level * 100)}% confidence
                      </span>
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* No results */}
      {showSuggestions && !loading && query.trim() && suggestions.length === 0 && (
        <div className="absolute top-full mt-2 left-0 w-full bg-black/95 backdrop-blur-sm border border-orange-500/30 rounded-lg shadow-xl z-50 p-4">
          <p className="text-sm text-white/60 text-center">No perceptions found</p>
        </div>
      )}
    </div>
  );
};
