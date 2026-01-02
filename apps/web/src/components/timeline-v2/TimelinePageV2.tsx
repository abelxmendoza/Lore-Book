import React, { useState, useMemo } from 'react';
import { Layout, List, GitBranch, Info, Loader2, X } from 'lucide-react';
import { useTimelineV2 } from '../../hooks/useTimelineV2';
import { useChronology } from '../../hooks/useChronology';
import { useTimeline } from '../../hooks/useTimelineV2';
import { TimelineNavigator } from './TimelineNavigator';
import { TimelineSearch } from './TimelineSearch';
import { LinearTimelineView } from './LinearTimelineView';
import { HierarchicalTreeView } from './HierarchicalTreeView';
import { MemoryDetailModal } from './MemoryDetailModal';
import { fetchRelatedTimelines } from '../../api/timelineV2';
import type { Timeline, ChronologyEntry, TimelineSearchResult, TimelineRelationship } from '../../types/timelineV2';

type ViewMode = 'linear' | 'tree' | 'graph';

export const TimelinePageV2: React.FC = () => {
  const [selectedTimeline, setSelectedTimeline] = useState<Timeline | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('linear');
  const [searchResults, setSearchResults] = useState<TimelineSearchResult | null>(null);
  const [selectedEntry, setSelectedEntry] = useState<ChronologyEntry | null>(null);
  const [relatedTimelines, setRelatedTimelines] = useState<TimelineRelationship[]>([]);
  const [loadingRelated, setLoadingRelated] = useState(false);

  const { timelines, loading: timelinesLoading } = useTimelineV2();
  const { timeline: fullTimeline, loading: timelineLoading } = useTimeline(selectedTimeline?.id || null);
  
  // Filter chronology by selected timeline
  const timelineIds = selectedTimeline ? [selectedTimeline.id] : undefined;
  const { entries: chronologyEntries, loading: chronologyLoading } = useChronology(undefined, undefined, timelineIds);

  // Load related timelines when timeline is selected
  React.useEffect(() => {
    if (selectedTimeline?.id) {
      setLoadingRelated(true);
      fetchRelatedTimelines(selectedTimeline.id)
        .then(res => setRelatedTimelines(res.relationships))
        .catch(err => console.error('Failed to load related timelines:', err))
        .finally(() => setLoadingRelated(false));
    } else {
      setRelatedTimelines([]);
    }
  }, [selectedTimeline?.id]);

  const handleSelectTimeline = (timeline: Timeline) => {
    setSelectedTimeline(timeline);
    setSearchResults(null); // Clear search when selecting timeline
  };

  const handleSearchResults = (results: TimelineSearchResult) => {
    setSearchResults(results);
    setSelectedTimeline(null); // Clear timeline selection when searching
  };

  // Determine which entries to show
  const displayEntries = useMemo(() => {
    if (searchResults && searchResults.results.length > 0) {
      // Flatten search results into entries
      return searchResults.results.flatMap(result => 
        result.memories.map(memory => ({
          id: `search-${memory.id}`,
          user_id: '',
          journal_entry_id: memory.id,
          start_time: memory.date,
          end_time: null,
          time_precision: 'exact' as const,
          time_confidence: 1.0,
          content: memory.content,
          timeline_memberships: [result.timeline.id]
        }))
      );
    }
    return chronologyEntries;
  }, [searchResults, chronologyEntries]);

  return (
    <div className="h-screen flex flex-col bg-gray-50 dark:bg-gray-900">
      {/* Top Bar */}
      <div className="border-b border-gray-200 dark:border-gray-700">
        <TimelineSearch onResults={handleSearchResults} />

        {/* View Selector & Status */}
        <div className="flex items-center justify-between px-4 py-2 border-t border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600 dark:text-gray-400">View:</span>
            <button
              onClick={() => setViewMode('linear')}
              className={`flex items-center gap-1 px-3 py-1 text-sm rounded ${
                viewMode === 'linear'
                  ? 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
              }`}
            >
              <Layout className="w-4 h-4" />
              Linear
            </button>
            <button
              onClick={() => setViewMode('tree')}
              className={`flex items-center gap-1 px-3 py-1 text-sm rounded ${
                viewMode === 'tree'
                  ? 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
              }`}
            >
              <GitBranch className="w-4 h-4" />
              Tree
            </button>
            <button
              onClick={() => setViewMode('graph')}
              disabled
              className="flex items-center gap-1 px-3 py-1 text-sm rounded opacity-50 cursor-not-allowed"
              title="Graph view coming in v2"
            >
              <List className="w-4 h-4" />
              Graph (v2)
            </button>
          </div>

          {/* Status */}
          <div className="flex items-center gap-4 text-sm text-gray-600 dark:text-gray-400">
            {searchResults && (
              <div className="flex items-center gap-2">
                <span>{searchResults.total_count} result{searchResults.total_count !== 1 ? 's' : ''}</span>
                <button
                  onClick={() => setSearchResults(null)}
                  className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}
            {selectedTimeline && (
              <div className="flex items-center gap-2">
                <span>Filtered by: <strong>{selectedTimeline.title}</strong></span>
                <button
                  onClick={() => setSelectedTimeline(null)}
                  className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}
            {(chronologyLoading || timelinesLoading) && (
              <Loader2 className="w-4 h-4 animate-spin" />
            )}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Panel: Timeline Navigator */}
        <div className="w-64 flex-shrink-0">
          <TimelineNavigator
            timelines={timelines}
            selectedTimelineId={selectedTimeline?.id}
            onSelectTimeline={handleSelectTimeline}
            loading={timelinesLoading}
          />
        </div>

        {/* Center Panel: Main Canvas */}
        <div className="flex-1 overflow-hidden">
          {viewMode === 'linear' && (
            <LinearTimelineView
              entries={displayEntries}
              selectedTimeline={selectedTimeline}
              loading={chronologyLoading}
              onEntryClick={(entry) => {
                setSelectedEntry(entry);
              }}
            />
          )}
          {viewMode === 'tree' && (
            <HierarchicalTreeView
              timelines={timelines}
              onTimelineClick={handleSelectTimeline}
            />
          )}
          {viewMode === 'graph' && (
            <div className="h-full flex items-center justify-center text-gray-500 dark:text-gray-400">
              Graph view coming in v2
            </div>
          )}
        </div>

        {/* Right Panel: Context Inspector */}
        <div className="w-80 flex-shrink-0 border-l border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-y-auto">
          {selectedTimeline ? (
            <div className="p-4">
              <div className="flex items-center gap-2 mb-4">
                <Info className="w-5 h-5 text-gray-400" />
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                  Timeline Details
                </h2>
              </div>

              {timelineLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
                </div>
              ) : (
                <div className="space-y-4">
                  <div>
                    <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Title
                    </h3>
                    <p className="text-sm text-gray-900 dark:text-white">{selectedTimeline.title}</p>
                  </div>

                  {selectedTimeline.description && (
                    <div>
                      <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Description
                      </h3>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        {selectedTimeline.description}
                      </p>
                    </div>
                  )}

                  <div>
                    <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Type
                    </h3>
                    <p className="text-sm text-gray-900 dark:text-white capitalize">
                      {selectedTimeline.timeline_type.replace('_', ' ')}
                    </p>
                  </div>

                  <div>
                    <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Duration
                    </h3>
                    <p className="text-sm text-gray-900 dark:text-white">
                      {new Date(selectedTimeline.start_date).toLocaleDateString()} -{' '}
                      {selectedTimeline.end_date
                        ? new Date(selectedTimeline.end_date).toLocaleDateString()
                        : 'Ongoing'}
                    </p>
                  </div>

                  {(fullTimeline?.member_count !== undefined || selectedTimeline.member_count !== undefined) && (
                    <div>
                      <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Memories
                      </h3>
                      <p className="text-sm text-gray-900 dark:text-white">
                        {fullTimeline?.member_count ?? selectedTimeline.member_count ?? 0} memories
                      </p>
                    </div>
                  )}

                  {selectedTimeline.tags.length > 0 && (
                    <div>
                      <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Tags
                      </h3>
                      <div className="flex flex-wrap gap-1">
                        {selectedTimeline.tags.map(tag => (
                          <span
                            key={tag}
                            className="text-xs bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 px-2 py-0.5 rounded"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Related Timelines */}
                  {relatedTimelines.length > 0 && (
                    <div>
                      <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Related Timelines
                      </h3>
                      <div className="space-y-2">
                        {relatedTimelines.map(rel => (
                          <div
                            key={rel.id}
                            className="text-xs bg-blue-50 dark:bg-blue-900/20 p-2 rounded border border-blue-200 dark:border-blue-800"
                          >
                            <div className="font-medium text-blue-900 dark:text-blue-200 capitalize">
                              {rel.relationship_type}
                            </div>
                            {rel.description && (
                              <div className="text-blue-700 dark:text-blue-300 mt-1">
                                {rel.description}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Child Timelines */}
                  {fullTimeline?.children && fullTimeline.children.length > 0 && (
                    <div>
                      <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Sub-Timelines ({fullTimeline.children.length})
                      </h3>
                      <div className="space-y-1">
                        {fullTimeline.children.map(child => (
                          <button
                            key={child.id}
                            onClick={() => handleSelectTimeline(child)}
                            className="w-full text-left text-xs text-blue-600 dark:text-blue-400 hover:underline p-1 rounded"
                          >
                            {child.title}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : searchResults ? (
            <div className="p-4">
              <div className="flex items-center gap-2 mb-4">
                <Info className="w-5 h-5 text-gray-400" />
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                  Search Results
                </h2>
              </div>
              <div className="space-y-3">
                {searchResults.results.map((result, idx) => (
                  <div
                    key={idx}
                    className="p-3 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800"
                    onClick={() => handleSelectTimeline(result.timeline)}
                  >
                    <div className="font-medium text-sm text-gray-900 dark:text-white mb-1">
                      {result.timeline.title}
                    </div>
                    <div className="text-xs text-gray-600 dark:text-gray-400">
                      {result.memories.length} memor{result.memories.length !== 1 ? 'ies' : 'y'}
                      {result.relevance_score !== undefined && (
                        <span className="ml-2">• Score: {result.relevance_score.toFixed(1)}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="p-4 text-center text-sm text-gray-500 dark:text-gray-400">
              Select a timeline or search to view details
            </div>
          )}
        </div>
      </div>

      {/* Memory Detail Modal */}
      {selectedEntry && (
        <MemoryDetailModal
          entry={selectedEntry}
          onClose={() => setSelectedEntry(null)}
        />
      )}
    </div>
  );
};
