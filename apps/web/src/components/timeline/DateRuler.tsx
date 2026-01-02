import { useMemo } from 'react';

type DateRulerProps = {
  startDate: Date;
  endDate: Date;
  pixelsPerDay: number;
  scrollLeft: number;
  onDateClick?: (date: Date) => void;
};

export const DateRuler = ({
  startDate,
  endDate,
  pixelsPerDay,
  scrollLeft,
  onDateClick
}: DateRulerProps) => {
  const timelineWidth = (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24) * pixelsPerDay;
  
  // Calculate tick marks based on zoom level
  const tickMarks = useMemo(() => {
    const ticks: Array<{ date: Date; x: number; label: string; isMajor: boolean }> = [];
    const totalDays = (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24);
    
    // Determine tick interval based on zoom level
    let intervalDays: number;
    let format: (date: Date) => string;
    
    if (pixelsPerDay < 0.5) {
      // Very zoomed out - show years
      intervalDays = 365;
      format = (d) => d.getFullYear().toString();
    } else if (pixelsPerDay < 2) {
      // Zoomed out - show months
      intervalDays = 30;
      format = (d) => d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    } else if (pixelsPerDay < 10) {
      // Medium zoom - show weeks
      intervalDays = 7;
      format = (d) => {
        const weekStart = new Date(d);
        weekStart.setDate(d.getDate() - d.getDay());
        return weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      };
    } else {
      // Zoomed in - show days
      intervalDays = 1;
      format = (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
    
    const start = new Date(startDate);
    // Align to nice boundaries
    if (intervalDays >= 365) {
      start.setMonth(0, 1);
    } else if (intervalDays >= 30) {
      start.setDate(1);
    } else if (intervalDays >= 7) {
      const dayOfWeek = start.getDay();
      start.setDate(start.getDate() - dayOfWeek);
    }
    
    let current = new Date(start);
    while (current <= endDate) {
      const daysDiff = (current.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24);
      const x = daysDiff * pixelsPerDay;
      
      if (x >= -100 && x <= timelineWidth + 100) {
        ticks.push({
          date: new Date(current),
          x,
          label: format(current),
          isMajor: intervalDays >= 30 || (intervalDays === 7 && current.getDate() <= 7)
        });
      }
      
      // Move to next tick
      if (intervalDays >= 365) {
        current.setFullYear(current.getFullYear() + 1);
      } else if (intervalDays >= 30) {
        current.setMonth(current.getMonth() + 1);
      } else {
        current.setDate(current.getDate() + intervalDays);
      }
    }
    
    return ticks;
  }, [startDate, endDate, pixelsPerDay, timelineWidth]);
  
  // Current date indicator
  const now = new Date();
  const currentDateX = useMemo(() => {
    if (now < startDate || now > endDate) return null;
    const daysDiff = (now.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24);
    return daysDiff * pixelsPerDay;
  }, [startDate, endDate, pixelsPerDay]);

  return (
    <div
      className="h-16 border-b border-border/60 bg-black/50 relative select-none"
      style={{ width: `${Math.max(timelineWidth, window.innerWidth)}px` }}
    >
      <svg
        width={Math.max(timelineWidth, window.innerWidth)}
        height={64}
        className="block"
      >
        {/* Background grid lines */}
        {tickMarks.map((tick, idx) => (
          <line
            key={`grid-${idx}`}
            x1={tick.x}
            y1={0}
            x2={tick.x}
            y2={64}
            stroke={tick.isMajor ? 'rgba(255, 255, 255, 0.1)' : 'rgba(255, 255, 255, 0.05)'}
            strokeWidth={1}
          />
        ))}
        
        {/* Current date indicator */}
        {currentDateX !== null && (
          <g>
            <line
              x1={currentDateX}
              y1={0}
              x2={currentDateX}
              y2={64}
              stroke="#fbbf24"
              strokeWidth={2}
              opacity={0.8}
              className="animate-pulse"
            />
            <circle
              cx={currentDateX}
              cy={8}
              r={4}
              fill="#fbbf24"
            />
            <text
              x={currentDateX}
              y={20}
              fill="#fbbf24"
              fontSize="9"
              fontWeight="600"
              textAnchor="middle"
              className="select-none"
            >
              TODAY
            </text>
          </g>
        )}
        
        {/* Tick marks and labels */}
        {tickMarks.map((tick, idx) => (
          <g key={`tick-${idx}`}>
            <line
              x1={tick.x}
              y1={tick.isMajor ? 0 : 48}
              x2={tick.x}
              y2={64}
              stroke="rgba(255, 255, 255, 0.3)"
              strokeWidth={tick.isMajor ? 2 : 1}
            />
            {tick.isMajor && (
              <text
                x={tick.x}
                y={42}
                fill="rgba(255, 255, 255, 0.7)"
                fontSize="10"
                fontWeight="600"
                textAnchor="middle"
                className="select-none cursor-pointer hover:fill-white transition-colors"
                onClick={() => onDateClick?.(tick.date)}
              >
                {tick.label}
              </text>
            )}
          </g>
        ))}
      </svg>
    </div>
  );
};

