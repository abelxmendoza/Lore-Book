import React, { useMemo, useState } from 'react';
import { List, Calendar, Clock, Tag } from 'lucide-react';
import { useChronology } from '../../hooks/useChronology';
import { useTimelineV2 } from '../../hooks/useTimelineV2';
import { useEntityModal } from '../../contexts/EntityModalContext';
import type { ChronologyEntry, Timeline } from '../../types/timelineV2';

interface ListTimelineViewProps {
  onEntrySelect?: (entry: ChronologyEntry) => void;
  onTimelineSelect?: (timeline: Timeline) => void;
}

export const ListTimelineView: React.FC<ListTimelineViewProps> = ({
  onEntrySelect,
  onTimelineSelect
}) => {
  const { entries: chronologyEntries, loading: chronologyLoading } = useChronology();
  const { timelines, loading: timelinesLoading } = useTimelineV2();
  const { openMemory } = useEntityModal();
  const [sortBy, setSortBy] = useState<'date' | 'timeline'>('date');

  // Sort entries
  const sortedEntries = useMemo(() => {
    const sorted = [...chronologyEntries];
    if (sortBy === 'date') {
      sorted.sort((a, b) => 
        new Date(b.start_time).getTime() - new Date(a.start_time).getTime()
      );
    } else {
      sorted.sort((a, b) => {
        const aTimeline = a.timeline_names?.[0] || 'Ungrouped';
        const bTimeline = b.timeline_names?.[0] || 'Ungrouped';
        return aTimeline.localeCompare(bTimeline);
      });
    }
    return sorted;
  }, [chronologyEntries, sortBy]);

  const loading = chronologyLoading || timelinesLoading;

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-3" />
          <p className="text-sm text-white/60">Loading list...</p>
        </div>
      </div>
    );
  }

  if (sortedEntries.length === 0) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center max-w-md">
          <List className="w-12 h-12 text-white/30 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-white mb-2">No memories found</h3>
          <p className="text-sm text-white/60">Start journaling to see your memories here</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col overflow-hidden" style={{ height: '100%', minHeight: 0 }}>
      {/* Header with sort options */}
      <div className="flex items-center justify-between p-4 border-b border-border/60 bg-black/20 flex-shrink-0">
        <div className="flex items-center gap-2">
          <List className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-semibold text-white">
            {sortedEntries.length} {sortedEntries.length === 1 ? 'Memory' : 'Memories'}
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setSortBy('date')}
            className={`px-3 py-1.5 text-xs rounded transition-colors ${
              sortBy === 'date'
                ? 'bg-primary/20 text-white border border-primary/40'
                : 'bg-black/40 text-white/60 hover:text-white'
            }`}
          >
            <Clock className="w-3.5 h-3.5 inline mr-1" />
            Date
          </button>
          <button
            onClick={() => setSortBy('timeline')}
            className={`px-3 py-1.5 text-xs rounded transition-colors ${
              sortBy === 'timeline'
                ? 'bg-primary/20 text-white border border-primary/40'
                : 'bg-black/40 text-white/60 hover:text-white'
            }`}
          >
            <Tag className="w-3.5 h-3.5 inline mr-1" />
            Timeline
          </button>
        </div>
      </div>

      {/* List of entries */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {sortedEntries.map((entry) => (
          <div
            key={entry.id}
            className="bg-black/40 border border-border/60 rounded-lg p-4 cursor-pointer hover:border-primary/40 hover:bg-black/60 transition-all backdrop-blur-sm"
            onClick={() => {
              onEntrySelect?.(entry);
              openMemory(entry);
            }}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white/90 mb-2 line-clamp-3">{entry.content}</p>
                <div className="flex items-center gap-4 flex-wrap">
                  <div className="flex items-center gap-1.5 text-xs text-white/60">
                    <Calendar className="w-3.5 h-3.5" />
                    {new Date(entry.start_time).toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric'
                    })}
                  </div>
                  {entry.timeline_names && entry.timeline_names.length > 0 && (
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {entry.timeline_names.slice(0, 3).map((name, idx) => (
                        <span
                          key={idx}
                          className="text-xs px-2 py-0.5 bg-primary/20 text-primary border border-primary/30 rounded"
                        >
                          {name}
                        </span>
                      ))}
                      {entry.timeline_names.length > 3 && (
                        <span className="text-xs text-white/40">
                          +{entry.timeline_names.length - 3}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
              <div className="flex flex-col items-end gap-1 text-xs text-white/40">
                <span>Confidence: {(entry.time_confidence * 100).toFixed(0)}%</span>
                <span className="capitalize">{entry.time_precision}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
