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

  // Safety checks
  const safeNodes = Array.isArray(nodes) ? nodes : [];
  const safeEdges = Array.isArray(edges) ? edges : [];

  if (!safeNodes || safeNodes.length === 0) {
    return (
      <Card className="bg-black/40 border-border/60">
        <CardHeader>
          <CardTitle className="text-white">{title || 'Graph'}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-64 flex items-center justify-center text-white/40">
            No graph data available
          </div>
        </CardContent>
      </Card>
    );
  }

  // Color and styling functions
  const getNodeColor = (node: any) => {
    const colorMap: Record<string, string> = {
      memory: '#a855f7',
      character: '#ec4899',
      location: '#06b6d4',
      event: '#10b981',
      default: '#8b5cf6'
    };
    return colorMap[node.type] || colorMap.default;
  };

  const getNodeLabel = (node: any) => {
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
  };

  const getLinkColor = (link: any) => {
    const sentiment = link.metadata?.sentiment;
    if (sentiment !== undefined && sentiment !== null) {
      if (sentiment < -0.3) {
        return 'rgba(239, 68, 68, 0.6)'; // red for conflict
      } else if (sentiment > 0.3) {
        return 'rgba(245, 158, 11, 0.6)'; // gold for intense positive
      } else {
        return 'rgba(59, 130, 246, 0.6)'; // blue for calm
      }
    }
    return 'rgba(168, 85, 247, 0.3)'; // default purple
  };

  const getLinkWidth = (link: any) => Math.sqrt((link.weight || 1)) * 2;

  const getLinkArrowColor = (link: any) => {
    const sentiment = link.metadata?.sentiment;
    if (sentiment !== undefined && sentiment !== null) {
      if (sentiment < -0.3) {
        return 'rgba(239, 68, 68, 0.8)';
      } else if (sentiment > 0.3) {
        return 'rgba(245, 158, 11, 0.8)';
      } else {
        return 'rgba(59, 130, 246, 0.8)';
      }
    }
    return 'rgba(168, 85, 247, 0.6)';
  };

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

  // Ensure edges are valid and properly formatted
  const validEdges = (Array.isArray(safeEdges) ? safeEdges : [])
    .filter(edge => edge && edge.source && edge.target)
    .map(edge => {
      const source = typeof edge.source === 'string' ? edge.source : (edge.source?.id || edge.source);
      const target = typeof edge.target === 'string' ? edge.target : (edge.target?.id || edge.target);
      
      // Ensure source and target exist in nodes
      const sourceExists = safeNodes.some(n => {
        const nodeId = typeof n === 'string' ? n : (n?.id || n);
        return nodeId === source;
      });
      const targetExists = safeNodes.some(n => {
        const nodeId = typeof n === 'string' ? n : (n?.id || n);
        return nodeId === target;
      });
      
      if (!sourceExists || !targetExists) {
        return null;
      }
      
      return {
        ...edge,
        source,
        target,
        id: edge.id || `${source}-${target}`,
      };
    })
    .filter((edge): edge is GraphEdge => edge !== null);

  // Ensure nodes are properly formatted
  const validNodes = (Array.isArray(safeNodes) ? safeNodes : [])
    .filter(node => node && (typeof node === 'string' || node.id))
    .map(node => ({
      id: typeof node === 'string' ? node : (node.id || ''),
      label: typeof node === 'string' ? node : (node.label || node.id || ''),
      type: typeof node === 'string' ? 'character' : (node.type || 'character'),
      metadata: typeof node === 'string' ? {} : (node.metadata || {}),
    }));

  // Ensure graphData is completely valid - the library is very strict about data structure
  // Clean all properties to ensure no undefined/null values
  const cleanNodes = (Array.isArray(validNodes) ? validNodes : []).map(node => {
    const cleanNode: any = {
      id: String(node.id || ''),
      label: String(node.label || node.id || ''),
      type: String(node.type || 'character'),
    };
    
    // Only add metadata if it's a valid object with no undefined values
    if (node.metadata && typeof node.metadata === 'object') {
      const cleanMetadata: Record<string, any> = {};
      for (const [key, value] of Object.entries(node.metadata)) {
        if (value !== undefined && value !== null) {
          cleanMetadata[key] = value;
        }
      }
      if (Object.keys(cleanMetadata).length > 0) {
        cleanNode.metadata = cleanMetadata;
      }
    }
    
    return cleanNode;
  });

  const cleanEdges = (Array.isArray(validEdges) ? validEdges : []).map(edge => {
    const cleanEdge: any = {
      source: String(edge.source || ''),
      target: String(edge.target || ''),
      id: String(edge.id || `${edge.source}-${edge.target}`),
      weight: typeof edge.weight === 'number' && !isNaN(edge.weight) ? edge.weight : 1,
      type: String(edge.type || 'relationship'),
    };
    
    // Only add metadata if it's a valid object with no undefined values
    if (edge.metadata && typeof edge.metadata === 'object') {
      const cleanMetadata: Record<string, any> = {};
      for (const [key, value] of Object.entries(edge.metadata)) {
        if (value !== undefined && value !== null) {
          cleanMetadata[key] = value;
        }
      }
      if (Object.keys(cleanMetadata).length > 0) {
        cleanEdge.metadata = cleanMetadata;
      }
    }
    
    return cleanEdge;
  });

  // react-force-graph-2d expects 'links' not 'edges'
  // Ensure links is always an array (even if empty)
  const graphData = {
    nodes: cleanNodes.length > 0 ? cleanNodes : [],
    links: Array.isArray(cleanEdges) ? cleanEdges : [],
  };

  // Final validation - ensure we have at least one node
  if (!graphData.nodes || graphData.nodes.length === 0 || !graphData.links) {
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
            nodeColor={getNodeColor}
            nodeLabel={getNodeLabel}
            linkColor={getLinkColor}
            linkWidth={getLinkWidth}
            linkDirectionalArrowLength={6}
            linkDirectionalArrowColor={getLinkArrowColor}
            nodeVal={(node: any) => {
              // Size nodes based on centrality if available, otherwise use connections
              const metadata = node.metadata || {};
              if (metadata && typeof metadata.centrality === 'number') {
                return 4 + metadata.centrality * 8;
              }
              // Fallback to edge count
              const nodeEdges = graphData.links.filter(
                (e: any) => String(e.source) === String(node.id) || String(e.target) === String(node.id)
              );
              return 4 + Math.sqrt(nodeEdges.length) * 2;
            }}
            onNodeHover={(node: any) => {
              if (graphRef.current && graphRef.current.getGraph2D) {
                try {
                  graphRef.current.getGraph2D().canvas.style.cursor = node ? 'pointer' : 'default';
                } catch (e) {
                  // Ignore errors in hover handler
                }
              }
            }}
          />
        </div>
      </CardContent>
    </Card>
  );
};

