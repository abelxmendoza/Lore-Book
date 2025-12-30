import React from 'react';
import { Calendar, Clock, Tag, Users, MapPin } from 'lucide-react';
import type { ChronologyEntry } from '../../types/timelineV2';

interface MemoryCardProps {
  entry: ChronologyEntry;
  onExpand?: () => void;
  compact?: boolean;
}

export const MemoryCard: React.FC<MemoryCardProps> = ({ entry, onExpand, compact = false }) => {
  const formatTime = (time: string, precision: string) => {
    const date = new Date(time);
    switch (precision) {
      case 'year':
        return date.getFullYear().toString();
      case 'month':
        return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short' });
      case 'day':
        return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
      default:
        return date.toLocaleString();
    }
  };

  const precisionLabel = {
    exact: 'Exact',
    day: 'Day',
    month: 'Month',
    year: 'Year',
    approximate: 'Approximate'
  }[entry.time_precision] || 'Unknown';

  return (
    <div
      className={`bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 cursor-pointer hover:shadow-md transition-shadow ${
        compact ? 'p-2' : ''
      }`}
      onClick={onExpand}
    >
      <div className="flex items-start justify-between mb-2">
        <h3 className={`font-semibold text-gray-900 dark:text-white ${compact ? 'text-sm' : 'text-base'}`}>
          {entry.content.substring(0, compact ? 50 : 100)}
          {entry.content.length > (compact ? 50 : 100) && '...'}
        </h3>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
        <div className="flex items-center gap-1">
          <Calendar className="w-3 h-3" />
          <span>{formatTime(entry.start_time, entry.time_precision)}</span>
        </div>

        {entry.end_time && (
          <div className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            <span>{formatTime(entry.end_time, entry.time_precision)}</span>
          </div>
        )}

        <div className="flex items-center gap-1">
          <span className="text-xs bg-blue-100 dark:bg-blue-900 px-2 py-0.5 rounded">
            {precisionLabel}
          </span>
          {entry.time_confidence < 1.0 && (
            <span className="text-xs text-yellow-600 dark:text-yellow-400">
              ({Math.round(entry.time_confidence * 100)}% confidence)
            </span>
          )}
        </div>
      </div>

      {entry.timeline_memberships.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {(entry.timeline_names || entry.timeline_memberships).slice(0, 3).map((timeline, idx) => {
            const timelineId = entry.timeline_memberships[idx];
            const timelineName = entry.timeline_names?.[idx] || timeline || 'Timeline';
            return (
              <span
                key={timelineId || idx}
                className="text-xs bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-200 px-2 py-0.5 rounded"
                title={timelineName}
              >
                {timelineName.length > 15 ? timelineName.substring(0, 15) + '...' : timelineName}
              </span>
            );
          })}
          {entry.timeline_memberships.length > 3 && (
            <span className="text-xs text-gray-500 dark:text-gray-400">
              +{entry.timeline_memberships.length - 3} more
            </span>
          )}
        </div>
      )}
    </div>
  );
};
