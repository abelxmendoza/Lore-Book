import { useMemo } from 'react';
import { MemoryDot } from './MemoryDot';
import type { TimelineEntry } from '../../hooks/useTimelineData';

type TimelineLanesProps = {
  entries: TimelineEntry[];
  lanes: string[];
  startDate: Date;
  endDate: Date;
  pixelsPerDay: number;
  scrollLeft: number;
  onScrollChange: (scrollLeft: number) => void;
  onMemoryHover: (entry: TimelineEntry, x: number, y: number) => void;
  onMemoryHoverOut: () => void;
  onMemoryClick: (entry: TimelineEntry) => void;
  onMemoryDoubleClick?: (entry: TimelineEntry) => void;
  onMemoryCtrlClick?: (entry: TimelineEntry) => void;
  linkingMode?: boolean;
  showConnections?: boolean;
};

const LANE_COLORS: Record<string, string> = {
  life: '#9ca3af',
  robotics: '#60a5fa',
  mma: '#f87171',
  work: '#fbbf24',
  creative: '#a78bfa'
};

const LANE_LABELS: Record<string, string> = {
  life: 'LIFE',
  robotics: 'ROBOTICS',
  mma: 'MMA',
  work: 'WORK/FINANCE',
  creative: 'CREATIVE'
};

export const TimelineLanes = ({
  entries,
  lanes,
  startDate,
  endDate,
  pixelsPerDay,
  scrollLeft,
  onScrollChange,
  onMemoryHover,
  onMemoryHoverOut,
  onMemoryClick,
  onMemoryDoubleClick,
  onMemoryCtrlClick,
  linkingMode = false,
  showConnections = true
}: TimelineLanesProps) => {
  // Scroll is now handled by parent container, so we don't need individual scroll handling here

  const calculateX = (timestamp: string) => {
    const entryDate = new Date(timestamp);
    const daysDiff = (entryDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24);
    return daysDiff * pixelsPerDay;
  };

  const timelineWidth = (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24) * pixelsPerDay;
  const laneHeight = 60;

  // Group entries by lane
  const entriesByLane = lanes.reduce((acc, lane) => {
    acc[lane] = entries.filter(e => e.lane === lane);
    return acc;
  }, {} as Record<string, TimelineEntry[]>);

  // Create entry lookup map and calculate positions
  const entryPositions = useMemo(() => {
    const positions = new Map<string, { x: number; y: number; entry: TimelineEntry }>();
    lanes.forEach((lane, laneIndex) => {
      const laneEntries = entriesByLane[lane] || [];
      laneEntries.forEach((entry) => {
        const x = calculateX(entry.timestamp);
        const y = laneIndex * laneHeight + laneHeight / 2;
        positions.set(entry.id, { x, y, entry });
      });
    });
    return positions;
  }, [entries, lanes, entriesByLane, startDate, pixelsPerDay, laneHeight]);

  // Calculate connection lines between related memories
  const connections = useMemo(() => {
    if (!showConnections) return [];
    
    const lines: Array<{ x1: number; y1: number; x2: number; y2: number; opacity: number }> = [];
    const drawn = new Set<string>();
    
    entries.forEach((entry) => {
      const pos1 = entryPositions.get(entry.id);
      if (!pos1) return;
      
      entry.related_entry_ids.forEach((relatedId) => {
        const key = [entry.id, relatedId].sort().join('-');
        if (drawn.has(key)) return;
        
        const pos2 = entryPositions.get(relatedId);
        if (!pos2) return;
        
        // Only draw if entries are reasonably close (within visible range)
        const distance = Math.abs(pos2.x - pos1.x);
        if (distance > timelineWidth * 2) return; // Skip very long connections
        
        drawn.add(key);
        lines.push({
          x1: pos1.x,
          y1: pos1.y,
          x2: pos2.x,
          y2: pos2.y,
          opacity: Math.max(0.15, 0.4 - distance / timelineWidth) // Fade based on distance
        });
      });
    });
    
    return lines;
  }, [entries, entryPositions, showConnections, timelineWidth]);

  return (
    <div className="bg-black/20 relative" style={{ width: `${Math.max(timelineWidth, window.innerWidth)}px` }}>
      <svg
        width={Math.max(timelineWidth, window.innerWidth)}
        height={lanes.length * laneHeight}
        className="block"
        style={{ display: 'block' }}
      >
        {/* Lane backgrounds */}
        {lanes.map((lane, index) => (
          <rect
            key={lane}
            x={0}
            y={index * laneHeight}
            width={timelineWidth}
            height={laneHeight}
            fill={index % 2 === 0 ? 'rgba(255, 255, 255, 0.02)' : 'rgba(255, 255, 255, 0.01)'}
            className="border-b border-white/5"
          />
        ))}

        {/* Lane labels */}
        {lanes.map((lane, index) => (
          <g key={`label-${lane}`}>
            <rect
              x={0}
              y={index * laneHeight}
              width={140}
              height={laneHeight}
              fill="rgba(0, 0, 0, 0.6)"
              className="border-r border-white/10"
            />
            <text
              x={12}
              y={index * laneHeight + laneHeight / 2}
              fill={LANE_COLORS[lane] || '#9ca3af'}
              fontSize="11"
              fontWeight="700"
              dominantBaseline="middle"
              letterSpacing="0.5px"
              className="select-none"
            >
              {LANE_LABELS[lane] || lane.toUpperCase()}
            </text>
            {/* Lane entry count badge */}
            <text
              x={130}
              y={index * laneHeight + laneHeight / 2}
              fill="rgba(255, 255, 255, 0.4)"
              fontSize="9"
              fontWeight="500"
              dominantBaseline="middle"
              textAnchor="end"
              className="select-none"
            >
              {entriesByLane[lane]?.length || 0}
            </text>
          </g>
        ))}

        {/* Connection lines between related memories */}
        {connections.map((conn, idx) => (
          <line
            key={`conn-${idx}`}
            x1={conn.x1}
            y1={conn.y1}
            x2={conn.x2}
            y2={conn.y2}
            stroke="rgba(167, 139, 250, 0.3)"
            strokeWidth={1}
            opacity={conn.opacity}
            className="pointer-events-none transition-opacity"
            style={{ strokeDasharray: '3,3' }}
          />
        ))}

        {/* Memory dots */}
        {lanes.map((lane, laneIndex) => {
          const laneEntries = entriesByLane[lane] || [];
          return laneEntries.map((entry) => {
            const pos = entryPositions.get(entry.id);
            if (!pos) return null;
            
            const handleHover = () => {
              // Convert SVG coordinates to screen coordinates
              const svgElement = document.querySelector('svg');
              if (svgElement) {
                const rect = svgElement.getBoundingClientRect();
                const screenX = rect.left + pos.x;
                const screenY = rect.top + pos.y;
                onMemoryHover(entry, screenX, screenY);
              }
            };
            
            return (
              <MemoryDot
                key={entry.id}
                entry={entry}
                x={pos.x}
                y={pos.y}
                scale={pixelsPerDay}
                onHover={handleHover}
                onHoverOut={onMemoryHoverOut}
                onClick={onMemoryClick}
                onDoubleClick={onMemoryDoubleClick}
                onCtrlClick={onMemoryCtrlClick}
                linkingMode={linkingMode}
              />
            );
          });
        })}
      </svg>
    </div>
  );
};

