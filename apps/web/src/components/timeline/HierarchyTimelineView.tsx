import React, { useMemo } from 'react';
import { Layers, Calendar, GitBranch, ChevronRight, ChevronDown, Clock, Tag } from 'lucide-react';
import { useChronology } from '../../hooks/useChronology';
import { useTimelineV2 } from '../../hooks/useTimelineV2';
import { useEntityModal } from '../../contexts/EntityModalContext';
import type { ChronologyEntry, Timeline } from '../../types/timelineV2';

interface HierarchyTimelineViewProps {
  onEntrySelect?: (entry: ChronologyEntry) => void;
  onTimelineSelect?: (timeline: Timeline) => void;
}

export const HierarchyTimelineView: React.FC<HierarchyTimelineViewProps> = ({
  onEntrySelect,
  onTimelineSelect
}) => {
  const { entries: chronologyEntries, loading: chronologyLoading } = useChronology();
  const { timelines, loading: timelinesLoading } = useTimelineV2();
  const { openMemory, openCharacter } = useEntityModal();
  const [expandedTimelines, setExpandedTimelines] = React.useState<Set<string>>(new Set());

  // Build hierarchy: root timelines -> children -> entries
  const hierarchy = useMemo(() => {
    const rootTimelines = timelines.filter(t => !t.parent_id);
    
    return rootTimelines.map(root => {
      const children = timelines.filter(t => t.parent_id === root.id);
      const rootEntries = chronologyEntries.filter(e => 
        e.timeline_memberships?.includes(root.id) && 
        !children.some(child => e.timeline_memberships?.includes(child.id))
      );
      
      const childData = children.map(child => {
        const childEntries = chronologyEntries.filter(e => 
          e.timeline_memberships?.includes(child.id)
        );
        return {
          ...child,
          entries: childEntries
        };
      });
      
      return {
        ...root,
        children: childData,
        entries: rootEntries
      };
    });
  }, [timelines, chronologyEntries]);

  const toggleExpand = (timelineId: string) => {
    setExpandedTimelines(prev => {
      const next = new Set(prev);
      if (next.has(timelineId)) {
        next.delete(timelineId);
      } else {
        next.add(timelineId);
      }
      return next;
    });
  };

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

  if (hierarchy.length === 0) {
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
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-white mb-2 flex items-center gap-2">
          <Layers className="w-5 h-5 text-primary" />
          Timeline Hierarchy
        </h2>
        <p className="text-sm text-white/60">
          {hierarchy.length} root {hierarchy.length === 1 ? 'timeline' : 'timelines'} • {chronologyEntries.length} total memories
        </p>
      </div>

      <div className="space-y-4">
        {hierarchy.map((root) => {
          const isExpanded = expandedTimelines.has(root.id);
          const totalEntries = root.entries.length + root.children.reduce((sum, child) => sum + child.entries.length, 0);
          
          return (
            <div key={root.id} className="bg-black/40 border border-border/60 rounded-lg overflow-hidden backdrop-blur-sm">
              {/* Root Timeline Header */}
              <div 
                className="flex items-center gap-3 p-4 cursor-pointer hover:bg-white/5 transition-colors border-b border-border/40"
                onClick={() => toggleExpand(root.id)}
              >
                {isExpanded ? (
                  <ChevronDown className="w-5 h-5 text-primary flex-shrink-0" />
                ) : (
                  <ChevronRight className="w-5 h-5 text-primary/60 flex-shrink-0" />
                )}
                <GitBranch className="w-5 h-5 text-primary flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <h3 className="text-lg font-semibold text-white mb-1">{root.title}</h3>
                  <div className="flex items-center gap-3 flex-wrap">
                    <p className="text-sm text-white/60">{root.description || root.timeline_type.replace('_', ' ')}</p>
                    <span className="text-xs px-2 py-0.5 bg-primary/20 text-primary border border-primary/30 rounded">
                      {root.timeline_type.replace('_', ' ')}
                    </span>
                    <span className="text-xs text-white/40">
                      {totalEntries} {totalEntries === 1 ? 'memory' : 'memories'}
                    </span>
                  </div>
                </div>
                <div className="text-xs text-white/40 flex-shrink-0">
                  <div className="flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5" />
                    {new Date(root.start_date).toLocaleDateString()}
                  </div>
                  {root.end_date && (
                    <div className="text-white/30 mt-1">
                      - {new Date(root.end_date).toLocaleDateString()}
                    </div>
                  )}
                </div>
              </div>

              {/* Expanded Content */}
              {isExpanded && (
                <div className="p-4 space-y-4 bg-black/20">
                  {/* Root Timeline Entries */}
                  {root.entries.length > 0 && (
                    <div>
                      <h4 className="text-sm font-medium text-white/80 mb-3 flex items-center gap-2">
                        <Tag className="w-4 h-4 text-primary/60" />
                        Root Timeline Memories ({root.entries.length})
                      </h4>
                      <div className="space-y-2 ml-6">
                        {root.entries.slice(0, 5).map((entry) => (
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
                        {root.entries.length > 5 && (
                          <p className="text-xs text-white/40 mt-2 ml-3">+{root.entries.length - 5} more memories</p>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Child Timelines */}
                  {root.children.length > 0 && (
                    <div>
                      <h4 className="text-sm font-medium text-white/80 mb-3 flex items-center gap-2">
                        <GitBranch className="w-4 h-4 text-primary/60" />
                        Child Timelines ({root.children.length})
                      </h4>
                      <div className="space-y-3 ml-6">
                        {root.children.map((child) => {
                          const isChildExpanded = expandedTimelines.has(child.id);
                          return (
                            <div key={child.id} className="bg-black/40 border border-border/40 rounded-lg overflow-hidden">
                              {/* Child Timeline Header */}
                              <div
                                className="flex items-center gap-2 p-3 cursor-pointer hover:bg-white/5 transition-colors"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleExpand(child.id);
                                }}
                              >
                                {isChildExpanded ? (
                                  <ChevronDown className="w-4 h-4 text-primary/60 flex-shrink-0" />
                                ) : (
                                  <ChevronRight className="w-4 h-4 text-primary/40 flex-shrink-0" />
                                )}
                                <Calendar className="w-4 h-4 text-primary/60 flex-shrink-0" />
                                <div className="flex-1 min-w-0">
                                  <h5 className="text-sm font-medium text-white/90">{child.title}</h5>
                                  <p className="text-xs text-white/50">{child.timeline_type.replace('_', ' ')}</p>
                                </div>
                                <span className="text-xs text-white/40">
                                  {child.entries.length} {child.entries.length === 1 ? 'memory' : 'memories'}
                                </span>
                              </div>

                              {/* Child Timeline Entries */}
                              {isChildExpanded && child.entries.length > 0 && (
                                <div className="p-3 space-y-2 bg-black/20">
                                  {child.entries.slice(0, 5).map((entry) => (
                                    <div
                                      key={entry.id}
                                      className="bg-black/40 border border-border/30 rounded p-2 cursor-pointer hover:border-primary/40 hover:bg-black/60 transition-all"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        onEntrySelect?.(entry);
                                      }}
                                    >
                                      <p className="text-xs text-white/70 line-clamp-2 mb-1">{entry.content}</p>
                                      <div className="flex items-center gap-1.5 text-xs text-white/40">
                                        <Clock className="w-3 h-3" />
                                        {new Date(entry.start_time).toLocaleDateString()}
                                      </div>
                                    </div>
                                  ))}
                                  {child.entries.length > 5 && (
                                    <p className="text-xs text-white/40 mt-1 ml-2">+{child.entries.length - 5} more</p>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Empty State */}
                  {root.entries.length === 0 && root.children.length === 0 && (
                    <div className="text-center py-8 text-white/40">
                      <p className="text-sm">No memories in this timeline yet</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
