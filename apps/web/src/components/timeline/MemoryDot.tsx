import { useState } from 'react';
import type { TimelineEntry } from '../../hooks/useTimelineData';

type MemoryDotProps = {
  entry: TimelineEntry;
  x: number;
  y: number;
  scale: number;
  onHover: (() => void) | ((entry: TimelineEntry, x: number, y: number) => void);
  onHoverOut: () => void;
  onClick: (entry: TimelineEntry) => void;
  onDoubleClick?: (entry: TimelineEntry) => void;
  onCtrlClick?: (entry: TimelineEntry) => void;
  linkingMode?: boolean;
};

const moodColors: Record<string, string> = {
  happy: '#fbbf24',
  sad: '#60a5fa',
  angry: '#f87171',
  anxious: '#a78bfa',
  calm: '#34d399',
  excited: '#fb923c',
  default: '#9ca3af'
};

export const MemoryDot = ({
  entry,
  x,
  y,
  scale,
  onHover,
  onHoverOut,
  onClick,
  onDoubleClick,
  onCtrlClick,
  linkingMode = false
}: MemoryDotProps) => {
  const [isHovered, setIsHovered] = useState(false);

  const moodColor = entry.mood ? moodColors[entry.mood.toLowerCase()] || moodColors.default : moodColors.default;
  const dotSize = 8 + (entry.related_entry_ids?.length || 0) * 2;
  const glowSize = linkingMode ? 20 : isHovered ? 16 : 0;
  
  // Check if this is a highlight moment
  // For now, check metadata or use heuristics (many related entries, high emotion)
  const isHighlight = entry.related_entry_ids.length > 2 || 
    ['excited', 'anxious', 'angry'].includes(entry.mood?.toLowerCase() || '');

  const handleClick = (e: React.MouseEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      onCtrlClick?.(entry);
    } else {
      onClick(entry);
    }
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    onDoubleClick?.(entry);
  };

  const handleMouseEnter = () => {
    setIsHovered(true);
    // onHover is called with a function that calculates screen coordinates
    if (typeof onHover === 'function') {
      onHover();
    } else {
      onHover(entry, x, y);
    }
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
    onHoverOut();
  };

  return (
    <g
      transform={`translate(${x}, ${y})`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      className="cursor-pointer"
    >
      {/* Glow effect */}
      {glowSize > 0 && (
        <circle
          cx={0}
          cy={0}
          r={glowSize}
          fill={moodColor}
          opacity={linkingMode ? 0.4 : 0.2}
          className="transition-all duration-200"
        />
      )}
      
      {/* Highlight glow (gold outline) */}
      {isHighlight && (
        <circle
          cx={0}
          cy={0}
          r={dotSize / 2 + 3}
          fill="none"
          stroke="#fbbf24"
          strokeWidth={2}
          opacity={0.8}
          className="animate-pulse"
        />
      )}
      
      {/* Dot */}
      <circle
        cx={0}
        cy={0}
        r={dotSize / 2}
        fill={moodColor}
        stroke={linkingMode ? '#ffffff' : isHighlight ? '#fbbf24' : moodColor}
        strokeWidth={linkingMode ? 2 : isHighlight ? 2 : 1}
        className="transition-all duration-200"
        style={{
          filter: isHovered ? `drop-shadow(0 0 ${glowSize / 2}px ${moodColor})` : 
                  isHighlight ? `drop-shadow(0 0 4px #fbbf24)` : 'none'
        }}
      />
    </g>
  );
};

