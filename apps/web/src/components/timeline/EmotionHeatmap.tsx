import { useMemo } from 'react';
import type { TimelineEntry } from '../../hooks/useTimelineData';

type EmotionHeatmapProps = {
  entries: TimelineEntry[];
  lanes: string[];
  startDate: Date;
  endDate: Date;
  pixelsPerDay: number;
};

const moodIntensity: Record<string, number> = {
  excited: 0.9,
  anxious: 0.8,
  angry: 0.85,
  happy: 0.7,
  sad: 0.6,
  calm: 0.4,
  default: 0.5
};

const moodColors: Record<string, string> = {
  excited: 'rgba(251, 191, 36, 0.3)', // orange
  anxious: 'rgba(167, 139, 250, 0.3)', // purple
  angry: 'rgba(248, 113, 113, 0.3)', // red
  happy: 'rgba(251, 191, 36, 0.25)', // yellow
  sad: 'rgba(96, 165, 250, 0.25)', // blue
  calm: 'rgba(52, 211, 153, 0.2)', // green
  default: 'rgba(156, 163, 175, 0.15)' // gray
};

export const EmotionHeatmap = ({
  entries,
  lanes,
  startDate,
  endDate,
  pixelsPerDay
}: EmotionHeatmapProps) => {
  const timelineWidth = (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24) * pixelsPerDay;
  const laneHeight = 60;

  // Group entries by lane and calculate heatmap intensity
  const heatmapData = useMemo(() => {
    const data: Array<{ lane: string; x: number; intensity: number; color: string }> = [];
    
    lanes.forEach((lane, laneIndex) => {
      const laneEntries = entries.filter(e => e.lane === lane);
      
      laneEntries.forEach((entry) => {
        const entryDate = new Date(entry.timestamp);
        const daysDiff = (entryDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24);
        const x = daysDiff * pixelsPerDay;
        
        const mood = entry.mood?.toLowerCase() || 'default';
        const intensity = moodIntensity[mood] || moodIntensity.default;
        const color = moodColors[mood] || moodColors.default;
        
        data.push({
          lane,
          x,
          intensity,
          color
        });
      });
    });
    
    return data;
  }, [entries, lanes, startDate, pixelsPerDay]);

  // Create gradient stops for each lane
  const createGradientStops = (lane: string) => {
    const laneData = heatmapData.filter(d => d.lane === lane);
    if (laneData.length === 0) return [];
    
    // Sort by x position
    laneData.sort((a, b) => a.x - b.x);
    
    // Create gradient stops with smoothing
    const stops: Array<{ offset: number; color: string; intensity: number }> = [];
    
    laneData.forEach((point, index) => {
      const offset = (point.x / timelineWidth) * 100;
      stops.push({
        offset: Math.max(0, Math.min(100, offset)),
        color: point.color,
        intensity: point.intensity
      });
    });
    
    return stops;
  };

  return (
    <div className="absolute inset-0 pointer-events-none z-10">
      <svg
        width={Math.max(timelineWidth, window.innerWidth)}
        height={lanes.length * laneHeight}
        className="block opacity-60"
      >
        {lanes.map((lane, laneIndex) => {
          const stops = createGradientStops(lane);
          const gradientId = `heatmap-gradient-${lane}`;
          
          return (
            <g key={lane}>
              {/* Define gradient */}
              <defs>
                <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="0%">
                  {stops.length > 0 ? (
                    stops.map((stop, idx) => (
                      <stop
                        key={idx}
                        offset={`${stop.offset}%`}
                        stopColor={stop.color}
                        stopOpacity={stop.intensity}
                      />
                    ))
                  ) : (
                    <stop offset="0%" stopColor="transparent" stopOpacity="0" />
                  )}
                </linearGradient>
              </defs>
              
              {/* Apply gradient overlay */}
              <rect
                x={0}
                y={laneIndex * laneHeight}
                width={timelineWidth}
                height={laneHeight}
                fill={`url(#${gradientId})`}
                className="transition-opacity duration-300"
              />
              
              {/* Add glow effect for high-intensity areas */}
              {heatmapData
                .filter(d => d.lane === lane && d.intensity > 0.7)
                .map((point, idx) => (
                  <circle
                    key={`glow-${lane}-${idx}`}
                    cx={point.x}
                    cy={laneIndex * laneHeight + laneHeight / 2}
                    r={20}
                    fill={point.color}
                    opacity={point.intensity * 0.4}
                    className="blur-sm"
                  />
                ))}
            </g>
          );
        })}
      </svg>
    </div>
  );
};

