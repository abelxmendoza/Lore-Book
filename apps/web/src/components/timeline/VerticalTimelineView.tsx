import React, { useMemo } from 'react';
import { Calendar, ExternalLink, Tag } from 'lucide-react';
import { useChronology } from '../../hooks/useChronology';
import { useTimelineV2 } from '../../hooks/useTimelineV2';
import { useEntityModal } from '../../contexts/EntityModalContext';
import type { ChronologyEntry, Timeline } from '../../types/timelineV2';

interface VerticalTimelineViewProps {
  onEntrySelect?: (entry: ChronologyEntry) => void;
  onTimelineSelect?: (timeline: Timeline) => void;
  filteredEntries?: ChronologyEntry[];
  selectedTimelineId?: string | null;
}

export const VerticalTimelineView: React.FC<VerticalTimelineViewProps> = ({
  onEntrySelect,
  onTimelineSelect,
  filteredEntries,
  selectedTimelineId
}) => {
  // If filteredEntries is provided, use it directly (it's already filtered by timeline)
  // Otherwise, fetch entries based on selectedTimelineId
  const timelineIds = filteredEntries ? undefined : (selectedTimelineId ? [selectedTimelineId] : undefined);
  const { entries: chronologyEntries, loading: chronologyLoading } = useChronology(
    undefined,
    undefined,
    timelineIds
  );
  const { timelines, loading: timelinesLoading } = useTimelineV2();
  const { openMemory } = useEntityModal();

  // Use filtered entries if provided, otherwise use all entries
  const entriesToDisplay = filteredEntries || chronologyEntries;

  // Sort entries by date (newest first - most recent at top)
  const sortedEntries = useMemo(() => {
    const sorted = [...entriesToDisplay].sort((a, b) => {
      return new Date(b.start_time).getTime() - new Date(a.start_time).getTime();
    });
    // Most recent memories at the top
    return sorted;
  }, [entriesToDisplay]);

  const loading = chronologyLoading || timelinesLoading;

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-3" />
          <p className="text-sm text-white/60">Loading timeline...</p>
        </div>
      </div>
    );
  }

  if (sortedEntries.length === 0) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center max-w-md">
          <Calendar className="w-12 h-12 text-white/30 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-white mb-2">
            {selectedTimelineId ? 'No memories in this timeline' : 'No memories found'}
          </h3>
          <p className="text-sm text-white/60">
            {selectedTimelineId 
              ? 'This timeline doesn\'t have any memories yet'
              : 'Start journaling to see your timeline'}
          </p>
        </div>
      </div>
    );
  }

  // Get timeline colors for tags
  const getTimelineColor = (timelineId: string): string => {
    const timeline = timelines.find(t => t.id === timelineId);
    if (!timeline) return 'bg-primary/20 text-primary border-primary/30';
    
    const colorMap: Record<string, string> = {
      'life_era': 'bg-blue-500/20 text-blue-300 border-blue-500/30',
      'work': 'bg-green-500/20 text-green-300 border-green-500/30',
      'skill': 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
      'location': 'bg-purple-500/20 text-purple-300 border-purple-500/30',
      'custom': 'bg-pink-500/20 text-pink-300 border-pink-500/30'
    };
    
    return colorMap[timeline.timeline_type] || 'bg-primary/20 text-primary border-primary/30';
  };

  return (
    <div className="overflow-y-auto p-8" style={{ height: '100%', minHeight: 0, maxHeight: 'none' }}>
      <div className="max-w-4xl mx-auto relative">
        {/* Central Timeline Axis */}
        <div className="absolute left-1/2 top-0 bottom-0 w-0.5 bg-gradient-to-b from-primary/60 via-primary/40 to-primary/60 transform -translate-x-1/2" />

        {/* Timeline Entries */}
        <div className="relative space-y-12">
          {sortedEntries.map((entry, index) => {
            const isLeft = index % 2 === 0; // Alternate left/right
            const timelineName = entry.timeline_names?.[0] || 'Ungrouped';
            const timelineId = entry.timeline_memberships?.[0];
            const tagColor = timelineId ? getTimelineColor(timelineId) : 'bg-primary/20 text-primary border-primary/30';

            return (
              <div
                key={entry.id}
                className={`relative flex items-center ${isLeft ? 'flex-row' : 'flex-row-reverse'}`}
              >
                {/* Timeline Marker */}
                <div className="absolute left-1/2 transform -translate-x-1/2 w-4 h-4 rounded-full bg-primary border-4 border-black/40 shadow-lg z-10" />

                {/* Event Card */}
                <div
                  className={`w-[45%] ${isLeft ? 'pr-8' : 'pl-8'}`}
                >
                  <div
                    className="bg-black/60 border border-border/60 rounded-lg p-5 shadow-lg hover:border-primary/40 hover:bg-black/70 transition-all cursor-pointer backdrop-blur-sm group"
                    onClick={() => {
                      onEntrySelect?.(entry);
                      openMemory(entry);
                    }}
                  >
                    {/* Date */}
                    <div className={`text-xs text-white/60 mb-3 ${isLeft ? 'text-left' : 'text-right'}`}>
                      {new Date(entry.start_time).toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric'
                      })}
                    </div>

                    {/* Tag */}
                    <div className={`${isLeft ? 'flex justify-start' : 'flex justify-end'} mb-3`}>
                      <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border ${tagColor}`}>
                        <Tag className="w-3 h-3" />
                        {timelineName}
                      </span>
                    </div>

                    {/* Description */}
                    <p className="text-sm text-white/90 mb-4 leading-relaxed line-clamp-3 group-hover:text-white transition-colors">
                      {entry.content}
                    </p>

                    {/* Link/Action */}
                    <div className={`flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 transition-colors ${isLeft ? 'justify-start' : 'justify-end'}`}>
                      <span>View details</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </div>

                    {/* Connection Line to Timeline */}
                    <div
                      className={`absolute top-1/2 ${isLeft ? 'right-0' : 'left-0'} w-8 h-0.5 bg-gradient-to-r ${isLeft ? 'from-transparent via-border/40 to-border/60' : 'from-border/60 via-border/40 to-transparent'} transform -translate-y-1/2`}
                    />
                  </div>
                </div>

                {/* Spacer for opposite side */}
                <div className={`w-[45%] ${isLeft ? 'ml-auto' : 'mr-auto'}`} />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
