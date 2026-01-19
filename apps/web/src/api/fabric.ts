import { fetchJson } from '../lib/api';

export type FabricNode = {
  id: string;
  label: string;
  type: 'memory' | 'character' | 'task' | 'event';
  group?: string;
  metadata?: Record<string, unknown>;
};

export type FabricLink = {
  source: string;
  target: string;
  type: 'semantic' | 'temporal' | 'emotional' | 'identity' | 'co_occurrence';
  weight?: number;
  relation?: string;
  firstSeen?: string;
  lastSeen?: string;
  recency?: number;
  context?: Record<string, unknown>;
};

export type FabricSnapshot = {
  nodes: FabricNode[];
  links: FabricLink[];
};

export type MemoryGraph = {
  nodes: FabricNode[];
  edges: FabricLink[];
};

// Fetch from memory-graph endpoint
export const fetchFabric = async () => {
  try {
    const response = await fetchJson<{ graph: MemoryGraph }>('/api/memory-graph', undefined, {
      useMockData: true,
      mockData: { graph: { nodes: [], edges: [] } },
    });
    // Transform backend format to frontend format
    return {
      fabric: {
        nodes: response.graph.nodes,
        links: response.graph.edges
      }
    };
  } catch (_error) {
    // Return empty fabric on error
    return {
      fabric: {
        nodes: [],
        links: []
      }
    };
  }
};

// Create a link between nodes
export const createFabricLink = async (link: {
  source: string;
  target: string;
  type?: string;
  weight?: number;
  context?: Record<string, unknown>;
}) => {
  return fetchJson<{ edge: FabricLink }>('/api/memory-graph/link', {
    method: 'POST',
    body: JSON.stringify(link)
  });
};
