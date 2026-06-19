import { useMemo } from 'react';
import { TIMELINE_RULER_AXIS_H } from './TimelineDateDisplay';
import {
  buildMonthlyAxisTicks,
  buildQuadrennialAxisTicks,
} from './timelineRulerTicks';

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
  onDateClick
}: DateRulerProps) => {
  const timelineWidth = (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24) * pixelsPerDay;

  const ticksWithDates = useMemo(() => {
    const xOf = (date: Date) => {
      const daysDiff = (date.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24);
      return daysDiff * pixelsPerDay;
    };

    if (pixelsPerDay >= 0.5) {
      const months = buildMonthlyAxisTicks(startDate, endDate, xOf);
      const filtered = pixelsPerDay >= 2 ? months : months.filter((_, i) => i % 3 === 0);
      return filtered.map((tick) => {
        const days = tick.x / pixelsPerDay;
        const date = new Date(startDate.getTime() + days * 86400000);
        return { date, x: tick.x, label: tick.label, isMajor: tick.major };
      });
    }

    return buildQuadrennialAxisTicks(startDate, endDate, xOf).map((tick) => {
      const days = tick.x / pixelsPerDay;
      const date = new Date(startDate.getTime() + days * 86400000);
      return { date, x: tick.x, label: tick.label, isMajor: true };
    });
  }, [startDate, endDate, pixelsPerDay]);

  const now = new Date();
  const currentDateX = useMemo(() => {
    if (now < startDate || now > endDate) return null;
    const daysDiff = (now.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24);
    return daysDiff * pixelsPerDay;
  }, [startDate, endDate, pixelsPerDay, now]);

  const width = Math.max(timelineWidth, typeof window !== 'undefined' ? window.innerWidth : 800);
  const height = TIMELINE_RULER_AXIS_H;

  return (
    <div
      className="border-b-2 border-primary/40 bg-gradient-to-b from-primary/[0.14] via-black/90 to-black/95 relative select-none shadow-[inset_0_-1px_0_rgba(255,255,255,0.06)]"
      style={{ width: `${width}px`, height }}
    >
      <svg width={width} height={height} className="block">
        {ticksWithDates.map((tick, idx) => (
          <line
            key={`grid-${idx}`}
            x1={tick.x}
            y1={0}
            x2={tick.x}
            y2={height}
            stroke={tick.isMajor ? 'rgba(99, 102, 241, 0.22)' : 'rgba(255, 255, 255, 0.06)'}
            strokeWidth={1}
          />
        ))}

        {currentDateX !== null && (
          <g>
            <line x1={currentDateX} y1={0} x2={currentDateX} y2={height} stroke="#fbbf24" strokeWidth={2} opacity={0.9} />
            <circle cx={currentDateX} cy={10} r={4} fill="#fbbf24" />
            <text x={currentDateX} y={22} fill="#fbbf24" fontSize="9" fontWeight="700" textAnchor="middle" className="select-none">
              TODAY
            </text>
          </g>
        )}

        {ticksWithDates.map((tick, idx) => (
          <g key={`tick-${idx}`}>
            <line
              x1={tick.x}
              y1={tick.isMajor ? 4 : height - 14}
              x2={tick.x}
              y2={height - 4}
              stroke={tick.isMajor ? 'rgba(129, 140, 248, 0.85)' : 'rgba(255, 255, 255, 0.35)'}
              strokeWidth={tick.isMajor ? 2 : 1}
            />
            <text
              x={tick.x}
              y={tick.isMajor ? height - 22 : height - 18}
              fill={tick.isMajor ? '#ffffff' : 'rgba(255,255,255,0.55)'}
              fontSize={tick.isMajor ? 11 : 9}
              fontWeight={tick.isMajor ? 700 : 600}
              fontFamily="ui-monospace, monospace"
              textAnchor="middle"
              className="select-none cursor-pointer"
              onClick={() => onDateClick?.(tick.date)}
            >
              {tick.label}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
};
