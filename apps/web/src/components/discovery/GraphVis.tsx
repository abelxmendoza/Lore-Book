import { useEffect, useRef } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';

interface GraphNode {
  id: string;
  label: string;
  type: string;
  metadata?: Record<string, any>;
}

interface GraphEdge {
  source: string;
  target: string;
  weight: number;
  type: string;
  metadata?: Record<string, any>;
}

interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

interface GraphVisProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
  title?: string;
  height?: number;
}

export const GraphVis = ({ nodes, edges, title, height = 400 }: GraphVisProps) => {
  const graphRef = useRef<any>();

  useEffect(() => {
    if (graphRef.current) {
      // Configure graph appearance
      graphRef.current
        .nodeColor((node: GraphNode) => {
          // Color nodes by type
          const colorMap: Record<string, string> = {
            memory: '#a855f7',
            character: '#ec4899',
            location: '#06b6d4',
            event: '#10b981',
            default: '#8b5cf6'
          };
          return colorMap[node.type] || colorMap.default;
        })
        .nodeLabel((node: GraphNode) => {
          const label = node.label || node.id;
          const metadata = node.metadata || {};
          const parts = [label];
          if (metadata.centrality !== undefined) {
            parts.push(`Centrality: ${metadata.centrality.toFixed(2)}`);
          }
          if (metadata.sentimentScore !== undefined) {
            parts.push(`Sentiment: ${metadata.sentimentScore.toFixed(2)}`);
          }
          return parts.join('\n');
        })
        .linkColor((link: GraphEdge) => {
          // Color edges based on sentiment if available
          const sentiment = link.metadata?.sentiment;
          if (sentiment !== undefined) {
            if (sentiment < -0.3) {
              return 'rgba(239, 68, 68, 0.6)'; // red for conflict
            } else if (sentiment > 0.3) {
              return 'rgba(245, 158, 11, 0.6)'; // gold for intense positive
            } else {
              return 'rgba(59, 130, 246, 0.6)'; // blue for calm
            }
          }
          return 'rgba(168, 85, 247, 0.3)'; // default purple
        })
        .linkWidth((link: GraphEdge) => Math.sqrt(link.weight || 1) * 2)
        .linkDirectionalArrowLength(6)
        .linkDirectionalArrowColor((link: GraphEdge) => {
          const sentiment = link.metadata?.sentiment;
          if (sentiment !== undefined) {
            if (sentiment < -0.3) {
              return 'rgba(239, 68, 68, 0.8)';
            } else if (sentiment > 0.3) {
              return 'rgba(245, 158, 11, 0.8)';
            } else {
              return 'rgba(59, 130, 246, 0.8)';
            }
          }
          return 'rgba(168, 85, 247, 0.6)';
        });
    }
  }, [nodes, edges]);

  if (!nodes || nodes.length === 0) {
    return (
      <Card className="bg-black/40 border-border/60">
        {title && (
          <CardHeader>
            <CardTitle className="text-white">{title}</CardTitle>
          </CardHeader>
        )}
        <CardContent>
          <div className="h-64 flex items-center justify-center text-white/40">
            No graph data available
          </div>
        </CardContent>
      </Card>
    );
  }

  const graphData: GraphData = {
    nodes,
    edges: edges.map(edge => ({
      ...edge,
      source: typeof edge.source === 'string' ? edge.source : edge.source.id,
      target: typeof edge.target === 'string' ? edge.target : edge.target.id
    }))
  };

  return (
    <Card className="bg-black/40 border-border/60">
      {title && (
        <CardHeader>
          <CardTitle className="text-white">{title}</CardTitle>
        </CardHeader>
      )}
      <CardContent>
        <div className="rounded-lg overflow-hidden border border-border/30">
          <ForceGraph2D
            ref={graphRef}
            graphData={graphData}
            width={undefined}
            height={height}
            backgroundColor="#00000000"
            nodeRelSize={6}
            nodeVal={(node: GraphNode) => {
              // Size nodes based on centrality if available, otherwise use connections
              const metadata = node.metadata || {};
              if (metadata.centrality !== undefined) {
                return 4 + metadata.centrality * 8;
              }
              // Fallback to edge count
              const nodeEdges = edges.filter(
                e => (typeof e.source === 'string' ? e.source : e.source.id) === node.id ||
                     (typeof e.target === 'string' ? e.target : e.target.id) === node.id
              );
              return 4 + Math.sqrt(nodeEdges.length) * 2;
            }}
            onNodeHover={(node: GraphNode | null) => {
              if (graphRef.current) {
                graphRef.current.getGraph2D().canvas.style.cursor = node ? 'pointer' : 'default';
              }
            }}
          />
        </div>
      </CardContent>
    </Card>
  );
};

