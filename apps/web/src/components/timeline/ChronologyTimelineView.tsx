import React, { useEffect, useRef, useMemo, useState } from 'react';
import { ZoomIn, ZoomOut, Maximize2, Calendar, RotateCcw } from 'lucide-react';
import { useChronology } from '../../hooks/useChronology';
import { useTimelineV2 } from '../../hooks/useTimelineV2';
import type { ChronologyEntry, Timeline as TimelineType } from '../../types/timelineV2';

// Import vis-timeline CSS
import 'vis-timeline/styles/vis-timeline-graph2d.min.css';
import '../../styles/timeline.css';

// Dynamic imports for vis-timeline to avoid SSR issues
let Timeline: any;
let DataSet: any;

interface ChronologyTimelineViewProps {
  onEntrySelect?: (entry: ChronologyEntry) => void;
  onTimelineSelect?: (timeline: TimelineType) => void;
}

export const ChronologyTimelineView: React.FC<ChronologyTimelineViewProps> = ({
  onEntrySelect,
  onTimelineSelect
}) => {
  const timelineRef = useRef<HTMLDivElement>(null);
  const timelineInstanceRef = useRef<Timeline | null>(null);
  const [selectedItem, setSelectedItem] = useState<string | null>(null);
  const [selectedTimeline, setSelectedTimeline] = useState<TimelineType | null>(null);

  const { entries: chronologyEntries, loading: chronologyLoading } = useChronology();
  const { timelines, loading: timelinesLoading } = useTimelineV2();

  // Build groups from timelines (simplified - no nesting for now to avoid vis-timeline errors)
  const groups = useMemo(() => {
    const groupMap = new Map<string, { id: string; content: string }>();
    
    // Create groups for each timeline (flat structure)
    timelines.forEach(timeline => {
      groupMap.set(timeline.id, {
        id: timeline.id,
        content: `${timeline.title} (${timeline.timeline_type.replace('_', ' ')})`
      });
    });

    // Add a default group for ungrouped memories (only if we have ungrouped entries)
    const hasUngrouped = chronologyEntries.some(e => !e.timeline_memberships || e.timeline_memberships.length === 0);
    if (hasUngrouped) {
      groupMap.set('ungrouped', {
        id: 'ungrouped',
        content: 'Ungrouped Memories'
      });
    }

    return Array.from(groupMap.values());
  }, [timelines, chronologyEntries]);

  // Build items from chronology entries
  const items = useMemo(() => {
    return chronologyEntries.map(entry => {
      // Find which timeline this entry belongs to (use first membership, or ungrouped)
      const timelineId = entry.timeline_memberships && entry.timeline_memberships.length > 0
        ? entry.timeline_memberships[0]
        : 'ungrouped';
      
      const start = new Date(entry.start_time);
      const end = entry.end_time ? new Date(entry.end_time) : null;
      
      // Determine if this is a point or range
      const isRange = end && (end.getTime() - start.getTime()) > 1000 * 60 * 60 * 24; // More than 1 day
      
      return {
        id: entry.id,
        group: timelineId,
        content: entry.content.substring(0, 40) + (entry.content.length > 40 ? '...' : ''),
        start: start,
        end: isRange ? end : undefined,
        type: isRange ? 'range' : 'point',
        title: entry.content,
        className: selectedItem === entry.id ? 'selected' : '',
        // Custom data for click handling
        data: {
          entry,
          type: 'memory'
        },
        // Add spacing to prevent overlap
        style: 'background-color: rgba(154, 77, 255, 0.8); border-color: rgba(154, 77, 255, 0.6);'
      };
    });
  }, [chronologyEntries, selectedItem]);

  // Add timeline items as background ranges
  const timelineItems = useMemo(() => {
    return timelines.map(timeline => ({
      id: `timeline-${timeline.id}`,
      group: timeline.id,
      content: timeline.title,
      start: new Date(timeline.start_date),
      end: timeline.end_date ? new Date(timeline.end_date) : new Date(),
      type: 'background' as const,
      className: 'timeline-background',
      data: {
        timeline,
        type: 'timeline'
      }
    }));
  }, [timelines]);

  // Combine all items
  const allItems = useMemo(() => {
    return [...items, ...timelineItems];
  }, [items, timelineItems]);

  // Calculate dynamic height based on groups - increased for better visibility
  const timelineHeight = useMemo(() => {
    // Base height + height per group (approximately 120px per group for better spacing and no overlap)
    const baseHeight = 700;
    const groupHeight = groups.length * 120; // Increased to 120px for even better spacing
    const calculatedHeight = Math.max(1200, baseHeight + groupHeight);
    // Increased max height for better visibility
    return Math.min(calculatedHeight, 3500);
  }, [groups.length]);

  // Load vis-timeline dynamically
  useEffect(() => {
    const loadVisTimeline = async () => {
      if (Timeline && DataSet) return; // Already loaded
      
      try {
        const visTimeline = await import('vis-timeline/standalone');
        const visData = await import('vis-data/standalone');
        Timeline = visTimeline.Timeline;
        DataSet = visData.DataSet;
      } catch (error) {
        console.error('Failed to load vis-timeline:', error);
      }
    };
    
    loadVisTimeline();
  }, []);

  // Initialize timeline (only once when data is ready)
  useEffect(() => {
    if (!timelineRef.current || chronologyLoading || timelinesLoading) return;
    if (allItems.length === 0 && groups.length === 0) return;
    if (timelineInstanceRef.current) return; // Already initialized
    if (!Timeline || !DataSet) return; // Wait for libraries to load

    const itemsDataSet = new DataSet(allItems);
    const groupsDataSet = new DataSet(groups);

    const options: any = {
      stack: true, // Enable stacking to prevent overlapping
      orientation: 'top',
      editable: false,
      selectable: true,
      multiselect: false,
      showCurrentTime: true,
      zoomMin: 1000 * 60 * 60 * 24, // 1 day
      zoomMax: 1000 * 60 * 60 * 24 * 365 * 10, // 10 years
      zoomKey: 'ctrlKey',
      moveable: true,
      zoomable: true,
      height: `${timelineHeight}px`,
      groupOrder: 'id',
      // Disable nested groups to avoid errors
      nestedGroups: false,
      // Better spacing to prevent overlap
      margin: {
        item: {
          horizontal: 20,
          vertical: 15
        },
        axis: 20
      },
      // Horizontal scrolling
      horizontalScroll: true,
      maxHeight: '100%',
      groupTemplate: (group: any) => {
        if (!group || !group.content) {
          return '<div style="padding: 8px;"><span style="font-weight: 500; color: rgba(255, 255, 255, 0.9); font-size: 13px;">Unknown</span></div>';
        }
        return `<div style="padding: 8px;">
          <span style="font-weight: 500; color: rgba(255, 255, 255, 0.9); font-size: 13px;">${group.content}</span>
        </div>`;
      },
      tooltip: {
        template: (item: any) => {
          if (item.data?.type === 'memory') {
            return `<div style="padding: 8px; max-width: 300px;">
              <strong style="display: block; margin-bottom: 4px;">${new Date(item.start).toLocaleDateString()}</strong>
              <span style="font-size: 13px;">${item.title}</span>
            </div>`;
          }
          return item.content;
        }
      }
    };

    const timeline = new Timeline(timelineRef.current, itemsDataSet, groupsDataSet, options);

    // Handle selection
    timeline.on('select', (properties: any) => {
      if (properties.items && properties.items.length > 0) {
        const itemId = properties.items[0];
        const item = itemsDataSet.get(itemId);
        if (item?.data) {
          if (item.data.type === 'memory') {
            setSelectedItem(itemId);
            onEntrySelect?.(item.data.entry);
            // Also trigger entity modal
            if (typeof window !== 'undefined' && (window as any).openEntityModal) {
              (window as any).openEntityModal({
                type: 'memory',
                id: item.data.entry.id,
                memory: item.data.entry,
                content: item.data.entry.content,
                date: item.data.entry.start_time
              });
            }
          } else if (item.data.type === 'timeline') {
            setSelectedTimeline(item.data.timeline);
            onTimelineSelect?.(item.data.timeline);
          }
        }
      } else {
        setSelectedItem(null);
        setSelectedTimeline(null);
      }
    });

    timelineInstanceRef.current = timeline;

    // Fit timeline to show all data initially
    setTimeout(() => {
      if (allItems.length > 0) {
        timeline.fit();
      }
    }, 100);

    return () => {
      if (timelineInstanceRef.current) {
        timelineInstanceRef.current.destroy();
        timelineInstanceRef.current = null;
      }
    };
  }, [chronologyLoading, timelinesLoading, timelineHeight, Timeline, DataSet]); // Re-init when libraries load

  // Update timeline data when items/groups change (but timeline is already initialized)
  useEffect(() => {
    if (timelineInstanceRef.current && !chronologyLoading && !timelinesLoading && DataSet && groups.length > 0) {
      try {
        const itemsDataSet = new DataSet(allItems);
        const groupsDataSet = new DataSet(groups);
        
        // Update items first
        if (allItems.length > 0) {
          timelineInstanceRef.current.setItems(itemsDataSet);
        }
        
        // Then update groups (only if groups exist and are valid)
        if (groups.length > 0) {
          timelineInstanceRef.current.setGroups(groupsDataSet);
        }
        
        // Re-fit if we have new data
        if (allItems.length > 0) {
          setTimeout(() => {
            timelineInstanceRef.current?.fit();
          }, 50);
        }
      } catch (error) {
        console.error('Error updating timeline:', error);
      }
    }
  }, [allItems, groups, chronologyLoading, timelinesLoading, DataSet]);

  const handleZoomIn = () => {
    if (timelineInstanceRef.current) {
      const range = timelineInstanceRef.current.getWindow();
      const zoom = (range.end.getTime() - range.start.getTime()) * 0.6; // Zoom in by 40%
      const center = range.start.getTime() + (range.end.getTime() - range.start.getTime()) / 2;
      timelineInstanceRef.current.setWindow(
        new Date(center - zoom / 2),
        new Date(center + zoom / 2)
      );
    }
  };

  const handleZoomOut = () => {
    if (timelineInstanceRef.current) {
      const range = timelineInstanceRef.current.getWindow();
      const zoom = (range.end.getTime() - range.start.getTime()) * 1.67; // Zoom out by 67%
      const center = range.start.getTime() + (range.end.getTime() - range.start.getTime()) / 2;
      timelineInstanceRef.current.setWindow(
        new Date(center - zoom / 2),
        new Date(center + zoom / 2)
      );
    }
  };

  const handleFit = () => {
    if (timelineInstanceRef.current && allItems.length > 0) {
      timelineInstanceRef.current.fit();
    }
  };

  const handleZoomToToday = () => {
    if (timelineInstanceRef.current) {
      const now = new Date();
      const oneMonthAgo = new Date(now);
      oneMonthAgo.setMonth(now.getMonth() - 1);
      const oneMonthAhead = new Date(now);
      oneMonthAhead.setMonth(now.getMonth() + 1);
      timelineInstanceRef.current.setWindow(oneMonthAgo, oneMonthAhead);
    }
  };

  if (chronologyLoading || timelinesLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-3" />
          <p className="text-sm text-white/60">Loading timeline...</p>
        </div>
      </div>
    );
  }

  if (allItems.length === 0) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center max-w-md">
          <Calendar className="w-12 h-12 text-white/30 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-white mb-2">
            No timeline data
          </h3>
          <p className="text-sm text-white/60">
            Start journaling to see your timeline come to life
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col bg-transparent" style={{ height: '100%', minHeight: 0 }}>
      {/* Minimal Controls */}
      <div className="flex items-center justify-between p-3 border-b border-border/60 bg-black/20 flex-shrink-0 backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <span className="text-sm text-white/60">
            {allItems.length} {allItems.length === 1 ? 'item' : 'items'}
          </span>
          {selectedItem && (
            <span className="text-xs px-2 py-1 bg-primary/20 text-primary border border-primary/30 rounded">
              Selected
            </span>
          )}
        </div>
        
        <div className="flex items-center gap-2">
          <button
            onClick={handleZoomOut}
            className="px-3 py-1.5 rounded bg-black/40 border border-border/60 hover:bg-primary/20 hover:border-primary/40 transition-colors text-white/80 hover:text-white flex items-center gap-1.5 text-xs"
            title="Zoom out (Ctrl + Scroll)"
          >
            <ZoomOut className="w-4 h-4" />
            <span>Zoom Out</span>
          </button>
          <button
            onClick={handleZoomIn}
            className="px-3 py-1.5 rounded bg-black/40 border border-border/60 hover:bg-primary/20 hover:border-primary/40 transition-colors text-white/80 hover:text-white flex items-center gap-1.5 text-xs"
            title="Zoom in (Ctrl + Scroll)"
          >
            <ZoomIn className="w-4 h-4" />
            <span>Zoom In</span>
          </button>
          <button
            onClick={handleZoomToToday}
            className="px-3 py-1.5 rounded bg-black/40 border border-border/60 hover:bg-primary/20 hover:border-primary/40 transition-colors text-white/80 hover:text-white flex items-center gap-1.5 text-xs"
            title="Zoom to today"
          >
            <Calendar className="w-4 h-4" />
            <span>Today</span>
          </button>
          <button
            onClick={handleFit}
            className="px-3 py-1.5 rounded bg-black/40 border border-border/60 hover:bg-primary/20 hover:border-primary/40 transition-colors text-white/80 hover:text-white flex items-center gap-1.5 text-xs"
            title="Fit to all data"
          >
            <Maximize2 className="w-4 h-4" />
            <span>Fit All</span>
          </button>
        </div>
      </div>

      {/* Timeline Canvas - Scrollable with visible scrollbar (both directions) */}
      <div 
        className="flex-1 relative overflow-auto timeline-scrollable" 
        style={{ 
          height: '100%',
          minHeight: 0,
          maxHeight: 'none'
        }}
      >
        <div ref={timelineRef} style={{ minHeight: `${timelineHeight}px`, height: `${timelineHeight}px`, minWidth: '100%' }} />
      </div>
    </div>
  );
};
