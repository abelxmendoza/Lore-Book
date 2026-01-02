import React, { useState } from 'react';
import { Search, Filter, Sparkles, List } from 'lucide-react';
import { searchTimelines } from '../../api/timelineV2';
import type { SearchMode, SearchFilters, TimelineSearchResult } from '../../types/timelineV2';

interface TimelineSearchProps {
  onResults: (results: TimelineSearchResult) => void;
}

export const TimelineSearch: React.FC<TimelineSearchProps> = ({ onResults }) => {
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<SearchMode>('natural');
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<SearchFilters>({});
  const [loading, setLoading] = useState(false);

  const handleSearch = async () => {
    if (!query.trim()) return;

    setLoading(true);
    try {
      const results = await searchTimelines(query, mode, filters);
      onResults(results);
    } catch (error) {
      console.error('Search failed:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 p-4">
      <div className="flex items-center gap-2 mb-2">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search timelines... (e.g., 'College timeline', 'When I was studying solar')"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white"
          />
        </div>
        <button
          onClick={handleSearch}
          disabled={loading || !query.trim()}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? 'Searching...' : 'Search'}
        </button>
        <button
          onClick={() => setShowFilters(!showFilters)}
          className="p-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
        >
          <Filter className="w-4 h-4" />
        </button>
      </div>

      {/* Search Mode Toggle */}
      <div className="flex items-center gap-2 mb-2">
        <span className="text-sm text-gray-600 dark:text-gray-400">Mode:</span>
        <button
          onClick={() => setMode('natural')}
          className={`px-3 py-1 text-sm rounded ${
            mode === 'natural'
              ? 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300'
              : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
          }`}
        >
          <List className="w-3 h-3 inline mr-1" />
          Natural
        </button>
        <button
          onClick={() => setMode('faceted')}
          className={`px-3 py-1 text-sm rounded ${
            mode === 'faceted'
              ? 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300'
              : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
          }`}
        >
          <Filter className="w-3 h-3 inline mr-1" />
          Faceted
        </button>
        <button
          onClick={() => setMode('semantic')}
          className={`px-3 py-1 text-sm rounded ${
            mode === 'semantic'
              ? 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300'
              : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
          }`}
        >
          <Sparkles className="w-3 h-3 inline mr-1" />
          Semantic
        </button>
      </div>

      {/* Filters Drawer */}
      {showFilters && (
        <div className="mt-4 p-4 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700">
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Year From
              </label>
              <input
                type="number"
                value={filters.year_from || ''}
                onChange={(e) =>
                  setFilters({ ...filters, year_from: e.target.value ? parseInt(e.target.value) : undefined })
                }
                className="w-full px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Year To
              </label>
              <input
                type="number"
                value={filters.year_to || ''}
                onChange={(e) =>
                  setFilters({ ...filters, year_to: e.target.value ? parseInt(e.target.value) : undefined })
                }
                className="w-full px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Timeline Type
              </label>
              <select
                multiple
                value={filters.timeline_type || []}
                onChange={(e) => {
                  const selected = Array.from(e.target.selectedOptions, option => option.value);
                  setFilters({ ...filters, timeline_type: selected.length > 0 ? selected : undefined });
                }}
                className="w-full px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                size={3}
              >
                <option value="life_era">Life Era</option>
                <option value="sub_timeline">Sub-Timeline</option>
                <option value="skill">Skill</option>
                <option value="location">Location</option>
                <option value="work">Work</option>
                <option value="custom">Custom</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Emotion
              </label>
              <select
                multiple
                value={filters.emotion || []}
                onChange={(e) => {
                  const selected = Array.from(e.target.selectedOptions, option => option.value);
                  setFilters({ ...filters, emotion: selected.length > 0 ? selected : undefined });
                }}
                className="w-full px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                size={3}
              >
                <option value="happy">Happy</option>
                <option value="sad">Sad</option>
                <option value="angry">Angry</option>
                <option value="anxious">Anxious</option>
                <option value="calm">Calm</option>
                <option value="excited">Excited</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Tags (comma-separated)
            </label>
            <input
              type="text"
              placeholder="tag1, tag2, tag3"
              value={filters.tags?.join(', ') || ''}
              onChange={(e) => {
                const tags = e.target.value.split(',').map(t => t.trim()).filter(t => t);
                setFilters({ ...filters, tags: tags.length > 0 ? tags : undefined });
              }}
              className="w-full px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
            />
          </div>
        </div>
      )}
    </div>
  );
};
