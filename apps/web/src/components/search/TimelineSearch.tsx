/**
 * Universal Timeline Search Component
 * Searches across people, locations, skills, jobs, projects, eras, etc.
 */

import { useState, useEffect, useCallback } from 'react';
import { Search } from 'lucide-react';
import { fetchJson } from '../../lib/api';
import { SearchResults } from './SearchResults';
import { TimelineResultItem } from './TimelineResultItem';

export interface UniversalSearchResult {
  id: string;
  title: string;
  date: string;
  timelineType: string;
  sourceType?: string;
  description?: string;
  metadata?: Record<string, any>;
}

export interface UniversalSearchResponse {
  life: UniversalSearchResult[];
  people: UniversalSearchResult[];
  locations: UniversalSearchResult[];
  skills: UniversalSearchResult[];
  projects: UniversalSearchResult[];
  jobs: UniversalSearchResult[];
  eras: UniversalSearchResult[];
  arcs: UniversalSearchResult[];
  sagas: UniversalSearchResult[];
  relationships: UniversalSearchResult[];
}

export const TimelineSearch = () => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<UniversalSearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [debounceTimer, setDebounceTimer] = useState<NodeJS.Timeout | null>(null);

  const search = useCallback(async (searchQuery: string) => {
    if (searchQuery.length < 2) {
      setResults(null);
      return;
    }

    setLoading(true);
    try {
      const data = await fetchJson<UniversalSearchResponse>('/api/search/universal', {
        method: 'POST',
        body: JSON.stringify({ query: searchQuery }),
        headers: { 'Content-Type': 'application/json' }
      });
      setResults(data);
    } catch (error) {
      console.error('Search error:', error);
      setResults(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Debounce search
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }

    const timer = setTimeout(() => {
      if (query.length >= 2) {
        void search(query);
      } else {
        setResults(null);
      }
    }, 300);

    setDebounceTimer(timer);

    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [query, search]);

  const handleItemClick = (item: UniversalSearchResult) => {
    navigateToTimeline(item.timelineType, item.id);
  };

  return (
    <div className="relative w-full">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-white/40" />
        <input
          className="w-full pl-10 pr-4 py-2 rounded-lg bg-black/40 border border-white/10 text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50"
          placeholder="Search people, places, skills, jobs, hobbies, eras..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {loading && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-primary" />
          </div>
        )}
      </div>

      {results && query.length >= 2 && (
        <SearchResults results={results} onItemClick={handleItemClick} />
      )}
    </div>
  );
};

/**
 * Navigate to timeline view based on type
 */
function navigateToTimeline(timelineType: string, eventId: string) {
  // Determine which surface to navigate to
  let surface: string = 'timeline';
  
  switch (timelineType) {
    case 'people':
      surface = 'characters';
      break;
    case 'locations':
      surface = 'locations';
      break;
    case 'projects':
    case 'jobs':
    case 'skills':
    case 'eras':
    case 'arcs':
    case 'sagas':
    case 'relationships':
    case 'life':
      surface = 'timeline';
      break;
    default:
      surface = 'timeline';
  }

  // Navigate to the surface using CustomEvent (handled by App.tsx)
  const event = new CustomEvent('navigate', {
    detail: { surface, eventId, timelineType }
  });
  window.dispatchEvent(event);

  // Also update URL using React Router if available
  if (typeof window !== 'undefined') {
    const path = `/${surface}${eventId ? `?event=${eventId}` : ''}`;
    window.history.pushState({}, '', path);
    
    // Trigger a popstate event to notify React Router
    window.dispatchEvent(new PopStateEvent('popstate'));
  }
}

