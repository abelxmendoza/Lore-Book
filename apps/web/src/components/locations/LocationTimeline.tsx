import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { Loader2, ZoomIn, ZoomOut, LayoutGrid, BarChart3 } from 'lucide-react';
import { useTimelineKeyboard } from '../../hooks/useTimelineKeyboard';
import { DateRuler } from '../timeline/DateRuler';
import { EraBands } from '../timeline/EraBands';
import { TimelineLanes } from '../timeline/TimelineLanes';
import { MemoryHoverPreview } from '../timeline/MemoryHoverPreview';
import { MemoryPanel } from '../timeline/MemoryPanel';
import { LocationTimelineGraph } from './LocationTimelineGraph';
import type { TimelineEntry } from '../../hooks/useTimelineData';

const LANES = ['life', 'robotics', 'mma', 'work', 'creative'];

const MIN_PIXELS_PER_DAY = 0.1;
const MAX_PIXELS_PER_DAY = 365;
const DEFAULT_PIXELS_PER_DAY = 2;

type LocationTimelineProps = {
  entries: TimelineEntry[];
  locationName: string;
  eras?: Array<{ id: string; name: string; start_date: string; end_date: string | null; color: string; type: 'era' | 'saga' | 'arc' }>;
  sagas?: Array<{ id: string; name: string; start_date: string; end_date: string | null; color: string; type: 'era' | 'saga' | 'arc' }>;
  arcs?: Array<{ id: string; name: string; start_date: string; end_date: string | null; color: string; type: 'era' | 'saga' | 'arc' }>;
  onMemoryClick?: (entry: TimelineEntry) => void;
  compact?: boolean;
};

