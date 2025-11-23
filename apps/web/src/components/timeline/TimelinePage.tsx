import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { TimelineSkeleton } from '../ui/skeleton';
import { useTimelineData, type TimelineEntry } from '../../hooks/useTimelineData';
import { useTimelineKeyboard } from '../../hooks/useTimelineKeyboard';
import { fetchJson } from '../../lib/api';
import { TimelineHeader } from './TimelineHeader';
import { DateRuler } from './DateRuler';
import { EraBands } from './EraBands';
import { TimelineLanes } from './TimelineLanes';
import { MemoryHoverPreview } from './MemoryHoverPreview';
import { MemoryPanel } from './MemoryPanel';
import { EmotionHeatmap } from './EmotionHeatmap';

const LANES = ['life', 'robotics', 'mma', 'work', 'creative'];

const MIN_PIXELS_PER_DAY = 0.1; // 1 day per 1000px (zoomed out)
const MAX_PIXELS_PER_DAY = 365; // 1 year per 100px (zoomed in)
const DEFAULT_PIXELS_PER_DAY = 2; // 1 day per 2px

export const TimelinePage = () => {
  const { entries, eras, sagas, arcs, filters, setFilters, resetFilters, loading, error } = useTimelineData();
  const [selectedMemory, setSelectedMemory] = useState<TimelineEntry | null>(null);
  const [hoveredMemory, setHoveredMemory] = useState<{ entry: TimelineEntry; x: number; y: number } | null>(null);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [pixelsPerDay, setPixelsPerDay] = useState(DEFAULT_PIXELS_PER_DAY);
  const [linkingMode, setLinkingMode] = useState(false);
  const [linkingSource, setLinkingSource] = useState<string | null>(null);
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [showHighlightsOnly, setShowHighlightsOnly] = useState(false);
  const [showConnections, setShowConnections] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
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

  // Extract available moods
  const availableMoods = useMemo(() => {
    const moods = new Set<string>();
    entries.forEach(e => {
      if (e.mood) moods.add(e.mood);
    });
    return Array.from(moods);
  }, [entries]);

  // Filter entries by highlights if enabled
  const filteredEntries = useMemo(() => {
    if (showHighlightsOnly) {
      return entries.filter(e => {
        // Check if entry has highlight_score in metadata (will be added by backend)
        // For now, filter by entries with high emotional intensity or many related entries
        return e.related_entry_ids.length > 2 || ['excited', 'anxious', 'angry'].includes(e.mood || '');
      });
    }
    return entries;
  }, [entries, showHighlightsOnly]);

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

  const handleJumpToStart = useCallback(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollLeft = 0;
      setScrollLeft(0);
    }
  }, []);

  const handleJumpToEnd = useCallback(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollLeft = scrollContainerRef.current.scrollWidth;
      setScrollLeft(scrollContainerRef.current.scrollWidth);
    }
  }, []);

  const handleJumpToToday = useCallback(() => {
    const now = new Date();
    if (now >= startDate && now <= endDate) {
      const daysDiff = (now.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24);
      const targetX = daysDiff * pixelsPerDay;
      if (scrollContainerRef.current) {
        scrollContainerRef.current.scrollLeft = targetX - window.innerWidth / 2;
        setScrollLeft(scrollContainerRef.current.scrollLeft);
      }
    }
  }, [startDate, endDate, pixelsPerDay]);

  const handleJumpToDate = useCallback((date: Date) => {
    if (date >= startDate && date <= endDate) {
      const daysDiff = (date.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24);
      const targetX = daysDiff * pixelsPerDay;
      if (scrollContainerRef.current) {
        scrollContainerRef.current.scrollLeft = targetX - window.innerWidth / 2;
        setScrollLeft(scrollContainerRef.current.scrollLeft);
      }
    }
  }, [startDate, endDate, pixelsPerDay]);

  // Handle zoom with mouse wheel
  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
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

  // Keyboard shortcuts
  useTimelineKeyboard({
    onPanLeft: handlePanLeft,
    onPanRight: handlePanRight,
    onZoomIn: handleZoomIn,
    onZoomOut: handleZoomOut,
    onJumpToStart: handleJumpToStart,
    onJumpToEnd: handleJumpToEnd,
    onJumpToToday: handleJumpToToday,
    enabled: !selectedMemory // Disable when panel is open
  });

  // Handle memory hover
  const handleMemoryHover = useCallback((entry: TimelineEntry, x: number, y: number) => {
    setHoveredMemory({ entry, x, y });
  }, []);

  const handleMemoryHoverOut = useCallback(() => {
    setHoveredMemory(null);
  }, []);

  // Handle memory click
  const handleMemoryClick = useCallback(async (entry: TimelineEntry) => {
    if (linkingMode && linkingSource) {
      // Create link between memories
      try {
        await fetchJson(`/api/entries/${linkingSource}/link`, {
          method: 'POST',
          body: JSON.stringify({
            targetEntryId: entry.id,
            relationshipType: 'related',
            strength: 0.5
          })
        });
        
        // Refresh timeline to show the link
        if (onRefresh) {
          onRefresh();
        }
        
        setLinkingMode(false);
        setLinkingSource(null);
      } catch (error) {
        console.error('Failed to link memories:', error);
        alert('Failed to link memories. Please try again.');
      }
    } else {
      setSelectedMemory(entry);
    }
  }, [linkingMode, linkingSource]);

  // Handle memory double-click (zoom to memory)
  const handleMemoryDoubleClick = useCallback((entry: TimelineEntry) => {
    const entryDate = new Date(entry.timestamp);
    if (entryDate >= startDate && entryDate <= endDate) {
      // Zoom in to a reasonable level
      setPixelsPerDay(prev => {
        const newValue = Math.min(prev * 3, MAX_PIXELS_PER_DAY);
        return Math.max(MIN_PIXELS_PER_DAY, newValue);
      });
      
      // Scroll to the memory
      setTimeout(() => {
        const daysDiff = (entryDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24);
        const targetX = daysDiff * pixelsPerDay * 3 - window.innerWidth / 2;
        if (scrollContainerRef.current) {
          scrollContainerRef.current.scrollTo({
            left: Math.max(0, targetX),
            behavior: 'smooth'
          });
          setScrollLeft(scrollContainerRef.current.scrollLeft);
        }
      }, 100);
    }
  }, [startDate, endDate, pixelsPerDay]);

  // Handle CTRL+Click for linking
  const handleMemoryCtrlClick = useCallback((entry: TimelineEntry) => {
    if (linkingMode) {
      setLinkingMode(false);
      setLinkingSource(null);
    } else {
      setLinkingMode(true);
      setLinkingSource(entry.id);
    }
  }, [linkingMode]);

  // Handle band click (filter by band)
  const handleBandClick = useCallback((band: { type: 'era' | 'saga' | 'arc'; id: string }) => {
    const filterKey = band.type === 'era' ? 'era' : band.type === 'saga' ? 'saga' : 'arc';
    const current = filters[filterKey] as string[] | undefined;
    if (current?.includes(band.id)) {
      setFilters({ [filterKey]: current.filter(id => id !== band.id) });
    } else {
      setFilters({ [filterKey]: [...(current || []), band.id] });
    }
  }, [filters, setFilters]);

  // Handle related memory click
  const handleRelatedClick = useCallback((entryId: string) => {
    const entry = entries.find(e => e.id === entryId);
    if (entry) {
      setSelectedMemory(entry);
    }
  }, [entries]);

  // Sync scroll state
  useEffect(() => {
    const handleScroll = () => {
      if (scrollContainerRef.current) {
        setScrollLeft(scrollContainerRef.current.scrollLeft);
      }
    };

    const container = scrollContainerRef.current;
    if (container) {
      container.addEventListener('scroll', handleScroll);
      return () => container.removeEventListener('scroll', handleScroll);
    }
  }, []);

  // Handle drag scrolling for the shared container
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
      // Zoom handled by parent
      return;
    }
    
    if (scrollContainerRef.current && !e.ctrlKey && !e.metaKey) {
      scrollContainerRef.current.scrollLeft += e.deltaY;
      setScrollLeft(scrollContainerRef.current.scrollLeft);
    }
  }, []);

  // Early returns AFTER all hooks
  if (loading) {
    return (
      <div className="space-y-4 p-6">
        <div className="space-y-2">
          <div className="h-8 w-48 animate-pulse rounded-lg bg-white/10" />
          <div className="h-4 w-32 animate-pulse rounded bg-white/10" />
        </div>
        <TimelineSkeleton />
      </div>
    );
  }
  
  // Show empty state if no entries (but still render if we have dummy data)
  if (!loading && entries.length === 0 && !error) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-gradient-to-br from-black via-purple-950/20 to-black">
        <div className="text-center p-8">
          <p className="text-white/60 text-lg mb-2">No timeline entries yet</p>
          <p className="text-white/40 text-sm">Start journaling to see your timeline</p>
        </div>
      </div>
    );
  }

  // Show error banner but still render UI if we have entries (dummy data fallback)
  const showErrorBanner = error && entries.length === 0;

  return (
    <div
      ref={containerRef}
      className="flex flex-col w-full h-full bg-gradient-to-br from-black via-purple-950/20 to-black overflow-hidden"
    >
      {/* Error Banner (only if no data at all) */}
      {showErrorBanner && (
        <div className="flex-shrink-0 bg-red-900/20 border-b border-red-500/50 p-3 text-center">
          <p className="text-red-400 text-sm">
            Error loading timeline: {error}. Showing placeholder data.
          </p>
        </div>
      )}

      {/* Fixed Header */}
      <div className="flex-shrink-0">
        <TimelineHeader
          filters={filters}
          onFiltersChange={setFilters}
          onResetFilters={resetFilters}
          eras={eras}
          sagas={sagas}
          arcs={arcs}
          availableMoods={availableMoods}
          showHeatmap={showHeatmap}
          onHeatmapToggle={setShowHeatmap}
          showHighlightsOnly={showHighlightsOnly}
          onHighlightsToggle={setShowHighlightsOnly}
          pixelsPerDay={pixelsPerDay}
          onZoomIn={handleZoomIn}
          onZoomOut={handleZoomOut}
          onJumpToToday={handleJumpToToday}
          onJumpToDate={handleJumpToDate}
          entryCount={filteredEntries.length}
          showConnections={showConnections}
          onToggleConnections={setShowConnections}
        />
      </div>

      {/* Scrollable Container: Bands + Lanes */}
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
          <EraBands
            eras={eras}
            sagas={sagas}
            arcs={arcs}
            startDate={startDate}
            endDate={endDate}
            pixelsPerDay={pixelsPerDay}
            scrollLeft={scrollLeft}
            onBandClick={handleBandClick}
          />

          {/* Timeline Lanes */}
          <TimelineLanes
            entries={filteredEntries}
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
            onMemoryCtrlClick={handleMemoryCtrlClick}
            linkingMode={linkingMode}
            showConnections={showConnections}
          />

          {/* Emotion Heatmap Overlay */}
          {showHeatmap && (
            <EmotionHeatmap
              entries={filteredEntries}
              lanes={LANES}
              startDate={startDate}
              endDate={endDate}
              pixelsPerDay={pixelsPerDay}
            />
          )}
        </div>
      </div>

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
      <MemoryPanel
        entry={selectedMemory}
        eras={eras}
        sagas={sagas}
        arcs={arcs}
        onClose={() => setSelectedMemory(null)}
        onRelatedClick={handleRelatedClick}
      />

      {/* Linking Mode Indicator */}
      {linkingMode && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-primary/90 text-white px-4 py-2 rounded-lg shadow-lg z-50">
          <p className="text-sm font-medium">Linking Mode: Click another memory to create a link</p>
        </div>
      )}
    </div>
  );
};

