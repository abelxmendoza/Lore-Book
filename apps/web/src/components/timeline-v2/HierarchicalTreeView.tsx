import React, { useState } from 'react';
import { ChevronRight, ChevronDown, Calendar } from 'lucide-react';
import type { Timeline } from '../../types/timelineV2';

interface HierarchicalTreeViewProps {
  timelines: Timeline[];
  onTimelineClick?: (timeline: Timeline) => void;
}

export const HierarchicalTreeView: React.FC<HierarchicalTreeViewProps> = ({
  timelines,
  onTimelineClick
}) => {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const rootTimelines = timelines.filter(t => !t.parent_id);

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

  const getChildren = (parentId: string): Timeline[] => {
    return timelines.filter(t => t.parent_id === parentId);
  };

  const renderTimeline = (timeline: Timeline, level: number = 0): React.ReactNode => {
    const isExpanded = expandedIds.has(timeline.id);
    const children = getChildren(timeline.id);
    const hasChildren = children.length > 0;

    return (
      <div key={timeline.id} className="select-none">
        <div
          className={`flex items-center gap-2 px-3 py-2 rounded cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 ${
            level === 0 ? 'font-semibold' : ''
          }`}
          style={{ paddingLeft: `${level * 1.5 + 0.75}rem` }}
          onClick={() => onTimelineClick?.(timeline)}
        >
          {hasChildren ? (
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

          <div className="flex-1">
            <div className="text-sm text-gray-900 dark:text-white">{timeline.title}</div>
            {timeline.description && (
              <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                {timeline.description}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
            <Calendar className="w-3 h-3" />
            <span>{new Date(timeline.start_date).getFullYear()}</span>
            {timeline.member_count !== undefined && timeline.member_count > 0 && (
              <span className="bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded">
                {timeline.member_count}
              </span>
            )}
          </div>
        </div>

        {isExpanded && hasChildren && (
          <div>
            {children.map(child => renderTimeline(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="h-full overflow-auto p-4 bg-white dark:bg-gray-900">
      {rootTimelines.length === 0 ? (
        <div className="text-center text-sm text-gray-500 dark:text-gray-400 py-8">
          No timelines found
        </div>
      ) : (
        rootTimelines.map(timeline => renderTimeline(timeline))
      )}
    </div>
  );
};
