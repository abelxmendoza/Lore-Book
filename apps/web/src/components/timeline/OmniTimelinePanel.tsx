import { useMemo, useState, useCallback } from 'react';
import { Search, Sparkles, Calendar, X, Loader2, Layers, Network, List, Info } from 'lucide-react';
import { useChronology } from '../../hooks/useChronology';
import { useTimelineV2 } from '../../hooks/useTimelineV2';
import { searchTimelines } from '../../api/timelineV2';
import { ChronologyTimelineView } from './ChronologyTimelineView';
import { HierarchyTimelineView } from './HierarchyTimelineView';
import { GraphTimelineView } from './GraphTimelineView';
import { ListTimelineView } from './ListTimelineView';
import { VerticalTimelineView } from './VerticalTimelineView';
import { useEntityModal } from '../../contexts/EntityModalContext';
import { useCurrentContext } from '../../contexts/CurrentContextContext';
import { LayerDefinitions, type TimelineLayer } from './LayerDefinitions';
import { useMockData } from '../../contexts/MockDataContext';
import { MockDataIndicator } from '../MockDataIndicator';
import type { ChronologyEntry, Timeline } from '../../types/timelineV2';
import type { TimelineContextLayer } from '../../types/currentContext';
import { fetchJson } from '../../lib/api';
import { ThreadTimelineView } from '../threads/ThreadTimelineView';
import { ChatFirstViewHint } from '../ChatFirstViewHint';
import { GitBranch } from 'lucide-react';

type ViewMode = 'chronology' | 'hierarchy' | 'graph' | 'list' | 'vertical' | 'threads';

// Smart AI suggestions based on data
const getAISuggestions = (entries: ChronologyEntry[], timelines: Timeline[]) => {
  const suggestions = [];
  
  if (entries.length > 0) {
    const recentCount = entries.filter(e => {
      const daysAgo = (Date.now() - new Date(e.start_time).getTime()) / (1000 * 60 * 60 * 24);
      return daysAgo <= 30;
    }).length;
    
    if (recentCount > 0) {
      suggestions.push({
        label: `Last 30 days`,
        action: 'recent',
        count: recentCount
      });
    }
  }
  
  if (timelines.length > 0) {
    const activeTimeline = timelines.find(t => !t.end_date);
    if (activeTimeline) {
      suggestions.push({
        label: activeTimeline.title,
        action: 'timeline',
        timelineId: activeTimeline.id
      });
    }
  }
  
  return suggestions;
};

type ThreadItem = { id: string; name: string; description?: string | null; category?: string | null };

function timelineToContextLayer(timeline: Timeline): TimelineContextLayer {
  const layer = (timeline.metadata as Record<string, unknown>)?.layer;
  if (typeof layer === 'string' && ['era', 'saga', 'arc', 'chapter'].includes(layer)) {
    return layer as TimelineContextLayer;
  }
  if (timeline.timeline_type === 'life_era') return 'era';
  if (timeline.timeline_type === 'sub_timeline') return 'arc';
  return 'arc';
}