export const LocationTimeline = ({
  entries,
  locationName,
  eras = [],
  sagas = [],
  arcs = [],
  onMemoryClick,
  compact = false
}: LocationTimelineProps) => {
  const [selectedMemory, setSelectedMemory] = useState<TimelineEntry | null>(null);
  const [hoveredMemory, setHoveredMemory] = useState<{ entry: TimelineEntry; x: number; y: number } | null>(null);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [pixelsPerDay, setPixelsPerDay] = useState(DEFAULT_PIXELS_PER_DAY);
  const [showConnections, setShowConnections] = useState(true);
  const [viewMode, setViewMode] = useState<'lanes' | 'graph'>(entries.length === 0 ? 'graph' : 'lanes');
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, scrollLeft: 0 });

  // Calculate date range from entries
  const { startDate, endDate } = useMemo(() => {
    if (entries.length === 0) {
      const now = new Date();
      const oneYearAgo = new Date(now.getFullYear() - 1, now.getMonth(), 1);
      return { startDate: oneYearAgo, endDate: now };
    }

    const dates = entries.map(e => {
      try {
        return new Date(e.timestamp).getTime();
      } catch {
        return Date.now();
      }
    }).filter(d => !isNaN(d));
    
    if (dates.length === 0) {
      const now = new Date();
      const oneYearAgo = new Date(now.getFullYear() - 1, now.getMonth(), 1);
      return { startDate: oneYearAgo, endDate: now };
    }
    
    const minDate = new Date(Math.min(...dates));
    const maxDate = new Date(Math.max(...dates));
    
    // Add padding
    const paddingDays = 30;
    minDate.setDate(minDate.getDate() - paddingDays);
    maxDate.setDate(maxDate.getDate() + paddingDays);
    
    return { startDate: minDate, endDate: maxDate };
  }, [entries]);

  // Zoom functions
  const handleZoomIn = useCallback(() => {
    setPixelsPerDay(prev => {
      const newValue = prev * 1.2;
      return Math.max(MIN_PIXELS_PER_DAY, Math.min(MAX_PIXELS_PER_DAY, newValue));
    });
  }, []);

  const handleZoomOut = useCallback(() => {
    setPixelsPerDay(prev => {
      const newValue = prev * 0.8;
      return Math.max(MIN_PIXELS_PER_DAY, Math.min(MAX_PIXELS_PER_DAY, newValue));
    });
  }, []);

  // Navigation functions
  const handlePanLeft = useCallback(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollLeft -= 100;
      setScrollLeft(scrollContainerRef.current.scrollLeft);
    }
  }, []);

  const handlePanRight = useCallback(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollLeft += 100;
      setScrollLeft(scrollContainerRef.current.scrollLeft);
    }
  }, []);

  const handleJumpToToday = useCallback(() => {
    const now = new Date();
    if (now >= startDate && now <= endDate) {
      const daysDiff = (now.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24);
      const targetX = daysDiff * pixelsPerDay;
      if (scrollContainerRef.current) {
        scrollContainerRef.current.scrollLeft = targetX - (compact ? 200 : window.innerWidth / 2);
        setScrollLeft(scrollContainerRef.current.scrollLeft);
      }
    }
  }, [startDate, endDate, pixelsPerDay, compact]);

  const handleJumpToDate = useCallback((date: Date) => {
    if (date >= startDate && date <= endDate) {
      const daysDiff = (date.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24);
      const targetX = daysDiff * pixelsPerDay;
      if (scrollContainerRef.current) {
        scrollContainerRef.current.scrollLeft = targetX - (compact ? 200 : window.innerWidth / 2);
        setScrollLeft(scrollContainerRef.current.scrollLeft);
      }
    }
  }, [startDate, endDate, pixelsPerDay, compact]);

  // Handle zoom with mouse wheel
  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey && scrollContainerRef.current?.contains(e.target as Node)) {
        e.preventDefault();
        const delta = e.deltaY > 0 ? 0.9 : 1.1;
        setPixelsPerDay(prev => {
          const newValue = prev * delta;
          return Math.max(MIN_PIXELS_PER_DAY, Math.min(MAX_PIXELS_PER_DAY, newValue));
        });
      }
    };

    window.addEventListener('wheel', handleWheel, { passive: false });
    return () => window.removeEventListener('wheel', handleWheel);
  }, []);

  // Keyboard shortcuts (disabled in compact mode)
  useTimelineKeyboard({
    onPanLeft: handlePanLeft,
    onPanRight: handlePanRight,
    onZoomIn: handleZoomIn,
    onZoomOut: handleZoomOut,
    onJumpToStart: () => {
      if (scrollContainerRef.current) {
        scrollContainerRef.current.scrollLeft = 0;
        setScrollLeft(0);
      }
    },
    onJumpToEnd: () => {
      if (scrollContainerRef.current) {
        scrollContainerRef.current.scrollLeft = scrollContainerRef.current.scrollWidth;
        setScrollLeft(scrollContainerRef.current.scrollWidth);
      }
    },
    onJumpToToday: handleJumpToToday,
    enabled: !compact && !selectedMemory
  });

  // Handle memory hover
  const handleMemoryHover = useCallback((entry: TimelineEntry, x: number, y: number) => {
    setHoveredMemory({ entry, x, y });
  }, []);

  const handleMemoryHoverOut = useCallback(() => {
    setHoveredMemory(null);
  }, []);

  // Handle memory click
  const handleMemoryClick = useCallback((entry: TimelineEntry) => {
    if (onMemoryClick) {
      onMemoryClick(entry);
    } else {
      setSelectedMemory(entry);
    }
  }, [onMemoryClick]);

  // Handle memory double-click (zoom to memory)
  const handleMemoryDoubleClick = useCallback((entry: TimelineEntry) => {
    const entryDate = new Date(entry.timestamp);
    if (entryDate >= startDate && entryDate <= endDate) {
      setPixelsPerDay(prev => {
        const newValue = Math.min(prev * 3, MAX_PIXELS_PER_DAY);
        return Math.max(MIN_PIXELS_PER_DAY, newValue);
      });
      
      setTimeout(() => {
        const daysDiff = (entryDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24);
        const targetX = daysDiff * pixelsPerDay * 3 - (compact ? 200 : window.innerWidth / 2);
        if (scrollContainerRef.current) {
          scrollContainerRef.current.scrollTo({
            left: Math.max(0, targetX),
            behavior: 'smooth'
          });
          setScrollLeft(scrollContainerRef.current.scrollLeft);
        }
      }, 100);
    }
  }, [startDate, endDate, pixelsPerDay, compact]);

  // Handle drag scrolling
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button === 0 && scrollContainerRef.current) {
      setIsDragging(true);
      setDragStart({
        x: e.clientX,
        scrollLeft: scrollContainerRef.current.scrollLeft
      });
    }
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isDragging && scrollContainerRef.current) {
      const deltaX = e.clientX - dragStart.x;
      const newScrollLeft = dragStart.scrollLeft - deltaX;
      scrollContainerRef.current.scrollLeft = newScrollLeft;
      setScrollLeft(newScrollLeft);
    }
  }, [isDragging, dragStart]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      return;
    }
    
    if (scrollContainerRef.current && !e.ctrlKey && !e.metaKey) {
      scrollContainerRef.current.scrollLeft += e.deltaY;
      setScrollLeft(scrollContainerRef.current.scrollLeft);
    }
  }, []);

  // Always show graph view when there are no entries (will display dummy data)
  // if (entries.length === 0) {
  //   return (
  //     <div className="flex flex-col items-center justify-center h-[400px] bg-gradient-to-br from-black via-purple-950/20 to-black rounded-lg">
  //       <p className="text-white/60 text-lg mb-2">No timeline entries for {locationName}</p>
  //       <p className="text-white/40 text-sm">Memories mentioning this location will appear here</p>
  //     </div>
  //   );
  // }

  // Convert bands to TimelineBand format
  const timelineBands = useMemo(() => {
    const bands = [
      ...eras.map(b => ({ ...b, type: 'era' as const })),
      ...sagas.map(b => ({ ...b, type: 'saga' as const })),
      ...arcs.map(b => ({ ...b, type: 'arc' as const }))
    ];
    return bands;
  }, [eras, sagas, arcs]);

  return (
    <div className="flex flex-col w-full h-full bg-gradient-to-br from-black via-purple-950/20 to-black rounded-lg overflow-hidden" style={{ height: compact ? '500px' : '600px' }}>
      {/* Compact Controls */}
      {compact && (
        <div className="flex-shrink-0 flex items-center justify-between p-3 bg-black/40 border-b border-border/60">
          <div className="flex items-center gap-2">
            {/* View Mode Toggle */}
            <div className="flex items-center gap-1 bg-black/40 rounded p-0.5">
              <button
                onClick={() => setViewMode('lanes')}
                className={`px-2 py-1 text-xs rounded transition-colors ${
                  viewMode === 'lanes' 
                    ? 'bg-primary/20 text-primary' 
                    : 'text-white/70 hover:bg-black/40'
                }`}
                title="Lanes view"
              >
                <LayoutGrid className="w-3 h-3 inline mr-1" />
                Lanes
              </button>
              <button
                onClick={() => setViewMode('graph')}
                className={`px-2 py-1 text-xs rounded transition-colors ${
                  viewMode === 'graph' 
                    ? 'bg-primary/20 text-primary' 
                    : 'text-white/70 hover:bg-black/40'
                }`}
                title="Graph view"
              >
                <BarChart3 className="w-3 h-3 inline mr-1" />
                Graph
              </button>
            </div>
            
            {viewMode === 'lanes' && (
              <>
                <button
                  onClick={handleZoomOut}
                  className="p-1.5 rounded hover:bg-black/40 transition-colors"
                  title="Zoom out"
                >
                  <ZoomOut className="w-4 h-4 text-white/70" />
                </button>
                <button
                  onClick={handleZoomIn}
                  className="p-1.5 rounded hover:bg-black/40 transition-colors"
                  title="Zoom in"
                >
                  <ZoomIn className="w-4 h-4 text-white/70" />
                </button>
                <button
                  onClick={handleJumpToToday}
                  className="px-2 py-1 text-xs rounded hover:bg-black/40 transition-colors text-white/70"
                  title="Jump to today"
                >
                  Today
                </button>
                <button
                  onClick={() => setShowConnections(!showConnections)}
                  className={`px-2 py-1 text-xs rounded transition-colors ${
                    showConnections ? 'bg-primary/20 text-primary' : 'text-white/70 hover:bg-black/40'
                  }`}
                  title="Toggle connections"
                >
                  {showConnections ? '✓' : ''} Connections
                </button>
              </>
            )}
          </div>
          <div className="text-xs text-white/50">
            {entries.length} {entries.length === 1 ? 'memory' : 'memories'}
          </div>
        </div>
      )}

      {/* Content based on view mode */}
      {viewMode === 'graph' ? (
        <div className="flex-1 overflow-hidden" style={{ height: compact ? '450px' : '550px' }}>
          <LocationTimelineGraph entries={entries} locationName={locationName} />
        </div>
      ) : (
        <div
          ref={scrollContainerRef}
          className="flex-1 overflow-x-auto overflow-y-hidden"
          style={{ 
            scrollBehavior: 'smooth', 
            cursor: isDragging ? 'grabbing' : 'grab', 
            minHeight: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.3)'
          }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onWheel={handleWheel}
        >
          <div className="inline-flex flex-col" style={{ minWidth: 'max-content' }}>
            {/* Date Ruler */}
            <DateRuler
              startDate={startDate}
              endDate={endDate}
              pixelsPerDay={pixelsPerDay}
              scrollLeft={scrollLeft}
              onDateClick={handleJumpToDate}
            />

            {/* Era/Saga/Arc Bands */}
            {timelineBands.length > 0 && (
              <EraBands
                eras={timelineBands.filter(b => b.type === 'era')}
                sagas={timelineBands.filter(b => b.type === 'saga')}
                arcs={timelineBands.filter(b => b.type === 'arc')}
                startDate={startDate}
                endDate={endDate}
                pixelsPerDay={pixelsPerDay}
                scrollLeft={scrollLeft}
              />
            )}

            {/* Timeline Lanes */}
            <TimelineLanes
              entries={entries}
              lanes={LANES}
              startDate={startDate}
              endDate={endDate}
              pixelsPerDay={pixelsPerDay}
              scrollLeft={scrollLeft}
              onScrollChange={setScrollLeft}
              onMemoryHover={handleMemoryHover}
              onMemoryHoverOut={handleMemoryHoverOut}
              onMemoryClick={handleMemoryClick}
              onMemoryDoubleClick={handleMemoryDoubleClick}
              showConnections={showConnections}
            />
          </div>
        </div>
      )}

      {/* Hover Preview */}
      {hoveredMemory && (
        <MemoryHoverPreview
          entry={hoveredMemory.entry}
          x={hoveredMemory.x}
          y={hoveredMemory.y}
          visible={true}
        />
      )}

      {/* Memory Panel */}
      {selectedMemory && !onMemoryClick && (
        <MemoryPanel
          entry={selectedMemory}
          eras={timelineBands.filter(b => b.type === 'era')}
          sagas={timelineBands.filter(b => b.type === 'saga')}
          arcs={timelineBands.filter(b => b.type === 'arc')}
          onClose={() => setSelectedMemory(null)}
        />
      )}
    </div>
  );
};

