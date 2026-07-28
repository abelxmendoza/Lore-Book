import { describe, expect, it } from 'vitest';

import {
  traverseBookGraph,
  type CanonicalBookGraph,
} from './canonicalBookGraphService';

const graph: CanonicalBookGraph = {
  nodes: [
    { id: 'person-marcus', type: 'character', name: 'Marcus' },
    { id: 'org-vanguard', type: 'organization', name: 'Vanguard Robotics' },
    { id: 'project-memovault', type: 'project', name: 'MemoVault' },
    { id: 'skill-typescript', type: 'skill', name: 'TypeScript' },
  ],
  edges: [
    {
      id: 'member-1',
      fromId: 'person-marcus',
      toId: 'org-vanguard',
      type: 'member',
      category: 'membership',
      confidence: 0.98,
      evidence: [{
        sourceTable: 'organization_members',
        sourceId: 'member-1',
        label: 'Active membership',
      }],
    },
    {
      id: 'project-1',
      fromId: 'person-marcus',
      toId: 'project-memovault',
      type: 'contributed to',
      category: 'project',
      confidence: 0.9,
      evidence: [{
        sourceTable: 'projects',
        sourceId: 'project-memovault',
        label: 'Associated contributor',
      }],
    },
    {
      id: 'skill-1',
      fromId: 'skill-typescript',
      toId: 'project-memovault',
      type: 'used by project',
      category: 'skill',
      confidence: 0.85,
      evidence: [{
        sourceTable: 'skills',
        sourceId: 'skill-typescript',
        label: 'Skill project link',
      }],
    },
  ],
  degradedSources: [],
};

describe('canonical Book graph traversal', () => {
  it('finds the shortest evidence-bearing path between canonical IDs', () => {
    const result = traverseBookGraph(graph, {
      startNode: { id: 'skill-typescript' },
      edgeTypes: [],
      maxDepth: 4,
      target: { type: 'character', name: 'Marcus' },
    });

    expect(result.paths).toHaveLength(1);
    expect(result.paths[0]?.nodes.map((node) => node.name)).toEqual([
      'TypeScript',
      'MemoVault',
      'Marcus',
    ]);
    expect(result.paths[0]?.edges.every((edge) => edge.evidence?.length)).toBe(true);
  });

  it('supports relation filtering and bounded neighborhood discovery', () => {
    const result = traverseBookGraph(graph, {
      startNode: { id: 'person-marcus' },
      edgeTypes: ['membership'],
      maxDepth: 2,
    });

    expect(result.paths.map((path) => path.nodes.at(-1)?.name)).toEqual(['Vanguard Robotics']);
    expect(result.visited).toBeLessThanOrEqual(2);
  });

  it('returns grounded silence for an unknown canonical anchor', () => {
    expect(traverseBookGraph(graph, {
      startNode: { id: 'missing' },
      edgeTypes: [],
      maxDepth: 2,
    })).toMatchObject({ paths: [], visited: 0 });
  });
});
