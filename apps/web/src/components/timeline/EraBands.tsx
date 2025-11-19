import { useRef, useEffect } from 'react';
import type { TimelineBand } from '../../hooks/useTimelineData';

type EraBandsProps = {
  eras: TimelineBand[];
  sagas: TimelineBand[];
  arcs: TimelineBand[];
  startDate: Date;
  endDate: Date;
  pixelsPerDay: number;
  scrollLeft: number;
  onBandClick?: (band: { type: 'era' | 'saga' | 'arc'; id: string }) => void;
};

export const EraBands = ({
  eras,
  sagas,
  arcs,
  startDate,
  endDate,
  pixelsPerDay,
  scrollLeft,
  onBandClick
}: EraBandsProps) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollLeft = scrollLeft;
    }
  }, [scrollLeft]);

  const calculatePosition = (bandStart: string, bandEnd: string | null) => {
    const start = new Date(bandStart);
    const end = bandEnd ? new Date(bandEnd) : endDate;
    
    const startOffset = Math.max(0, (start.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    const duration = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);
    
    return {
      left: startOffset * pixelsPerDay,
      width: duration * pixelsPerDay
    };
  };

  const allBands = [
    ...eras.map(b => ({ ...b, layer: 'era' as const })),
    ...sagas.map(b => ({ ...b, layer: 'saga' as const })),
    ...arcs.map(b => ({ ...b, layer: 'arc' as const }))
  ].sort((a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime());

  const timelineWidth = (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24) * pixelsPerDay;

  return (
    <div
      ref={containerRef}
      className="h-24 border-b border-border/60 bg-black/40 relative"
      style={{ 
        width: `${Math.max(timelineWidth, window.innerWidth)}px`,
        pointerEvents: 'none'
      }}
    >
      <svg
        width={Math.max(timelineWidth, window.innerWidth)}
        height={96}
        className="block"
        style={{ pointerEvents: 'all', display: 'block' }}
      >
        {allBands.map((band) => {
          const { left, width } = calculatePosition(band.start_date, band.end_date);
          const y = band.type === 'era' ? 8 : band.type === 'saga' ? 40 : 72;
          const height = 24;
          
          // Use exact colors from spec
          let color = band.color;
          if (band.type === 'era') color = '#4a148c'; // deep purple
          else if (band.type === 'saga') color = '#b71c1c'; // crimson
          else if (band.type === 'arc') color = '#1e88e5'; // electric blue
          
          return (
            <g key={`${band.type}-${band.id}`}>
              <rect
                x={left}
                y={y}
                width={Math.max(width, 50)}
                height={height}
                fill={color}
                opacity={0.8}
                rx={4}
                className="cursor-pointer transition-opacity hover:opacity-100"
                onClick={() => onBandClick?.({ type: band.type, id: band.id })}
              />
              <text
                x={left + 8}
                y={y + height / 2}
                fill="white"
                fontSize="11"
                fontWeight="600"
                dominantBaseline="middle"
                className="pointer-events-none select-none"
              >
                {band.name}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
};

