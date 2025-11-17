import { fetchJson } from '../lib/api';

export type FabricNode = {
  id: string;
  label: string;
  type: 'memory' | 'character' | 'task';
  group?: string;
};

export type FabricLink = {
  source: string;
  target: string;
  relation: 'semantic' | 'temporal' | 'emotional' | 'identity';
  weight?: number;
};

export type FabricSnapshot = {
  nodes: FabricNode[];
  links: FabricLink[];
};

export const fetchFabric = () => fetchJson<{ fabric: FabricSnapshot }>('/api/fabric');
