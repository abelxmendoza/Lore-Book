import { useState, useRef, useEffect } from 'react';
import { Search, Sparkles } from 'lucide-react';

import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { HQIResult, HQIResultCard } from './HQIResultCard';
import { HQIResultModal } from './HQIResultModal';
import { parseQuery } from '../../utils/parseQuery';

export const HQIPanel = () => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<HQIResult[]>([]);
  const [selectedResult, setSelectedResult] = useState<HQIResult | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detectedFilters, setDetectedFilters] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Focus search input on mount
    inputRef.current?.focus();
  }, []);

  const fetchContext = async (nodeId: string) => {
    try {
      const response = await fetch(`/api/hqi/node/${nodeId}/context`);
      if (!response.ok) throw new Error('Failed to fetch context');
      const payload = (await response.json()) as HQIContextPayload;
      setContext(payload);
    } catch (err) {
      console.error(err);
      setContext(null);
    }
  };

  const handleSearch = async (searchQuery: string = query) => {
    if (!searchQuery.trim()) return;

    setLoading(true);
    setError(null);
    
    try {
      // Parse the query to extract filters
      const parsed = parseQuery(searchQuery);
      const filters: Record<string, unknown> = {};
      
      if (parsed.filters.timeStart) filters.time_start = parsed.filters.timeStart;
      if (parsed.filters.timeEnd) filters.time_end = parsed.filters.timeEnd;
      if (parsed.filters.tags?.length) filters.tags = parsed.filters.tags;
      if (parsed.filters.characters?.length) filters.characters = parsed.filters.characters;
      if (parsed.filters.motifs?.length) filters.motifs = parsed.filters.motifs;

      // Show detected filters
      const filterLabels: string[] = [];
      if (parsed.filters.timeStart || parsed.filters.timeEnd) {
        filterLabels.push('Time range');
      }
      if (parsed.filters.characters?.length) {
        filterLabels.push(`${parsed.filters.characters.length} character${parsed.filters.characters.length > 1 ? 's' : ''}`);
      }
      if (parsed.filters.tags?.length) {
        filterLabels.push(`${parsed.filters.tags.length} tag${parsed.filters.tags.length > 1 ? 's' : ''}`);
      }
      if (parsed.filters.motifs?.length) {
        filterLabels.push(`${parsed.filters.motifs.length} motif${parsed.filters.motifs.length > 1 ? 's' : ''}`);
      }
      setDetectedFilters(filterLabels);

      const response = await fetch('/api/hqi/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: parsed.query, filters })
      });
      
      const payload = await response.json();
      setResults(payload.results ?? []);
    } catch (err) {
      console.error(err);
      setError('Search failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSearch();
    }
  };

  const onSelectResult = (result: HQIResult) => {
    setSelectedResult(result);
    setIsModalOpen(true);
  };

  return (
    <>
      <div className="space-y-4">
        {/* Search Bar */}
        <div className="rounded-2xl border border-border/60 bg-black/50 p-6 shadow-panel">
          <div className="flex items-center gap-3">
            <div className="flex flex-1 items-center gap-3 rounded-xl border border-border/50 bg-black/60 px-4 py-3">
              <Sparkles className="h-5 w-5 text-primary flex-shrink-0" />
              <Input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Search your memories... e.g., 'robotics events involving Kai in March' or 'moments of clarity last week'"
                className="border-none bg-transparent text-white text-base placeholder:text-white/40 focus-visible:ring-0"
                disabled={loading}
              />
            </div>
            <Button 
              onClick={() => handleSearch()} 
              disabled={loading || !query.trim()} 
              leftIcon={<Search className="h-4 w-4" />}
              size="lg"
            >
              {loading ? 'Searching...' : 'Search'}
            </Button>
          </div>

          {/* Detected Filters */}
          {detectedFilters.length > 0 && (
            <div className="mt-4 flex items-center gap-2 text-sm text-white/60">
              <span>Detected:</span>
              <div className="flex flex-wrap gap-2">
                {detectedFilters.map((filter, idx) => (
                  <span key={idx} className="px-2 py-1 rounded-full bg-primary/10 text-primary text-xs">
                    {filter}
                  </span>
                ))}
              </div>
            </div>
          )}

          {error && (
            <div className="mt-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30">
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}
        </div>

        {/* Results List */}
        <div className="space-y-3">
          {results.length === 0 && !loading && query && (
            <div className="text-center py-12 text-white/60">
              <p className="text-lg font-medium mb-2">No results found</p>
              <p className="text-sm">Try rephrasing your search or use different keywords</p>
            </div>
          )}
          {results.length === 0 && !loading && !query && (
            <div className="text-center py-12 text-white/60">
              <Sparkles className="h-12 w-12 mx-auto mb-4 text-white/20" />
              <p className="text-lg font-medium mb-2">Search your memories</p>
              <p className="text-sm">Ask anything in natural language. The search understands dates, characters, tags, and more.</p>
            </div>
          )}
          {results.map((result) => (
            <HQIResultCard 
              key={result.node_id} 
              result={result} 
              selected={selectedResult?.node_id === result.node_id} 
              onSelect={onSelectResult} 
            />
          ))}
        </div>
      </div>

      {/* Result Modal */}
      {selectedResult && (
        <HQIResultModal
          result={selectedResult}
          isOpen={isModalOpen}
          onClose={() => {
            setIsModalOpen(false);
            setSelectedResult(null);
          }}
        />
      )}
    </>
  );
};
