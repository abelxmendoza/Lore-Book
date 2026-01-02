import React, { useMemo } from 'react';
import { Network, Link2 } from 'lucide-react';
import { useChronology } from '../../hooks/useChronology';
import { useTimelineV2 } from '../../hooks/useTimelineV2';
import type { ChronologyEntry, Timeline } from '../../types/timelineV2';

interface GraphTimelineViewProps {
  onEntrySelect?: (entry: ChronologyEntry) => void;
  onTimelineSelect?: (timeline: Timeline) => void;
}

export const GraphTimelineView: React.FC<GraphTimelineViewProps> = ({
  onEntrySelect,
  onTimelineSelect
}) => {
  const { entries: chronologyEntries, loading: chronologyLoading } = useChronology();
  const { timelines, loading: timelinesLoading } = useTimelineV2();

  // Build graph structure: timelines as nodes, relationships as edges
  const graphData = useMemo(() => {
    const nodes = timelines.map(timeline => ({
      id: timeline.id,
      label: timeline.title,
      type: timeline.timeline_type,
      timeline
    }));

    const edges: Array<{ from: string; to: string; type: string }> = [];
    
    // Create edges based on parent-child relationships
    timelines.forEach(timeline => {
      if (timeline.parent_id) {
        edges.push({
          from: timeline.parent_id,
          to: timeline.id,
          type: 'parent-child'
        });
      }
    });

    // Create edges based on shared entries
    timelines.forEach((timeline, i) => {
      timelines.slice(i + 1).forEach(otherTimeline => {
        const sharedEntries = chronologyEntries.filter(e =>
          e.timeline_memberships?.includes(timeline.id) &&
          e.timeline_memberships?.includes(otherTimeline.id)
        );
        if (sharedEntries.length > 0) {
          edges.push({
            from: timeline.id,
            to: otherTimeline.id,
            type: 'shared-memories'
          });
        }
      });
    });

    return { nodes, edges };
  }, [timelines, chronologyEntries]);

  const loading = chronologyLoading || timelinesLoading;

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-3" />
          <p className="text-sm text-white/60">Loading graph...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-auto p-6" style={{ height: '100%', minHeight: 0 }}>
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-white mb-2 flex items-center gap-2">
          <Network className="w-5 h-5 text-primary" />
          Timeline Relationships
        </h2>
        <p className="text-sm text-white/60">
          {graphData.nodes.length} timelines • {graphData.edges.length} connections
        </p>
      </div>

      {/* Graph Visualization (simplified for now) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        {/* Nodes */}
        <div className="bg-black/40 border border-border/60 rounded-lg p-4 backdrop-blur-sm">
          <h3 className="text-sm font-medium text-white/80 mb-3">Timelines</h3>
          <div className="space-y-2">
            {graphData.nodes.map((node) => (
              <div
                key={node.id}
                className="flex items-center gap-2 p-2 bg-black/40 rounded cursor-pointer hover:bg-primary/20 transition-colors"
                onClick={() => onTimelineSelect?.(node.timeline)}
              >
                <div className="w-3 h-3 rounded-full bg-primary" />
                <span className="text-sm text-white/90">{node.label}</span>
                <span className="text-xs text-white/40 ml-auto">{node.type}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Edges */}
        <div className="bg-black/40 border border-border/60 rounded-lg p-4 backdrop-blur-sm">
          <h3 className="text-sm font-medium text-white/80 mb-3">Connections</h3>
          <div className="space-y-2">
            {graphData.edges.length === 0 ? (
              <p className="text-sm text-white/40">No connections found</p>
            ) : (
              graphData.edges.map((edge, idx) => {
                const fromNode = graphData.nodes.find(n => n.id === edge.from);
                const toNode = graphData.nodes.find(n => n.id === edge.to);
                return (
                  <div key={idx} className="flex items-center gap-2 p-2 bg-black/40 rounded">
                    <Link2 className="w-4 h-4 text-primary/60" />
                    <span className="text-xs text-white/70">
                      {fromNode?.label} → {toNode?.label}
                    </span>
                    <span className="text-xs text-white/40 ml-auto">{edge.type}</span>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Statistics */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-black/40 border border-border/60 rounded-lg p-4 backdrop-blur-sm">
          <p className="text-xs text-white/60 mb-1">Total Timelines</p>
          <p className="text-2xl font-semibold text-white">{graphData.nodes.length}</p>
        </div>
        <div className="bg-black/40 border border-border/60 rounded-lg p-4 backdrop-blur-sm">
          <p className="text-xs text-white/60 mb-1">Connections</p>
          <p className="text-2xl font-semibold text-white">{graphData.edges.length}</p>
        </div>
        <div className="bg-black/40 border border-border/60 rounded-lg p-4 backdrop-blur-sm">
          <p className="text-xs text-white/60 mb-1">Memories</p>
          <p className="text-2xl font-semibold text-white">{chronologyEntries.length}</p>
        </div>
      </div>
    </div>
  );
};
