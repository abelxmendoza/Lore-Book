import { differenceInDays, isAfter, isBefore, parseISO } from 'date-fns';

export type HQISearchFilters = {
  timeStart?: string;
  timeEnd?: string;
  tags?: string[];
  characters?: string[];
  motifs?: string[];
};

export type HQINode = {
  id: string;
  title: string;
  snippet: string;
  timestamp: string;
  tags: string[];
  characters: string[];
  motifs: string[];
  neighbors: string[];
  scoreHint?: number;
};

export type HQIResult = {
  node_id: string;
  score: number;
  reasons: string[];
  title: string;
  snippet: string;
  timestamp: string;
  tags: string[];
};

const demoNodes: Record<string, HQINode> = {
  robotics: {
    id: 'robotics',
    title: 'Robotics momentum breakthrough',
    snippet: 'Lab sprint where Kai tuned the control loop and celebrated a huge milestone.',
    timestamp: '2024-03-14T10:00:00.000Z',
    tags: ['robotics', 'lab'],
    characters: ['Kai'],
    motifs: ['momentum'],
    neighbors: ['identity'],
    scoreHint: 0.92
  },
  art: {
    id: 'art',
    title: 'Color theory jam',
    snippet: 'Evening painting session with Ivy focused on saturated palettes and neon glow.',
    timestamp: '2024-04-02T19:00:00.000Z',
    tags: ['art', 'creative'],
    characters: ['Ivy'],
    motifs: ['color'],
    neighbors: ['robotics'],
    scoreHint: 0.82
  },
  identity: {
    id: 'identity',
    title: 'Self identity reflection',
    snippet: 'Journaled about values, Kai’s mission, and how robotics ties into purpose.',
    timestamp: '2024-02-20T08:00:00.000Z',
    tags: ['identity'],
    characters: ['Kai'],
    motifs: ['self'],
    neighbors: ['robotics', 'art'],
    scoreHint: 0.75
  }
};

const baseScoreForQuery = (node: HQINode, query: string): number => {
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return node.scoreHint ?? 0.5;

  let score = node.scoreHint ?? 0.5;
  for (const token of tokens) {
    if (node.title.toLowerCase().includes(token) || node.snippet.toLowerCase().includes(token)) {
      score += 0.2;
    }
    if (node.tags.some((tag) => tag.toLowerCase() === token)) {
      score += 0.15;
    }
  }
  return score;
};

const passesFilters = (node: HQINode, filters: HQISearchFilters): boolean => {
  if (filters.timeStart && isBefore(parseISO(node.timestamp), parseISO(filters.timeStart))) {
    return false;
  }
  if (filters.timeEnd && isAfter(parseISO(node.timestamp), parseISO(filters.timeEnd))) {
    return false;
  }
  if (filters.tags && filters.tags.length && !filters.tags.some((tag) => node.tags.includes(tag))) {
    return false;
  }
  if (filters.characters && filters.characters.length && !filters.characters.some((person) => node.characters.includes(person))) {
    return false;
  }
  if (filters.motifs && filters.motifs.length && !filters.motifs.some((motif) => node.motifs.includes(motif))) {
    return false;
  }
  return true;
};

export const hqiService = {
  search(query: string, filters: HQISearchFilters): HQIResult[] {
    const results: HQIResult[] = [];
    const normalizedFilters = filters ?? {};

    for (const node of Object.values(demoNodes)) {
      if (!passesFilters(node, normalizedFilters)) continue;

      let score = baseScoreForQuery(node, query);
      const reasons: string[] = ['semantic'];

      // Lightweight graph boost for neighbors
      score += node.neighbors.length * 0.05;
      if (node.neighbors.length) {
        reasons.push('edges');
      }

      // Motif boost when explicitly filtered
      if (normalizedFilters.motifs && normalizedFilters.motifs.some((motif) => node.motifs.includes(motif))) {
        score += 0.2;
        reasons.push('motif');
      }

      // Temporal proximity bump for recent memories
      const daysAgo = Math.abs(differenceInDays(new Date(), parseISO(node.timestamp)));
      score += Math.max(0, 0.1 - daysAgo * 0.0005);

      results.push({
        node_id: node.id,
        score,
        reasons,
        title: node.title,
        snippet: node.snippet,
        timestamp: node.timestamp,
        tags: node.tags
      });
    }

    return results.sort((a, b) => b.score - a.score);
  },

  context(nodeId: string) {
    const node = demoNodes[nodeId];
    if (!node) return null;

    return {
      node,
      neighbors: node.neighbors.map((neighborId) => demoNodes[neighborId]).filter(Boolean)
    };
  }
};
