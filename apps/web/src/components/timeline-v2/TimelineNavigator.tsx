import React, { useState, useMemo } from 'react';
import { ChevronRight, ChevronDown, Star, Filter, Search, Loader2 } from 'lucide-react';
import type { Timeline, TimelineType } from '../../types/timelineV2';

interface TimelineNavigatorProps {
  timelines: Timeline[];
  selectedTimelineId?: string | null;
  onSelectTimeline: (timeline: Timeline) => void;
  onFilterChange?: (type: TimelineType | null) => void;
  loading?: boolean;
}

export const TimelineNavigator: React.FC<TimelineNavigatorProps> = ({
  timelines,
  selectedTimelineId,
  onSelectTimeline,
  onFilterChange,
  loading = false
}) => {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [filterType, setFilterType] = useState<TimelineType | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const rootTimelines = useMemo(() => {
    return timelines.filter(t => !t.parent_id);
  }, [timelines]);

  const filteredTimelines = useMemo(() => {
    let filtered = timelines;
    
    if (filterType) {
      filtered = filtered.filter(t => t.timeline_type === filterType);
    }
    
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(t => 
        t.title.toLowerCase().includes(query) ||
        t.description?.toLowerCase().includes(query)
      );
    }
    
    return filtered;
  }, [timelines, filterType, searchQuery]);

  const toggleExpand = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleFilterChange = (type: TimelineType | null) => {
    setFilterType(type);
    onFilterChange?.(type);
  };

  const renderTimeline = (timeline: Timeline, level: number = 0): React.ReactNode => {
    const isExpanded = expandedIds.has(timeline.id);
    const isSelected = timeline.id === selectedTimelineId;
    const children = filteredTimelines.filter(t => t.parent_id === timeline.id);

    return (
      <div key={timeline.id} className="select-none">
        <div
          className={`flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 ${
            isSelected ? 'bg-blue-100 dark:bg-blue-900' : ''
          }`}
          style={{ paddingLeft: `${level * 1.5 + 0.5}rem` }}
          onClick={() => onSelectTimeline(timeline)}
        >
          {children.length > 0 ? (
            <button
              onClick={(e) => {
                e.stopPropagation();
                toggleExpand(timeline.id);
              }}
              className="p-0.5 hover:bg-gray-200 dark:hover:bg-gray-600 rounded"
            >
              {isExpanded ? (
                <ChevronDown className="w-4 h-4" />
              ) : (
                <ChevronRight className="w-4 h-4" />
              )}
            </button>
          ) : (
            <div className="w-5" />
          )}

          <span className="flex-1 text-sm font-medium text-gray-900 dark:text-white truncate">
            {timeline.title}
          </span>

          {timeline.member_count !== undefined && timeline.member_count > 0 && (
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {timeline.member_count}
            </span>
          )}

          <Star className="w-4 h-4 text-gray-400 hover:text-yellow-400" />
        </div>

        {isExpanded && children.length > 0 && (
          <div>
            {children.map(child => renderTimeline(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="h-full flex flex-col bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700">
      {/* Header */}
      <div className="p-3 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-2 mb-2">
          <Search className="w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search timelines..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="flex-1 text-sm px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
          />
        </div>

        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-gray-400" />
          <select
            value={filterType || ''}
            onChange={(e) => handleFilterChange(e.target.value as TimelineType || null)}
            className="flex-1 text-sm px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
          >
            <option value="">All Types</option>
            <option value="life_era">Life Eras</option>
            <option value="sub_timeline">Sub-Timelines</option>
            <option value="skill">Skills</option>
            <option value="location">Locations</option>
            <option value="work">Work</option>
            <option value="custom">Custom</option>
          </select>
        </div>
      </div>

      {/* Timeline Tree */}
      <div className="flex-1 overflow-y-auto p-2">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
          </div>
        ) : rootTimelines.length === 0 ? (
          <div className="text-center text-sm text-gray-500 dark:text-gray-400 py-8">
            {filteredTimelines.length === 0 && timelines.length > 0
              ? 'No timelines match your filters'
              : 'No timelines found'}
          </div>
        ) : (
          rootTimelines.map(timeline => renderTimeline(timeline))
        )}
      </div>
    </div>
  );
};