export const OmniTimelinePanel = () => {
  const { useMockData: isMockDataEnabled } = useMockData();
  const { setCurrentContext } = useCurrentContext();
  const [searchQuery, setSearchQuery] = useState('');
  const [timelineSearchQuery, setTimelineSearchQuery] = useState('');
  const [selectedTimelineId, setSelectedTimelineId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('vertical');
  const [selectedEntry, setSelectedEntry] = useState<ChronologyEntry | null>(null);
  const [selectedTimeline, setSelectedTimeline] = useState<Timeline | null>(null);
  const [timelineSearchResults, setTimelineSearchResults] = useState<Timeline[]>([]);
  const [timelineSearchLoading, setTimelineSearchLoading] = useState(false);
  const [autocompleteSuggestions, setAutocompleteSuggestions] = useState<Timeline[]>([]);
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const [selectedLayers, setSelectedLayers] = useState<TimelineLayer[]>([]);
  const [showLayerDefinitions, setShowLayerDefinitions] = useState(false);
  const [threads, setThreads] = useState<ThreadItem[]>([]);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [threadsLoading, setThreadsLoading] = useState(false);

  // Fetch timelines and chronology
  const { timelines, loading: timelinesLoading } = useTimelineV2();
  const timelineIds = selectedTimelineId ? [selectedTimelineId] : undefined;
  const { entries: chronologyEntries, loading: chronologyLoading } = useChronology(
    undefined,
    undefined,
    timelineIds
  );

  // Show mock data indicator when toggle is enabled
  // This helps users understand when they're viewing demo/mock data
  const isUsingMockData = isMockDataEnabled;

  // AI suggestions
  const suggestions = useMemo(() => getAISuggestions(chronologyEntries, timelines), [chronologyEntries, timelines]);

  // Filter entries by search
  const filteredEntries = useMemo(() => {
    if (!searchQuery.trim()) return chronologyEntries;
    
    const query = searchQuery.toLowerCase();
    return chronologyEntries.filter(
      entry =>
        entry.content.toLowerCase().includes(query) ||
        entry.timeline_names?.some(name => name.toLowerCase().includes(query))
    );
  }, [chronologyEntries, searchQuery]);

  const loading = chronologyLoading || timelinesLoading;

  useEffect(() => {
    if (viewMode !== 'threads') return;
    const loadThreads = async () => {
      setThreadsLoading(true);
      try {
        const list = await fetchJson<ThreadItem[]>('/api/threads');
        setThreads(list ?? []);
      } catch (e) {
        console.error('Failed to load threads:', e);
        setThreads([]);
      } finally {
        setThreadsLoading(false);
      }
    };
    loadThreads();
  }, [viewMode]);

  const handleThreadSelect = (thread: ThreadItem) => {
    setSelectedThreadId(thread.id);
    setCurrentContext({ kind: 'thread', threadId: thread.id });
  };

  const handleSuggestion = (suggestion: any) => {
    if (suggestion.action === 'timeline') {
      setSelectedTimelineId(suggestion.timelineId);
    }
  };

  const { openMemory, openCharacter, openLocation } = useEntityModal();

  const handleEntrySelect = (entry: ChronologyEntry) => {
    setSelectedEntry(entry);
    openMemory(entry);
  };

  const handleTimelineSelect = (timeline: Timeline) => {
    setSelectedTimeline(timeline);
    setSelectedTimelineId(timeline.id);
    setCurrentContext({
      kind: 'timeline',
      timelineNodeId: timeline.id,
      timelineLayer: timelineToContextLayer(timeline),
    });
    // Clear memory search when switching timelines
    setSearchQuery('');
    // Clear timeline search results and query
    setTimelineSearchResults([]);
    setTimelineSearchQuery('');
    setShowAutocomplete(false);
  };

  // Handle timeline search with layer filtering
  const handleTimelineSearch = useCallback(async (query: string) => {
    if (!query.trim()) {
      setTimelineSearchResults([]);
      return;
    }

    setTimelineSearchLoading(true);
    try {
      const filters: any = {};
      if (selectedLayers.length > 0) {
        filters.layer_type = selectedLayers;
      }
      const results = await searchTimelines(query, 'natural', filters);
      const foundTimelines = results.results.map(result => result.timeline);
      setTimelineSearchResults(foundTimelines);
    } catch (error) {
      console.error('Timeline search error:', error);
      setTimelineSearchResults([]);
    } finally {
      setTimelineSearchLoading(false);
    }
  }, [selectedLayers]);

  // Generate recommended timelines (ongoing, most significant, or recent)
  const recommendedTimelines = useMemo(() => {
    return timelines
      .filter(timeline => {
        // Exclude currently selected timeline from recommendations
        if (selectedTimelineId && timeline.id === selectedTimelineId) return false;
        // Prioritize: ongoing timelines, or those with recent activity
        const isOngoing = !timeline.end_date;
        const isRecent = timeline.updated_at && 
          (new Date(timeline.updated_at).getTime() > (Date.now() - 90 * 24 * 60 * 60 * 1000));
        return isOngoing || isRecent;
      })
      .sort((a, b) => {
        // Sort by: ongoing first, then by update date (most recent first)
        if (!a.end_date && b.end_date) return -1;
        if (a.end_date && !b.end_date) return 1;
        const aDate = new Date(a.updated_at || 0).getTime();
        const bDate = new Date(b.updated_at || 0).getTime();
        return bDate - aDate;
      })
      .slice(0, 4); // Show top 4 recommended
  }, [timelines, selectedTimelineId]);

  // Generate autocomplete suggestions from available timelines
  const autocompleteSuggestionsFiltered = useMemo(() => {
    if (!timelineSearchQuery.trim() || timelineSearchQuery.length < 2) {
      return [];
    }
    
    const query = timelineSearchQuery.toLowerCase();
    return timelines.filter(timeline => 
      timeline.title.toLowerCase().includes(query) ||
      timeline.description?.toLowerCase().includes(query) ||
      timeline.tags.some(tag => tag.toLowerCase().includes(query))
    ).slice(0, 5); // Limit to 5 suggestions
  }, [timelineSearchQuery, timelines]);

  // Debounced timeline search
  useMemo(() => {
    const timer = setTimeout(() => {
      if (timelineSearchQuery.trim()) {
        handleTimelineSearch(timelineSearchQuery);
      } else {
        setTimelineSearchResults([]);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [timelineSearchQuery, handleTimelineSearch]);

  return (
    <div className="space-y-6" data-testid="timeline">
      <ChatFirstViewHint />
      {/* Clean Header - Minimal */}
      <div className="border-b border-border/60 bg-opacity-70 bg-[radial-gradient(circle_at_top,_rgba(126,34,206,0.35),_transparent)] sticky top-0 z-10 flex-shrink-0 backdrop-blur-sm rounded-t-2xl"
      >
        <div className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-semibold text-white">
                  Timeline
                </h1>
                {isUsingMockData && (
                  <MockDataIndicator />
                )}
              </div>
              <p className="text-xs text-white/60 mt-0.5">
                {filteredEntries.length} {filteredEntries.length === 1 ? 'memory' : 'memories'}
                {selectedTimeline && ` • ${selectedTimeline.title}`}
                {!selectedTimelineId && ` • Omni Timeline (All Memories)`}
              </p>
            </div>
            
            {/* View Mode Selector */}
            <div className="flex items-center gap-1 bg-black/40 border border-border/60 rounded-lg p-1 backdrop-blur-sm">
              <button
                onClick={() => setViewMode('vertical')}
                className={`px-3 py-1.5 text-xs rounded transition-colors flex items-center gap-1.5 ${
                  viewMode === 'vertical'
                    ? 'bg-primary/20 text-white border border-primary/40 shadow-neon'
                    : 'text-white/60 hover:text-white hover:bg-white/5'
                }`}
                title="Vertical timeline"
              >
                <Calendar className="w-3.5 h-3.5" />
                Vertical
              </button>
              <button
                onClick={() => setViewMode('chronology')}
                className={`px-3 py-1.5 text-xs rounded transition-colors flex items-center gap-1.5 ${
                  viewMode === 'chronology'
                    ? 'bg-primary/20 text-white border border-primary/40 shadow-neon'
                    : 'text-white/60 hover:text-white hover:bg-white/5'
                }`}
                title="Chronological timeline"
              >
                <Calendar className="w-3.5 h-3.5" />
                Chronology
              </button>
              <button
                onClick={() => setViewMode('hierarchy')}
                className={`px-3 py-1.5 text-xs rounded transition-colors flex items-center gap-1.5 ${
                  viewMode === 'hierarchy'
                    ? 'bg-primary/20 text-white border border-primary/40 shadow-neon'
                    : 'text-white/60 hover:text-white hover:bg-white/5'
                }`}
                title="Hierarchical view"
              >
                <Layers className="w-3.5 h-3.5" />
                Hierarchy
              </button>
              <button
                onClick={() => setViewMode('graph')}
                className={`px-3 py-1.5 text-xs rounded transition-colors flex items-center gap-1.5 ${
                  viewMode === 'graph'
                    ? 'bg-primary/20 text-white border border-primary/40 shadow-neon'
                    : 'text-white/60 hover:text-white hover:bg-white/5'
                }`}
                title="Relationship graph"
              >
                <Network className="w-3.5 h-3.5" />
                Graph
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`px-3 py-1.5 text-xs rounded transition-colors flex items-center gap-1.5 ${
                  viewMode === 'list'
                    ? 'bg-primary/20 text-white border border-primary/40 shadow-neon'
                    : 'text-white/60 hover:text-white hover:bg-white/5'
                }`}
                title="List view"
              >
                <List className="w-3.5 h-3.5" />
                List
              </button>
              <button
                onClick={() => setViewMode('threads')}
                className={`px-3 py-1.5 text-xs rounded transition-colors flex items-center gap-1.5 ${
                  viewMode === 'threads'
                    ? 'bg-primary/20 text-white border border-primary/40 shadow-neon'
                    : 'text-white/60 hover:text-white hover:bg-white/5'
                }`}
                title="By thread"
              >
                <GitBranch className="w-3.5 h-3.5" />
                By thread
              </button>
            </div>
          </div>

          {/* Timeline Search - Primary with Autocomplete */}
          <div className="space-y-2 mb-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-white/40 z-10" />
              <input
                type="text"
                placeholder="Search timelines (e.g., 'fitness transformation', 'web development journey')..."
                value={timelineSearchQuery}
                onChange={(e) => {
                  setTimelineSearchQuery(e.target.value);
                  setShowAutocomplete(true);
                }}
                onFocus={() => setShowAutocomplete(true)}
                onBlur={(e) => {
                  // Only hide if clicking outside the autocomplete dropdown
                  const relatedTarget = e.relatedTarget as HTMLElement;
                  if (!relatedTarget || !relatedTarget.closest('.autocomplete-dropdown')) {
                    setTimeout(() => setShowAutocomplete(false), 200);
                  }
                }}
                className="w-full pl-10 pr-10 py-2 bg-black/40 border border-border/60 rounded-lg text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/40 transition-all backdrop-blur-sm"
              />
              <button
                onClick={() => setShowLayerDefinitions(!showLayerDefinitions)}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-white/40 hover:text-white/70 transition-colors z-10"
                title="View layer definitions"
              >
                <Info className="w-4 h-4" />
              </button>
              {timelineSearchLoading && (
                <div className="absolute right-10 top-1/2 transform -translate-y-1/2">
                  <Loader2 className="w-4 h-4 animate-spin text-primary" />
                </div>
              )}
              {timelineSearchQuery && !timelineSearchLoading && (
                <button
                  onClick={() => {
                    setTimelineSearchQuery('');
                    setTimelineSearchResults([]);
                    setSelectedTimelineId(null);
                    setSelectedTimeline(null);
                    setShowAutocomplete(false);
                  }}
                  className="absolute right-10 top-1/2 transform -translate-y-1/2 text-white/40 hover:text-white/60 z-10"
                >
                  <X className="w-4 h-4" />
                </button>
              )}

              {/* Autocomplete Dropdown */}
              {showAutocomplete && autocompleteSuggestionsFiltered.length > 0 && (
                <div className="autocomplete-dropdown absolute top-full left-0 right-0 mt-1 bg-black/90 border border-border/60 rounded-lg shadow-lg z-50 max-h-60 overflow-y-auto">
                  {autocompleteSuggestionsFiltered.map((timeline) => (
                    <button
                      key={timeline.id}
                      type="button"
                      onMouseDown={(e) => {
                        // Use onMouseDown instead of onClick to prevent blur from firing first
                        e.preventDefault();
                        handleTimelineSelect(timeline);
                        setTimelineSearchQuery(timeline.title);
                        setShowAutocomplete(false);
                      }}
                      className="w-full text-left px-4 py-3 hover:bg-primary/20 transition-colors border-b border-border/40 last:border-b-0 cursor-pointer"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-white truncate">{timeline.title}</p>
                          {timeline.description && (
                            <p className="text-xs text-white/60 mt-0.5 line-clamp-1">{timeline.description}</p>
                          )}
                          <div className="flex items-center gap-2 mt-1.5">
                            <span className="text-[10px] text-white/50 capitalize px-2 py-0.5 bg-primary/20 rounded">
                              {timeline.timeline_type.replace('_', ' ')}
                            </span>
                            {timeline.tags.length > 0 && (
                              <span className="text-[10px] text-white/40">
                                {timeline.tags.slice(0, 2).join(', ')}
                              </span>
                            )}
                          </div>
                        </div>
                        <Search className="w-4 h-4 text-white/40 flex-shrink-0 ml-2" />
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
            
            {/* Layer Filter Pills */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-white/50">Filter by layer:</span>
              {(['mythos', 'epoch', 'era', 'saga', 'arc', 'chapter', 'scene', 'action', 'microaction'] as TimelineLayer[]).map((layer) => {
                const isSelected = selectedLayers.includes(layer);
                return (
                  <button
                    key={layer}
                    onClick={() => {
                      setSelectedLayers(prev => 
                        isSelected 
                          ? prev.filter(l => l !== layer)
                          : [...prev, layer]
                      );
                    }}
                    className={`px-2 py-0.5 rounded text-xs font-medium transition-colors border ${
                      isSelected
                        ? 'bg-primary/20 text-white border-primary/40'
                        : 'bg-black/40 text-white/60 border-border/60 hover:border-primary/40'
                    }`}
                  >
                    {layer.charAt(0).toUpperCase() + layer.slice(1)}
                  </button>
                );
              })}
              {selectedLayers.length > 0 && (
                <button
                  onClick={() => setSelectedLayers([])}
                  className="px-2 py-0.5 rounded text-xs text-white/50 hover:text-white/80 transition-colors"
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          {/* Timeline Search Results */}
          {timelineSearchResults.length > 0 && (
            <div className="mb-3 space-y-2">
              <p className="text-xs text-white/60">Select a timeline to view its memories:</p>
              <div className="flex flex-wrap gap-2">
                {timelineSearchResults.map((timeline) => (
                  <button
                    key={timeline.id}
                    onClick={() => handleTimelineSelect(timeline)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
                      selectedTimelineId === timeline.id
                        ? 'bg-primary/20 text-white border-primary/40'
                        : 'bg-black/40 text-white/80 border-border/60 hover:border-primary/40 hover:bg-black/60'
                    }`}
                  >
                    {timeline.title}
                    <span className="ml-1.5 text-white/50 text-[10px] capitalize">
                      ({timeline.timeline_type.replace('_', ' ')})
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Recommended Timelines - Always show, even when one is selected */}
          {recommendedTimelines.length > 0 && (
            <div className="mb-3 space-y-2">
              <div className="flex items-center gap-2">
                <Sparkles className="w-3.5 h-3.5 text-primary" />
                <p className="text-xs text-white/60">Recommended Timelines</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => {
                    setSelectedTimelineId(null);
                    setSelectedTimeline(null);
                    setCurrentContext({ kind: 'none' });
                    setSearchQuery('');
                    setTimelineSearchQuery('');
                    setTimelineSearchResults([]);
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
                    !selectedTimelineId
                      ? 'bg-primary/20 text-white border-primary/40'
                      : 'bg-black/40 text-white/80 border-border/60 hover:border-primary/40 hover:bg-black/60'
                  }`}
                >
                  <span className="flex items-center gap-1.5">
                    <Calendar className="w-3 h-3" />
                    Omni Timeline
                    <span className="text-white/50 text-[10px]">(All Memories)</span>
                  </span>
                </button>
                {recommendedTimelines.map((timeline) => (
                  <button
                    key={timeline.id}
                    onClick={() => handleTimelineSelect(timeline)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
                      selectedTimelineId === timeline.id
                        ? 'bg-primary/20 text-white border-primary/40'
                        : 'bg-black/40 text-white/80 border-border/60 hover:border-primary/40 hover:bg-black/60'
                    }`}
                  >
                    {timeline.title}
                    {!timeline.end_date && (
                      <span className="ml-1.5 text-primary/70 text-[10px]">●</span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Memory Search - Secondary */}
          {selectedTimelineId && (
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-white/40" />
              <input
                type="text"
                placeholder={`Search memories in ${selectedTimeline?.title || 'timeline'}...`}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-black/40 border border-border/60 rounded-lg text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/40 transition-all backdrop-blur-sm"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-white/40 hover:text-white/60"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          )}

          {/* Layer Definitions Modal/Expansion */}
          {showLayerDefinitions && (
            <div className="mt-4 p-4 bg-black/60 border border-border/60 rounded-lg max-h-[600px] overflow-y-auto">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-white">Timeline Layers Explained</h3>
                <button
                  onClick={() => setShowLayerDefinitions(false)}
                  className="text-white/40 hover:text-white/70"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <LayerDefinitions 
                selectedLayers={selectedLayers}
                onLayerToggle={(layer) => {
                  setSelectedLayers(prev => 
                    prev.includes(layer)
                      ? prev.filter(l => l !== layer)
                      : [...prev, layer]
                  );
                }}
                showFilters={true}
              />
            </div>
          )}

          {/* AI Suggestions - Minimal */}
          {suggestions.length > 0 && !searchQuery && (
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <Sparkles className="w-3.5 h-3.5 text-blue-500" />
              {suggestions.map((suggestion, idx) => (
                <button
                  key={idx}
                  onClick={() => handleSuggestion(suggestion)}
                  className="text-xs px-2.5 py-1 rounded-full bg-primary/20 text-primary border border-primary/30 hover:bg-primary/30 transition-colors"
                >
                  {suggestion.label}
                  {suggestion.count && (
                    <span className="ml-1 text-blue-500">({suggestion.count})</span>
                  )}
                </button>
              ))}
            </div>
          )}

          {/* Active Filters - Minimal */}
          {selectedTimeline && (
            <div className="flex items-center gap-2 mt-2">
              <button
                onClick={() => setSelectedTimelineId(null)}
                className="text-xs px-2.5 py-1 rounded-full bg-black/40 border border-border/60 text-white/80 hover:bg-black/60 transition-colors flex items-center gap-1"
              >
                {selectedTimeline.title}
                <X className="w-3 h-3" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Main Content Area - Three Panel Layout */}
      <div className="flex-1 flex overflow-hidden rounded-2xl border border-border/60 bg-transparent shadow-panel" 
        style={{ minHeight: 'calc(100vh - 20rem)' }}
      >
        {/* Left: Time Scale (only for chronology view) */}
        {viewMode === 'chronology' && (
          <div className="w-16 flex-shrink-0 border-r border-border/60 bg-transparent overflow-y-auto">
            {/* Time scale will be handled by vis-timeline */}
          </div>
        )}

        {/* Center: Timeline Canvas - Scrollable (both directions) */}
        <div className="flex-1 overflow-auto timeline-scrollable"
          style={{
            height: '100%',
            minHeight: 0
          }}
        >
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <Loader2 className="w-8 h-8 animate-spin text-blue-500 mx-auto mb-3" />
                <p className="text-sm text-white/60">Loading timeline...</p>
              </div>
            </div>
          ) : viewMode === 'chronology' ? (
            <ChronologyTimelineView
              onEntrySelect={handleEntrySelect}
              onTimelineSelect={handleTimelineSelect}
            />
          ) : viewMode === 'hierarchy' ? (
            <HierarchyTimelineView
              onEntrySelect={handleEntrySelect}
              onTimelineSelect={handleTimelineSelect}
            />
          ) : viewMode === 'graph' ? (
            <GraphTimelineView
              onEntrySelect={handleEntrySelect}
              onTimelineSelect={handleTimelineSelect}
            />
          ) : viewMode === 'list' ? (
            <ListTimelineView
              onEntrySelect={handleEntrySelect}
              onTimelineSelect={handleTimelineSelect}
            />
          ) : viewMode === 'vertical' ? (
            <VerticalTimelineView
              onEntrySelect={handleEntrySelect}
              onTimelineSelect={handleTimelineSelect}
              filteredEntries={filteredEntries}
              selectedTimelineId={selectedTimelineId}
            />
          ) : viewMode === 'threads' ? (
            <div className="flex h-full gap-4 p-4">
              <div className="w-56 flex-shrink-0 space-y-2">
                <h3 className="text-sm font-semibold text-white">Threads</h3>
                {threadsLoading ? (
                  <p className="text-xs text-white/60">Loading…</p>
                ) : threads.length === 0 ? (
                  <p className="text-xs text-white/60">No threads yet.</p>
                ) : (
                  <div className="space-y-1">
                    {threads.map((t) => (
                      <button
                        key={t.id}
                        onClick={() => handleThreadSelect(t)}
                        className={`block w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                          selectedThreadId === t.id
                            ? 'bg-primary/20 text-white border border-primary/40'
                            : 'bg-black/40 text-white/80 border border-transparent hover:bg-black/60 hover:border-border/60'
                        }`}
                      >
                        {t.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                {selectedThreadId ? (
                  <ThreadTimelineView
                    threadId={selectedThreadId}
                    threadName={threads.find((t) => t.id === selectedThreadId)?.name}
                  />
                ) : (
                  <div className="flex items-center justify-center h-48 text-white/50 text-sm">
                    Select a thread
                  </div>
                )}
              </div>
            </div>
          ) : null}
        </div>

        {/* Right: Context Panel (only when something is selected) */}
        {(selectedEntry || selectedTimeline) && (
          <div className="w-80 flex-shrink-0 border-l border-border/60 bg-transparent overflow-y-auto backdrop-blur-sm">
            <div className="p-4">
              {selectedEntry && (
                <div>
                  <h3 className="text-sm font-semibold text-white mb-2">
                    Memory Details
                  </h3>
                  <p className="text-sm text-white/80 mb-3">
                    {selectedEntry.content}
                  </p>
                  <div className="text-xs text-white/60">
                    {new Date(selectedEntry.start_time).toLocaleDateString()}
                  </div>
                </div>
              )}
              {selectedTimeline && (
                <div>
                  <h3 className="text-sm font-semibold text-white mb-2">
                    Timeline Details
                  </h3>
                  <p className="text-sm text-white/80 mb-3">
                    {selectedTimeline.description || 'No description'}
                  </p>
                  <div className="text-xs text-white/60">
                    {new Date(selectedTimeline.start_date).toLocaleDateString()} -{' '}
                    {selectedTimeline.end_date
                      ? new Date(selectedTimeline.end_date).toLocaleDateString()
                      : 'Ongoing'}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
