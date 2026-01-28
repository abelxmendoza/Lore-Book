/**
 * SearchWithAutocomplete — mobile-responsive search input with dropdown suggestions.
 * Used for characters, groups, locations, skills, etc.
 */
import { useState, useMemo, useRef, useEffect } from 'react';
import { Search } from 'lucide-react';
import { Input } from './input';
import { cn } from '../../lib/cn';

export interface SearchWithAutocompleteProps<T> {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  items: T[];
  getSearchableText: (item: T) => string;
  getDisplayLabel: (item: T) => string;
  maxSuggestions?: number;
  className?: string;
  inputClassName?: string;
  emptyHint?: string;
  autoComplete?: 'on' | 'off';
}

const MAX_SUGGESTIONS_DEFAULT = 8;

export function SearchWithAutocomplete<T>({
  value,
  onChange,
  placeholder,
  items,
  getSearchableText,
  getDisplayLabel,
  maxSuggestions = MAX_SUGGESTIONS_DEFAULT,
  className,
  inputClassName,
  emptyHint = 'Type to search…',
  autoComplete = 'off',
}: SearchWithAutocompleteProps<T>) {
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const suggestions = useMemo(() => {
    const term = value.trim().toLowerCase();
    if (!term) return [];
    return items
      .filter((item) => getSearchableText(item).toLowerCase().includes(term))
      .slice(0, maxSuggestions);
  }, [items, value, getSearchableText, maxSuggestions]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
        setSelectedIndex(-1);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Keep selectedIndex in bounds when suggestions change
  useEffect(() => {
    if (selectedIndex >= suggestions.length) setSelectedIndex(Math.max(-1, suggestions.length - 1));
  }, [suggestions.length, selectedIndex]);

  const handleSelect = (item: T) => {
    onChange(getDisplayLabel(item));
    setShowSuggestions(false);
    setSelectedIndex(-1);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showSuggestions || suggestions.length === 0) {
      if (e.key === 'Escape') setShowSuggestions(false);
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((i) => (i < suggestions.length - 1 ? i + 1 : i));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((i) => (i > 0 ? i - 1 : -1));
    } else if (e.key === 'Enter' && selectedIndex >= 0 && suggestions[selectedIndex]) {
      e.preventDefault();
      handleSelect(suggestions[selectedIndex]);
    } else if (e.key === 'Escape') {
      setShowSuggestions(false);
      setSelectedIndex(-1);
    }
  };

  const open = showSuggestions && (suggestions.length > 0 || (value.trim().length > 0 && suggestions.length === 0));

  return (
    <div ref={wrapperRef} className={cn('relative w-full min-w-0', className)}>
      <Search
        className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40 pointer-events-none z-10"
        aria-hidden
      />
      <Input
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        aria-controls="search-autocomplete-list"
        aria-activedescendant={selectedIndex >= 0 ? `search-suggestion-${selectedIndex}` : undefined}
        autoComplete={autoComplete}
        placeholder={placeholder}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setShowSuggestions(true);
          setSelectedIndex(-1);
        }}
        onFocus={() => setShowSuggestions(true)}
        onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
        onKeyDown={handleKeyDown}
        className={cn('pl-10 text-sm sm:text-base', inputClassName)}
      />
      {open && (
        <div
          id="search-autocomplete-list"
          ref={listRef}
          className="absolute top-full left-0 right-0 mt-1 z-50 w-full min-w-0 rounded-lg border border-border/60 bg-black/95 shadow-xl overflow-hidden max-h-[min(16rem,60vh)] overflow-y-auto"
          role="listbox"
        >
          {suggestions.length > 0 ? (
            <div className="py-1">
              {suggestions.map((item, index) => (
                <button
                  key={index}
                  id={`search-suggestion-${index}`}
                  role="option"
                  aria-selected={index === selectedIndex}
                  type="button"
                  className={cn(
                    'w-full text-left px-3 sm:px-4 py-3 text-sm sm:text-base text-white truncate border-l-2 -mt-px transition-colors',
                    'min-h-[44px] sm:min-h-0 sm:py-2 flex items-center',
                    index === selectedIndex
                      ? 'bg-primary/20 border-primary text-primary'
                      : 'border-transparent hover:bg-white/10'
                  )}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    handleSelect(item);
                  }}
                  onMouseEnter={() => setSelectedIndex(index)}
                >
                  {getDisplayLabel(item)}
                </button>
              ))}
            </div>
          ) : (
            <div className="px-3 py-3 text-sm text-white/50">{emptyHint}</div>
          )}
        </div>
      )}
    </div>
  );
}
