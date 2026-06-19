import React, { useRef, useState, useMemo } from 'react';
import { ZoomIn, ZoomOut, Loader2 } from 'lucide-react';
import type { ChronologyEntry, Timeline } from '../../types/timelineV2';
import { MemoryCard } from './MemoryCard';
import { TIMELINE_RULER_AXIS_H, TimelineRulerTick } from '../timeline/TimelineDateDisplay';
import { buildMonthlyAxisTicks, buildQuadrennialAxisTicks } from '../timeline/timelineRulerTicks';

interface LinearTimelineViewProps {
  entries: ChronologyEntry[];
  selectedTimeline?: Timeline | null;
  onEntryClick?: (entry: ChronologyEntry) => void;
  loading?: boolean;
}

const MIN_PIXELS_PER_DAY = 0.1;
const MAX_PIXELS_PER_DAY = 365;
const DEFAULT_PIXELS_PER_DAY = 2;

export const LinearTimelineView: React.FC<LinearTimelineViewProps> = ({ entries, selectedTimeline, onEntryClick, loading = false }) => {
  const [pixelsPerDay, setPixelsPerDay] = useState(DEFAULT_PIXELS_PER_DAY);
  const [scrollLeft, setScrollLeft] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const { startDate, endDate, totalDays } = useMemo(() => {
    if (entries.length === 0) {
      const now = new Date();
      const oneYearAgo = new Date(now.getFullYear() - 1, 0, 1);
      return {
        startDate: oneYearAgo,
        endDate: now,
        totalDays: 365
      };
    }

    const dates = entries.map(e => new Date(e.start_time).getTime());
    const minDate = new Date(Math.min(...dates));
    const maxDate = new Date(Math.max(...dates));

    // Add padding
    minDate.setDate(minDate.getDate() - 30);
    maxDate.setDate(maxDate.getDate() + 30);

    return {
      startDate: minDate,
      endDate: maxDate,
      totalDays: Math.ceil((maxDate.getTime() - minDate.getTime()) / (1000 * 60 * 60 * 24))
    };
  }, [entries]);

  const getPositionForDate = (date: Date): number => {
    const daysDiff = Math.ceil((date.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    return daysDiff * pixelsPerDay;
  };

  const handleZoomIn = () => {
    setPixelsPerDay(prev => Math.min(MAX_PIXELS_PER_DAY, prev * 1.2));
  };

  const handleZoomOut = () => {
    setPixelsPerDay(prev => Math.max(MIN_PIXELS_PER_DAY, prev / 1.2));
  };

  return (
    <div className="h-full flex flex-col bg-gray-50 dark:bg-gray-900">
      {/* Zoom Controls */}
      <div className="flex items-center gap-2 p-2 border-b border-gray-200 dark:border-gray-700">
        <button
          onClick={handleZoomOut}
          className="p-2 border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
        >
          <ZoomOut className="w-4 h-4" />
        </button>
        <span className="text-sm text-gray-600 dark:text-gray-400">
          {pixelsPerDay.toFixed(1)} px/day
        </span>
        <button
          onClick={handleZoomIn}
          className="p-2 border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
        >
          <ZoomIn className="w-4 h-4" />
        </button>
      </div>

      {/* Timeline Canvas */}
      <div
        ref={containerRef}
        className="flex-1 overflow-auto"
        onScroll={(e) => setScrollLeft(e.currentTarget.scrollLeft)}
      >
        <div
          style={{
            width: `${totalDays * pixelsPerDay}px`,
            minHeight: '100%',
            position: 'relative'
          }}
        >
          {/* Timeline Band (if selected) */}
          {selectedTimeline && (
            <div
              className="absolute top-0 bg-blue-500/20 border-t-2 border-blue-500 z-5"
              style={{
                left: `${getPositionForDate(new Date(selectedTimeline.start_date))}px`,
                width: selectedTimeline.end_date
                  ? `${getPositionForDate(new Date(selectedTimeline.end_date)) - getPositionForDate(new Date(selectedTimeline.start_date))}px`
                  : `${totalDays * pixelsPerDay - getPositionForDate(new Date(selectedTimeline.start_date))}px`,
                height: '100%',
                pointerEvents: 'none'
              }}
            >
              <div className="sticky top-0 bg-blue-500/30 px-2 py-1 text-xs font-medium text-blue-900 dark:text-blue-100">
                {selectedTimeline.title}
              </div>
            </div>
          )}

          {/* Date ruler — months; Jan 'YY every 4 years when zoomed out */}
          <div
            className="sticky top-0 border-b-2 border-primary/40 bg-gradient-to-b from-primary/[0.14] via-gray-900 to-gray-950 z-10 relative"
            style={{ height: TIMELINE_RULER_AXIS_H }}
          >
            {(pixelsPerDay >= 2
              ? buildMonthlyAxisTicks(startDate, endDate, (d) => getPositionForDate(d))
              : buildQuadrennialAxisTicks(startDate, endDate, (d) => getPositionForDate(d))
            ).map((tick, i) => (
              <TimelineRulerTick key={i} x={tick.x} label={tick.label} major={tick.major} />
            ))}
          </div>

          {/* Entries */}
          <div style={{ marginTop: TIMELINE_RULER_AXIS_H }}>
            {loading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
              </div>
            ) : entries.length === 0 ? (
              <div className="flex items-center justify-center py-16 text-gray-500 dark:text-gray-400">
                No entries found
              </div>
            ) : (
              entries.map((entry, index) => {
                const position = getPositionForDate(new Date(entry.start_time));
                const width = entry.end_time
                  ? getPositionForDate(new Date(entry.end_time)) - position
                  : 200;

                return (
                  <div
                    key={entry.id}
                    className="absolute"
                    style={{
                      left: `${position}px`,
                      top: `${index * 80}px`,
                      width: `${Math.max(width, 200)}px`
                    }}
                  >
                    <MemoryCard
                      entry={entry}
                      compact
                      onExpand={() => onEntryClick?.(entry)}
                    />
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
