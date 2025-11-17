import { useMemo } from 'react';
import { timeEngine } from '../../utils/timeEngine';
import { TimeDisplay } from './TimeDisplay';

type ChronologicalItem<T = any> = {
  id: string;
  timestamp: Date | string;
  content: T;
  precision?: 'year' | 'month' | 'day' | 'hour' | 'minute' | 'second';
};

type ChronologicalTimelineProps<T = any> = {
  items: ChronologicalItem<T>[];
  renderItem: (item: T, index: number) => React.ReactNode;
  groupBy?: 'day' | 'week' | 'month' | 'year';
  showDates?: boolean;
  className?: string;
};

export const ChronologicalTimeline = <T,>({
  items,
  renderItem,
  groupBy = 'day',
  showDates = true,
  className = ''
}: ChronologicalTimelineProps<T>) => {
  const sorted = useMemo(() => {
    return timeEngine.sortChronologically(items);
  }, [items]);

  const grouped = useMemo(() => {
    return timeEngine.groupByTimePeriod(sorted, groupBy);
  }, [sorted, groupBy]);

  const sortedGroups = useMemo(() => {
    return Object.keys(grouped).sort((a, b) => {
      const dateA = new Date(a);
      const dateB = new Date(b);
      return dateB.getTime() - dateA.getTime(); // Most recent first
    });
  }, [grouped]);

  return (
    <div className={`space-y-6 ${className}`}>
      {sortedGroups.map((groupKey) => {
        const groupItems = grouped[groupKey];
        const firstItem = groupItems[0];
        const date = typeof firstItem.timestamp === 'string' 
          ? new Date(firstItem.timestamp) 
          : firstItem.timestamp;

        return (
          <div key={groupKey} className="space-y-4">
            {showDates && (
              <div className="sticky top-0 z-10 flex items-center gap-4 my-4 bg-black/80 backdrop-blur-sm py-2">
                <div className="flex-1 border-t border-border/30" />
                <div className="flex items-center gap-2 px-4 py-1 bg-black/60 rounded-full border border-border/30">
                  <TimeDisplay
                    timestamp={date}
                    precision={groupBy === 'year' ? 'year' : groupBy === 'month' ? 'month' : 'day'}
                    variant="compact"
                    showIcon={false}
                  />
                </div>
                <div className="flex-1 border-t border-border/30" />
              </div>
            )}
            
            <div className="space-y-3">
              {groupItems.map((item, index) => (
                <div key={item.id} className="flex gap-4">
                  <div className="flex flex-col items-center pt-1">
                    <div className="w-2 h-2 rounded-full bg-primary/50" />
                    {index < groupItems.length - 1 && (
                      <div className="w-px h-full bg-border/30 mt-1" />
                    )}
                  </div>
                  <div className="flex-1 pb-4">
                    {renderItem(item.content, index)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
};

