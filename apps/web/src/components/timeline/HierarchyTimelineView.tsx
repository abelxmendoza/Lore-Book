import React, { useMemo, useState, useCallback } from 'react';
import { Layers, Calendar, GitBranch, ChevronRight, ChevronDown, Clock, Tag, Search, X, ArrowRight, List, BarChart3 } from 'lucide-react';
import { useChronology } from '../../hooks/useChronology';
import { useTimelineV2 } from '../../hooks/useTimelineV2';
import { useEntityModal } from '../../contexts/EntityModalContext';
import { Badge } from '../ui/badge';
import type { ChronologyEntry, Timeline } from '../../types/timelineV2';

interface HierarchyTimelineViewProps {
  onEntrySelect?: (entry: ChronologyEntry) => void;
  onTimelineSelect?: (timeline: Timeline) => void;
}

interface TimelineNode extends Timeline {
  children: TimelineNode[];
  entries: ChronologyEntry[];
  depth: number;
}

// Recursive component for rendering nested timelines
const TimelineNodeComponent: React.FC<{
  node: TimelineNode;
  expandedTimelines: Set<string>;
  selectedTimelineId: string | null;
  highlightedTimelineId: string | null;
  onToggleExpand: (id: string) => void;
  onTimelineClick: (timeline: Timeline) => void;
  onEntrySelect?: (entry: ChronologyEntry) => void;
  openMemory: (entry: ChronologyEntry) => void;
  depth: number;
  onNodeRef?: (id: string, element: HTMLDivElement | null) => void;
}> = ({
  node,
  expandedTimelines,
  selectedTimelineId,
  highlightedTimelineId,
  onToggleExpand,
  onTimelineClick,
  onEntrySelect,
  openMemory,
  depth,
  onNodeRef
}) => {
  const isExpanded = expandedTimelines.has(node.id);
  const isSelected = selectedTimelineId === node.id;
  const isHighlighted = highlightedTimelineId === node.id;
  const layerMetadata = node.metadata as { layer?: string; layer_order?: number } | undefined;
  const layerName = layerMetadata?.layer || node.timeline_type.replace('_', ' ');
  const layerOrder = layerMetadata?.layer_order || 0;

  // Color coding based on layer
  const getLayerColor = (layer: string | undefined) => {
    switch (layer) {
      case 'mythos': return 'text-purple-400 border-purple-400/30 bg-purple-400/10';
      case 'epoch': return 'text-blue-400 border-blue-400/30 bg-blue-400/10';
      case 'era': return 'text-cyan-400 border-cyan-400/30 bg-cyan-400/10';
      case 'saga': return 'text-pink-400 border-pink-400/30 bg-pink-400/10';
      case 'arc': return 'text-orange-400 border-orange-400/30 bg-orange-400/10';
      case 'chapter': return 'text-yellow-400 border-yellow-400/30 bg-yellow-400/10';
      case 'scene': return 'text-green-400 border-green-400/30 bg-green-400/10';
      case 'action': return 'text-emerald-400 border-emerald-400/30 bg-emerald-400/10';
      case 'microaction': return 'text-teal-400 border-teal-400/30 bg-teal-400/10';
      default: return 'text-primary border-primary/30 bg-primary/10';
    }
  };

  const layerColorClass = getLayerColor(layerMetadata?.layer);
  const indentLevel = depth * 24; // 24px per level

  const nodeRef = React.useCallback((element: HTMLDivElement | null) => {
    if (onNodeRef) {
      onNodeRef(node.id, element);
    }
  }, [node.id, onNodeRef]);

  return (
    <div className="relative" ref={nodeRef}>
      {/* Visual connection line for nested items */}
      {depth > 0 && (
        <>
          <div 
            className="absolute left-0 top-0 w-px bg-border/40"
            style={{ left: `${indentLevel - 12}px`, height: '20px' }}
          />
          <div 
            className="absolute left-0 top-5 w-12 h-px bg-border/40"
            style={{ left: `${indentLevel - 12}px` }}
          />
        </>
      )}

      <div 
        className={`border rounded-lg overflow-hidden transition-all ${
          isSelected 
            ? 'border-primary bg-primary/20 shadow-lg shadow-primary/20 scale-[1.02]' 
            : isHighlighted
            ? 'border-primary/60 bg-primary/10 shadow-md shadow-primary/10'
            : 'border-border/60 bg-black/40 hover:border-primary/40 hover:bg-black/60'
        } ${layerColorClass.split(' ')[0]}`}
        style={{ marginLeft: `${indentLevel}px` }}
      >
        {/* Timeline Header */}
        <div 
          className="flex items-center gap-3 p-4 cursor-pointer transition-colors"
          onClick={() => {
            onToggleExpand(node.id);
            onTimelineClick(node);
          }}
        >
          {/* Expand/Collapse Icon */}
          {node.children.length > 0 || node.entries.length > 0 ? (
            isExpanded ? (
              <ChevronDown className="w-5 h-5 text-primary flex-shrink-0" />
            ) : (
              <ChevronRight className="w-5 h-5 text-primary/60 flex-shrink-0" />
            )
          ) : (
            <div className="w-5 h-5 flex-shrink-0" />
          )}

          {/* Layer Icon */}
          <div className={`flex-shrink-0 ${layerColorClass.split(' ')[0]}`}>
            <GitBranch className="w-5 h-5" />
          </div>

          {/* Timeline Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h3 className={`text-lg font-semibold ${isSelected ? 'text-white' : 'text-white/90'}`}>
                {node.title}
              </h3>
              <span className={`text-xs px-2 py-0.5 rounded border ${layerColorClass}`}>
                {layerName}
              </span>
              {isSelected && (
                <ArrowRight className="w-4 h-4 text-primary" />
              )}
            </div>
            <p className="text-sm text-white/60 line-clamp-1">{node.description || node.timeline_type.replace('_', ' ')}</p>
            <div className="flex items-center gap-3 mt-2 flex-wrap">
              <span className="text-xs text-white/40">
                {node.entries.length + node.children.reduce((sum, child) => sum + child.entries.length, 0)} {node.entries.length + node.children.reduce((sum, child) => sum + child.entries.length, 0) === 1 ? 'memory' : 'memories'}
              </span>
              {node.children.length > 0 && (
                <span className="text-xs text-white/40">
                  {node.children.length} {node.children.length === 1 ? 'child' : 'children'}
                </span>
              )}
            </div>
          </div>

          {/* Date */}
          <div className="text-xs text-white/40 flex-shrink-0 text-right">
            <div className="flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5" />
              {new Date(node.start_date).toLocaleDateString()}
            </div>
            {node.end_date && (
              <div className="text-white/30 mt-1">
                - {new Date(node.end_date).toLocaleDateString()}
              </div>
            )}
          </div>
        </div>

        {/* Expanded Content */}
        {isExpanded && (
          <div className="p-4 space-y-4 bg-black/20 border-t border-border/40">
            {/* Direct Entries */}
            {node.entries.length > 0 && (
              <div>
                <h4 className="text-sm font-medium text-white/80 mb-3 flex items-center gap-2">
                  <Tag className="w-4 h-4 text-primary/60" />
                  Direct Memories ({node.entries.length})
                </h4>
                <div className="space-y-2 ml-6">
                  {node.entries.slice(0, 5).map((entry) => (
                    <div
                      key={entry.id}
                      className="bg-black/40 border border-border/40 rounded p-3 cursor-pointer hover:border-primary/40 hover:bg-black/60 transition-all"
                      onClick={(e) => {
                        e.stopPropagation();
                        onEntrySelect?.(entry);
                        openMemory(entry);
                      }}
                    >
                      <p className="text-sm text-white/80 line-clamp-2 mb-1">{entry.content}</p>
                      <div className="flex items-center gap-2 text-xs text-white/40">
                        <Clock className="w-3 h-3" />
                        {new Date(entry.start_time).toLocaleDateString()}
                      </div>
                    </div>
                  ))}
                  {node.entries.length > 5 && (
                    <p className="text-xs text-white/40 mt-2 ml-3">+{node.entries.length - 5} more memories</p>
                  )}
                </div>
              </div>
            )}

            {/* Nested Children (Recursive) */}
            {node.children.length > 0 && (
              <div>
                <h4 className="text-sm font-medium text-white/80 mb-3 flex items-center gap-2">
                  <GitBranch className="w-4 h-4 text-primary/60" />
                  Nested Timelines ({node.children.length})
                </h4>
                <div className="space-y-3 ml-6">
                  {node.children.map((child) => (
                    <TimelineNodeComponent
                      key={child.id}
                      node={child}
                      expandedTimelines={expandedTimelines}
                      selectedTimelineId={selectedTimelineId}
                      highlightedTimelineId={highlightedTimelineId}
                      onToggleExpand={onToggleExpand}
                      onTimelineClick={onTimelineClick}
                      onEntrySelect={onEntrySelect}
                      openMemory={openMemory}
                      depth={depth + 1}
                      onNodeRef={onNodeRef}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Empty State */}
            {node.entries.length === 0 && node.children.length === 0 && (
              <div className="text-center py-8 text-white/40">
                <p className="text-sm">No memories or nested timelines</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export const HierarchyTimelineView: React.FC<HierarchyTimelineViewProps> = ({
  onEntrySelect,
  onTimelineSelect
}) => {
  const { entries: chronologyEntries, loading: chronologyLoading } = useChronology();
  const { timelines, loading: timelinesLoading } = useTimelineV2();
  const { openMemory, openCharacter } = useEntityModal();
  const [expandedTimelines, setExpandedTimelines] = React.useState<Set<string>>(new Set());
  const [selectedTimelineId, setSelectedTimelineId] = React.useState<string | null>(null);
  const [focusedTimelineId, setFocusedTimelineId] = React.useState<string | null>(null); // The timeline we're "inside" viewing
  const [searchQuery, setSearchQuery] = React.useState('');
  const [highlightedTimelineId, setHighlightedTimelineId] = React.useState<string | null>(null);
  const [navigationStack, setNavigationStack] = React.useState<Timeline[]>([]); // Breadcrumb trail
  const [childViewMode, setChildViewMode] = React.useState<'list' | 'timeline'>('list'); // View mode for children

  // Get direct children of a timeline
  const getDirectChildren = useCallback((parentId: string | null): TimelineNode[] => {
    const children = timelines
      .filter(t => t.parent_id === parentId)
      .map(timeline => {
        const entries = chronologyEntries.filter(e => 
          e.timeline_memberships?.includes(timeline.id)
        );
        
        // Get depth by counting parent chain
        let depth = 0;
        let currentId = timeline.parent_id;
        while (currentId) {
          depth++;
          const parent = timelines.find(t => t.id === currentId);
          currentId = parent?.parent_id || null;
        }
        
        return {
          ...timeline,
          children: [], // Will be populated if needed
          entries,
          depth
        };
      });

    // Filter out entries that belong to children
    const childTimelineIds = new Set(children.map(c => c.id));
    children.forEach(child => {
      child.entries = child.entries.filter(entry => 
        !entry.timeline_memberships?.some(id => childTimelineIds.has(id))
      );
    });

    return children;
  }, [timelines, chronologyEntries]);

  // Get the focused timeline and its children
  const focusedView = useMemo(() => {
    if (!focusedTimelineId) return null;
    
    const focusedTimeline = timelines.find(t => t.id === focusedTimelineId);
    if (!focusedTimeline) return null;

    const entries = chronologyEntries.filter(e => 
      e.timeline_memberships?.includes(focusedTimelineId)
    );
    
    const children = getDirectChildren(focusedTimelineId);
    
    // Filter entries that belong to children
    const childTimelineIds = new Set(children.map(c => c.id));
    const directEntries = entries.filter(entry => 
      !entry.timeline_memberships?.some(id => childTimelineIds.has(id))
    );

    return {
      timeline: focusedTimeline,
      children,
      entries: directEntries
    };
  }, [focusedTimelineId, timelines, chronologyEntries, getDirectChildren]);

  // Build recursive hierarchy tree (for root view)
  const buildHierarchyTree = useCallback((allTimelines: Timeline[], allEntries: ChronologyEntry[]): TimelineNode[] => {
    const timelineMap = new Map<string, TimelineNode>();
    const rootNodes: TimelineNode[] = [];

    // First pass: create all nodes
    allTimelines.forEach(timeline => {
      const entries = allEntries.filter(e => 
        e.timeline_memberships?.includes(timeline.id)
      );
      
      timelineMap.set(timeline.id, {
        ...timeline,
        children: [],
        entries,
        depth: 0
      });
    });

    // Second pass: build parent-child relationships
    allTimelines.forEach(timeline => {
      const node = timelineMap.get(timeline.id)!;
      
      if (timeline.parent_id) {
        const parent = timelineMap.get(timeline.parent_id);
        if (parent) {
          // Calculate depth
          node.depth = parent.depth + 1;
          parent.children.push(node);
        } else {
          // Parent not found, treat as root
          rootNodes.push(node);
        }
      } else {
        // Root node
        rootNodes.push(node);
      }
    });

    // Filter out entries that belong to children
    const filterChildEntries = (node: TimelineNode) => {
      const childTimelineIds = new Set<string>();
      const collectChildIds = (n: TimelineNode) => {
        n.children.forEach(child => {
          childTimelineIds.add(child.id);
          collectChildIds(child);
        });
      };
      collectChildIds(node);
      
      node.entries = node.entries.filter(entry => 
        !entry.timeline_memberships?.some(id => childTimelineIds.has(id))
      );
      
      node.children.forEach(child => filterChildEntries(child));
    };

    rootNodes.forEach(root => filterChildEntries(root));

    return rootNodes;
  }, []);

  // Root level hierarchy (only used when not focused)
  const rootHierarchy = useMemo(() => {
    if (focusedTimelineId) return [];
    return buildHierarchyTree(timelines, chronologyEntries);
  }, [timelines, chronologyEntries, buildHierarchyTree, focusedTimelineId]);

  // Search functionality (only for root view)
  const filteredHierarchy = useMemo(() => {
    if (!searchQuery.trim() || focusedTimelineId) return rootHierarchy;

    const query = searchQuery.toLowerCase();
    const matchingIds = new Set<string>();

    const findMatches = (nodes: TimelineNode[]): void => {
      nodes.forEach(node => {
        const matches = 
          node.title.toLowerCase().includes(query) ||
          node.description?.toLowerCase().includes(query) ||
          node.tags.some(tag => tag.toLowerCase().includes(query)) ||
          (node.metadata as { layer?: string } | undefined)?.layer?.toLowerCase().includes(query);

        if (matches) {
          matchingIds.add(node.id);
          // Also add all ancestors
          let currentId = node.parent_id;
          while (currentId) {
            matchingIds.add(currentId);
            const parent = timelines.find(t => t.id === currentId);
            currentId = parent?.parent_id || null;
          }
        }

        if (node.children.length > 0) {
          findMatches(node.children);
        }
      });
    };

    findMatches(rootHierarchy);

    // Filter and expand matching nodes
    const filterNodes = (nodes: TimelineNode[]): TimelineNode[] => {
      return nodes
        .filter(node => matchingIds.has(node.id))
        .map(node => ({
          ...node,
          children: filterNodes(node.children)
        }));
    };

    return filterNodes(rootHierarchy);
  }, [rootHierarchy, searchQuery, timelines, focusedTimelineId]);

  const toggleExpand = useCallback((timelineId: string) => {
    setExpandedTimelines(prev => {
      const next = new Set(prev);
      if (next.has(timelineId)) {
        next.delete(timelineId);
      } else {
        next.add(timelineId);
      }
      return next;
    });
  }, []);

  const timelineRefs = React.useRef<Map<string, HTMLDivElement>>(new Map());

  const handleNodeRef = useCallback((id: string, element: HTMLDivElement | null) => {
    if (element) {
      timelineRefs.current.set(id, element);
    } else {
      timelineRefs.current.delete(id);
    }
  }, []);

  const handleTimelineClick = useCallback((timeline: Timeline) => {
    setSelectedTimelineId(timeline.id);
    onTimelineSelect?.(timeline);
    
    // Check if this timeline has children - if so, "enter" it to view its children
    const hasChildren = timelines.some(t => t.parent_id === timeline.id);
    
    if (hasChildren) {
      // Enter this timeline - add to navigation stack and focus on it
      setFocusedTimelineId(timeline.id);
      setNavigationStack(prev => {
        // If we're already in a focused view, add current focus to stack
        if (focusedTimelineId) {
          const currentFocus = timelines.find(t => t.id === focusedTimelineId);
          if (currentFocus) {
            return [...prev, currentFocus];
          }
        }
        return prev;
      });
    } else {
      // No children, just select it
      setHighlightedTimelineId(timeline.id);
      setTimeout(() => setHighlightedTimelineId(null), 3000);
    }
    
    // Scroll to timeline
    setTimeout(() => {
      const element = timelineRefs.current.get(timeline.id);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 100);
  }, [onTimelineSelect, timelines, focusedTimelineId]);

  const handleNavigateBack = useCallback(() => {
    if (navigationStack.length > 0) {
      // Go back to previous timeline in stack
      const previousTimeline = navigationStack[navigationStack.length - 1];
      setFocusedTimelineId(previousTimeline.id);
      setNavigationStack(prev => prev.slice(0, -1));
    } else {
      // Go back to root view
      setFocusedTimelineId(null);
    }
  }, [navigationStack]);

  const handleNavigateToRoot = useCallback(() => {
    setFocusedTimelineId(null);
    setNavigationStack([]);
  }, []);

  // Auto-expand search results (only in root view)
  React.useEffect(() => {
    if (searchQuery.trim() && filteredHierarchy.length > 0 && !focusedTimelineId) {
      const expandAll = (nodes: TimelineNode[]) => {
        nodes.forEach(node => {
          setExpandedTimelines(prev => new Set([...prev, node.id]));
          if (node.children.length > 0) {
            expandAll(node.children);
          }
        });
      };
      expandAll(filteredHierarchy);
    }
  }, [searchQuery, filteredHierarchy, focusedTimelineId]);

  const loading = chronologyLoading || timelinesLoading;

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-3" />
          <p className="text-sm text-white/60">Loading hierarchy...</p>
        </div>
      </div>
    );
  }

  // Determine what to display
  const displayData = focusedView || {
    timeline: null,
    children: searchQuery.trim() ? filteredHierarchy : rootHierarchy,
    entries: []
  };

  if (!focusedTimelineId && rootHierarchy.length === 0) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center max-w-md">
          <Layers className="w-12 h-12 text-white/30 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-white mb-2">No timeline hierarchy</h3>
          <p className="text-sm text-white/60">Create timelines to see hierarchical structure</p>
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-y-auto p-6" style={{ height: '100%', minHeight: 0 }}>
      {/* Header with Navigation and Search */}
      <div className="mb-6 space-y-4">
        {/* Breadcrumb Navigation */}
        {focusedTimelineId && (
          <div className="flex items-center gap-2 text-sm text-white/60 mb-4">
            <button
              onClick={handleNavigateToRoot}
              className="hover:text-white transition-colors flex items-center gap-1"
            >
              <Layers className="w-4 h-4" />
              All Timelines
            </button>
            {navigationStack.map((timeline, index) => (
              <React.Fragment key={timeline.id}>
                <span>/</span>
                <button
                  onClick={() => {
                    setFocusedTimelineId(timeline.id);
                    setNavigationStack(prev => prev.slice(0, index + 1));
                  }}
                  className="hover:text-white transition-colors"
                >
                  {timeline.title}
                </button>
              </React.Fragment>
            ))}
            {focusedView && (
              <>
                <span>/</span>
                <span className="text-white">{focusedView.timeline.title}</span>
              </>
            )}
          </div>
        )}

        <div>
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-xl font-semibold text-white flex items-center gap-2">
              <Layers className="w-5 h-5 text-primary" />
              {focusedView ? focusedView.timeline.title : 'Timeline Hierarchy'}
            </h2>
            {focusedTimelineId && (
              <button
                onClick={handleNavigateBack}
                className="text-sm text-primary hover:text-primary/80 transition-colors flex items-center gap-1"
              >
                <ArrowRight className="w-4 h-4 rotate-180" />
                Back
              </button>
            )}
          </div>
          <p className="text-sm text-white/60">
            {focusedView 
              ? `${focusedView.children.length} ${focusedView.children.length === 1 ? 'child timeline' : 'child timelines'} • ${focusedView.entries.length} direct ${focusedView.entries.length === 1 ? 'memory' : 'memories'}`
              : `${rootHierarchy.length} root ${rootHierarchy.length === 1 ? 'timeline' : 'timelines'} • ${chronologyEntries.length} total memories`
            }
          </p>
        </div>

        {/* Search Bar (only in root view) */}
        {!focusedTimelineId && (
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-white/40" />
            <input
              type="text"
              placeholder="Search timelines by name, description, or layer..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-10 py-2 bg-black/40 border border-border/60 rounded-lg text-white placeholder-white/40 focus:outline-none focus:border-primary/60 focus:ring-1 focus:ring-primary/30"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-white/40 hover:text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        )}

        {searchQuery.trim() && !focusedTimelineId && (
          <p className="text-xs text-white/60">
            Found {filteredHierarchy.length} matching {filteredHierarchy.length === 1 ? 'timeline' : 'timelines'}
          </p>
        )}
      </div>

      {/* Focused View: Show current timeline and its direct children */}
      {focusedView ? (
        <div className="space-y-4">
          {/* Current Timeline Card */}
          <div className="bg-primary/10 border-2 border-primary/40 rounded-lg p-6">
            <div className="flex items-start justify-between mb-4">
              <div className="flex-1">
                <h3 className="text-2xl font-bold text-white mb-2">{focusedView.timeline.title}</h3>
                <p className="text-white/70 mb-3">{focusedView.timeline.description || 'No description'}</p>
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-xs px-2 py-1 bg-primary/20 text-primary border border-primary/30 rounded">
                    {(focusedView.timeline.metadata as { layer?: string } | undefined)?.layer || focusedView.timeline.timeline_type.replace('_', ' ')}
                  </span>
                  <span className="text-xs text-white/60">
                    {new Date(focusedView.timeline.start_date).toLocaleDateString()}
                    {focusedView.timeline.end_date && ` - ${new Date(focusedView.timeline.end_date).toLocaleDateString()}`}
                  </span>
                </div>
              </div>
            </div>

            {/* Direct Entries */}
            {focusedView.entries.length > 0 && (
              <div className="mt-4 pt-4 border-t border-border/40">
                <h4 className="text-sm font-medium text-white/80 mb-3 flex items-center gap-2">
                  <Tag className="w-4 h-4 text-primary/60" />
                  Direct Memories ({focusedView.entries.length})
                </h4>
                <div className="space-y-2">
                  {focusedView.entries.slice(0, 3).map((entry) => (
                    <div
                      key={entry.id}
                      className="bg-black/40 border border-border/40 rounded p-3 cursor-pointer hover:border-primary/40 hover:bg-black/60 transition-all"
                      onClick={() => {
                        onEntrySelect?.(entry);
                        openMemory(entry);
                      }}
                    >
                      <p className="text-sm text-white/80 line-clamp-2 mb-1">{entry.content}</p>
                      <div className="flex items-center gap-2 text-xs text-white/40">
                        <Clock className="w-3 h-3" />
                        {new Date(entry.start_time).toLocaleDateString()}
                      </div>
                    </div>
                  ))}
                  {focusedView.entries.length > 3 && (
                    <p className="text-xs text-white/40 mt-2">+{focusedView.entries.length - 3} more memories</p>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Child Timelines */}
          {focusedView.children.length > 0 ? (
            <div>
              <div className="flex items-center justify-between mb-4">
                <h4 className="text-lg font-semibold text-white flex items-center gap-2">
                  <GitBranch className="w-5 h-5 text-primary" />
                  Child Timelines ({focusedView.children.length})
                </h4>
                {/* View Mode Toggle */}
                <div className="flex items-center gap-2 bg-black/40 border border-border/60 rounded-lg p-1">
                  <button
                    onClick={() => setChildViewMode('list')}
                    className={`px-3 py-1.5 rounded text-sm transition-colors flex items-center gap-1.5 ${
                      childViewMode === 'list'
                        ? 'bg-primary text-white'
                        : 'text-white/60 hover:text-white'
                    }`}
                  >
                    <List className="w-4 h-4" />
                    List
                  </button>
                  <button
                    onClick={() => setChildViewMode('timeline')}
                    className={`px-3 py-1.5 rounded text-sm transition-colors flex items-center gap-1.5 ${
                      childViewMode === 'timeline'
                        ? 'bg-primary text-white'
                        : 'text-white/60 hover:text-white'
                    }`}
                  >
                    <BarChart3 className="w-4 h-4" />
                    Timeline
                  </button>
                </div>
              </div>

              {childViewMode === 'list' ? (
                <div className="space-y-3">
                  {sortedChildren.map((child) => {
                    const concurrentCount = getConcurrentTimelines(child, focusedView.children).length;
                    const childNode: TimelineNode = {
                      ...child,
                      children: [],
                      entries: child.entries,
                      depth: 0
                    };
                    return (
                      <div key={child.id} className="relative">
                        <TimelineNodeComponent
                          node={childNode}
                          expandedTimelines={expandedTimelines}
                          selectedTimelineId={selectedTimelineId}
                          highlightedTimelineId={highlightedTimelineId}
                          onToggleExpand={toggleExpand}
                          onTimelineClick={handleTimelineClick}
                          onEntrySelect={onEntrySelect}
                          openMemory={openMemory}
                          depth={0}
                          onNodeRef={handleNodeRef}
                        />
                        {concurrentCount > 0 && (
                          <div className="absolute top-2 right-2">
                            <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-400/30 text-xs">
                              {concurrentCount} concurrent
                            </Badge>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                /* Timeline Visualization */
                timelineDateRange ? (
                  <div className="bg-black/40 border border-border/60 rounded-lg p-4">
                    {/* Timeline Header with Date Range */}
                    <div className="mb-4 flex items-center justify-between text-sm text-white/60">
                      <span>{new Date(timelineDateRange.minDate).toLocaleDateString()}</span>
                      <span className="text-white/40">→</span>
                      <span>{new Date(timelineDateRange.maxDate).toLocaleDateString()}</span>
                    </div>
                    
                    {/* Timeline Bars */}
                    <div className="space-y-3 relative" style={{ minHeight: `${sortedChildren.length * 60}px` }}>
                      {sortedChildren.map((child, index) => {
                        const childStart = new Date(child.start_date).getTime();
                        const childEnd = child.end_date ? new Date(child.end_date).getTime() : Date.now();
                        const startPos = ((childStart - timelineDateRange.minDate.getTime()) / timelineDateRange.range) * 100;
                        const endPos = ((childEnd - timelineDateRange.minDate.getTime()) / timelineDateRange.range) * 100;
                        const width = endPos - startPos;
                        
                        const layerMetadata = child.metadata as { layer?: string } | undefined;
                        const layerName = layerMetadata?.layer || child.timeline_type.replace('_', ' ');
                        
                        // Get layer color
                        const getLayerColor = (layer: string | undefined) => {
                          switch (layer) {
                            case 'mythos': return { bg: 'bg-purple-400/20', border: 'border-purple-400/50', text: 'text-purple-400' };
                            case 'epoch': return { bg: 'bg-blue-400/20', border: 'border-blue-400/50', text: 'text-blue-400' };
                            case 'era': return { bg: 'bg-cyan-400/20', border: 'border-cyan-400/50', text: 'text-cyan-400' };
                            case 'saga': return { bg: 'bg-pink-400/20', border: 'border-pink-400/50', text: 'text-pink-400' };
                            case 'arc': return { bg: 'bg-orange-400/20', border: 'border-orange-400/50', text: 'text-orange-400' };
                            case 'chapter': return { bg: 'bg-yellow-400/20', border: 'border-yellow-400/50', text: 'text-yellow-400' };
                            case 'scene': return { bg: 'bg-green-400/20', border: 'border-green-400/50', text: 'text-green-400' };
                            case 'action': return { bg: 'bg-emerald-400/20', border: 'border-emerald-400/50', text: 'text-emerald-400' };
                            case 'microaction': return { bg: 'bg-teal-400/20', border: 'border-teal-400/50', text: 'text-teal-400' };
                            default: return { bg: 'bg-primary/20', border: 'border-primary/50', text: 'text-primary' };
                          }
                        };
                        
                        const colors = getLayerColor(layerMetadata?.layer);
                        const concurrentTimelines = getConcurrentTimelines(child, focusedView.children);
                        const hasOverlap = concurrentTimelines.length > 0;
                        
                        return (
                          <div
                            key={child.id}
                            className="relative group cursor-pointer"
                            onClick={() => handleTimelineClick(child)}
                          >
                            {/* Timeline Bar */}
                            <div
                              className={`h-12 rounded border-2 ${colors.bg} ${colors.border} ${colors.text} transition-all hover:opacity-80 hover:scale-[1.02] ${
                                hasOverlap ? 'ring-2 ring-yellow-400/30' : ''
                              }`}
                              style={{
                                marginLeft: `${Math.max(0, startPos)}%`,
                                width: `${Math.max(2, width)}%`,
                                position: 'relative'
                              }}
                            >
                              <div className="p-2 h-full flex items-center justify-between">
                                <div className="flex-1 min-w-0">
                                  <div className="font-medium text-sm truncate">{child.title}</div>
                                  <div className="text-xs opacity-70 truncate">{layerName}</div>
                                </div>
                                <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                                  {hasOverlap && (
                                    <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-400/30 text-xs">
                                      {concurrentTimelines.length} concurrent
                                    </Badge>
                                  )}
                                  {!child.end_date && (
                                    <Badge className="bg-green-500/20 text-green-400 border-green-400/30 text-xs">
                                      Ongoing
                                    </Badge>
                                  )}
                                </div>
                              </div>
                              
                              {/* Date labels */}
                              <div className="absolute -top-5 left-0 text-xs text-white/40 whitespace-nowrap">
                                {new Date(child.start_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                              </div>
                              {child.end_date && (
                                <div className="absolute -top-5 right-0 text-xs text-white/40 whitespace-nowrap">
                                  {new Date(child.end_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    
                    {/* Legend */}
                    <div className="mt-4 pt-4 border-t border-border/40">
                      <div className="flex items-center gap-4 text-xs text-white/60">
                        <div className="flex items-center gap-1.5">
                          <div className="w-3 h-3 rounded border-2 border-yellow-400/50 bg-yellow-400/20" />
                          <span>Overlapping timelines</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <div className="w-3 h-3 rounded border-2 border-green-400/50 bg-green-400/20" />
                          <span>Ongoing</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8 text-white/40">
                    <p className="text-sm">Unable to calculate timeline visualization</p>
                  </div>
                )
              )}
            </div>
          ) : (
            <div className="text-center py-12 text-white/40">
              <GitBranch className="w-12 h-12 mx-auto mb-4 opacity-30" />
              <p className="text-sm">No child timelines</p>
              <p className="text-xs mt-2">This timeline has no nested children</p>
            </div>
          )}
        </div>
      ) : (
        /* Root View: Show all root timelines */
        <div className="space-y-4">
          {(searchQuery.trim() ? filteredHierarchy : rootHierarchy).length === 0 ? (
            <div className="text-center py-12 text-white/40">
              <Search className="w-12 h-12 mx-auto mb-4 opacity-30" />
              <p className="text-sm">No timelines found matching "{searchQuery}"</p>
              <p className="text-xs mt-2">Try a different search term</p>
            </div>
          ) : (
            (searchQuery.trim() ? filteredHierarchy : rootHierarchy).map((root) => (
              <TimelineNodeComponent
                key={root.id}
                node={root}
                expandedTimelines={expandedTimelines}
                selectedTimelineId={selectedTimelineId}
                highlightedTimelineId={highlightedTimelineId}
                onToggleExpand={toggleExpand}
                onTimelineClick={handleTimelineClick}
                onEntrySelect={onEntrySelect}
                openMemory={openMemory}
                depth={0}
                onNodeRef={handleNodeRef}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
};
