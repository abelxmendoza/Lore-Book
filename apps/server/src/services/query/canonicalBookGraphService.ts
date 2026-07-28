import type {
  GraphEdge,
  GraphNode,
  TraversalPlan,
  TraversalResult,
} from '../../cognition/query/QueryTypes';
import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';

export type CanonicalBookGraph = {
  nodes: GraphNode[];
  edges: GraphEdge[];
  degradedSources: string[];
};

type GraphSource = {
  name: string;
  load: () => PromiseLike<{ data: unknown; error: unknown }>;
};

function normalize(value: unknown): string {
  return String(value ?? '')
    .toLocaleLowerCase()
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
}

function metadataRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function confidenceFromRelationship(row: Record<string, unknown>): number {
  const metadata = metadataRecord(row.metadata);
  const candidates = [
    metadata.confidence,
    row.strength,
    typeof row.closeness_score === 'number'
      ? (Number(row.closeness_score) + 10) / 20
      : undefined,
  ];
  const confidence = candidates
    .map(Number)
    .find((value) => Number.isFinite(value) && value >= 0 && value <= 1);
  return confidence ?? 0.75;
}

function addNode(
  nodes: Map<string, GraphNode>,
  names: Map<string, string>,
  node: GraphNode,
): void {
  if (!node.id || !node.name.trim()) return;
  nodes.set(node.id, node);
  names.set(`${node.type}:${normalize(node.name)}`, node.id);
  names.set(`any:${normalize(node.name)}`, node.id);
  for (const alias of node.aliases ?? []) {
    names.set(`${node.type}:${normalize(alias)}`, node.id);
    names.set(`any:${normalize(alias)}`, node.id);
  }
}

function addEdge(edges: Map<string, GraphEdge>, edge: GraphEdge): void {
  if (!edge.fromId || !edge.toId || edge.fromId === edge.toId) return;
  const key = edge.id ?? `${edge.fromId}:${edge.toId}:${edge.type}`;
  if (!edges.has(key)) edges.set(key, edge);
}

/**
 * Loads a bounded, user-scoped graph from the canonical Book tables.
 * Each source degrades independently so an unavailable optional table never
 * erases paths supported by the remaining sources.
 */
export async function loadCanonicalBookGraph(userId: string): Promise<CanonicalBookGraph> {
  const sources: GraphSource[] = [
    {
      name: 'characters',
      load: () => supabaseAdmin.from('characters')
        .select('id, name, alias, status')
        .eq('user_id', userId)
        .limit(1000),
    },
    {
      name: 'organizations',
      load: () => supabaseAdmin.from('organizations')
        .select('id, name, aliases, status')
        .eq('user_id', userId)
        .limit(1000),
    },
    {
      name: 'locations',
      load: () => supabaseAdmin.from('locations')
        .select('id, name, aliases, metadata')
        .eq('user_id', userId)
        .limit(1000),
    },
    {
      name: 'projects',
      load: () => supabaseAdmin.from('projects')
        .select('id, name, status, associated_character_ids, associated_location_ids')
        .eq('user_id', userId)
        .limit(1000),
    },
    {
      name: 'skills',
      load: () => supabaseAdmin.from('skills')
        .select('id, skill_name, is_active, metadata')
        .eq('user_id', userId)
        .limit(1000),
    },
    {
      name: 'quests',
      load: () => supabaseAdmin.from('quests')
        .select('id, title, status, related_goal_id, related_task_id, metadata')
        .eq('user_id', userId)
        .limit(1000),
    },
    {
      name: 'events',
      load: () => supabaseAdmin.from('resolved_events')
        .select('id, title, people, locations, activities, confidence, start_time')
        .eq('user_id', userId)
        .order('start_time', { ascending: false })
        .limit(500),
    },
    {
      name: 'character_relationships',
      load: () => supabaseAdmin.from('character_relationships')
        .select('id, source_character_id, target_character_id, relationship_type, relationship_role, relationship_category, closeness_score, strength, metadata, updated_at')
        .eq('user_id', userId)
        .limit(2000),
    },
    {
      name: 'organization_members',
      load: () => supabaseAdmin.from('organization_members')
        .select('id, organization_id, character_id, character_name, role, status, updated_at')
        .eq('user_id', userId)
        .limit(2000),
    },
    {
      name: 'organization_relationships',
      load: () => supabaseAdmin.from('organization_relationships')
        .select('id, from_org_id, to_org_id, relationship_type, created_at')
        .eq('user_id', userId)
        .limit(2000),
    },
    {
      name: 'organization_locations',
      load: () => supabaseAdmin.from('organization_locations')
        .select('id, organization_id, location_id, location_name, last_visited')
        .eq('user_id', userId)
        .limit(2000),
    },
  ];

  const settled = await Promise.allSettled(sources.map((source) => Promise.resolve(source.load())));
  const rowsBySource = new Map<string, Array<Record<string, unknown>>>();
  const degradedSources: string[] = [];
  settled.forEach((result, index) => {
    const source = sources[index]!;
    if (result.status === 'rejected' || result.value.error) {
      degradedSources.push(source.name);
      logger.warn(
        { error: result.status === 'rejected' ? result.reason : result.value.error, source: source.name, userId },
        'canonical Book graph source degraded',
      );
      return;
    }
    rowsBySource.set(source.name, Array.isArray(result.value.data)
      ? result.value.data as Array<Record<string, unknown>>
      : []);
  });

  const nodes = new Map<string, GraphNode>();
  const names = new Map<string, string>();
  const edges = new Map<string, GraphEdge>();

  for (const row of rowsBySource.get('characters') ?? []) {
    addNode(nodes, names, {
      id: String(row.id),
      type: 'character',
      name: String(row.name ?? ''),
      aliases: stringArray(row.alias),
      status: row.status ? String(row.status) : null,
    });
  }
  for (const row of rowsBySource.get('organizations') ?? []) {
    addNode(nodes, names, {
      id: String(row.id),
      type: 'organization',
      name: String(row.name ?? ''),
      aliases: stringArray(row.aliases),
      status: row.status ? String(row.status) : null,
    });
  }
  for (const row of rowsBySource.get('locations') ?? []) {
    const metadata = metadataRecord(row.metadata);
    addNode(nodes, names, {
      id: String(row.id),
      type: 'location',
      name: String(row.name ?? ''),
      aliases: [...stringArray(row.aliases), ...stringArray(metadata.aliases)],
    });
  }
  for (const row of rowsBySource.get('projects') ?? []) {
    addNode(nodes, names, {
      id: String(row.id),
      type: 'project',
      name: String(row.name ?? ''),
      status: row.status ? String(row.status) : null,
    });
  }
  for (const row of rowsBySource.get('skills') ?? []) {
    addNode(nodes, names, {
      id: String(row.id),
      type: 'skill',
      name: String(row.skill_name ?? ''),
      status: row.is_active === false ? 'inactive' : 'active',
    });
  }
  for (const row of rowsBySource.get('quests') ?? []) {
    addNode(nodes, names, {
      id: String(row.id),
      type: 'quest',
      name: String(row.title ?? ''),
      status: row.status ? String(row.status) : null,
    });
  }
  for (const row of rowsBySource.get('events') ?? []) {
    addNode(nodes, names, {
      id: String(row.id),
      type: 'event',
      name: String(row.title ?? 'Untitled event'),
    });
  }

  for (const row of rowsBySource.get('character_relationships') ?? []) {
    addEdge(edges, {
      id: String(row.id),
      fromId: String(row.source_character_id ?? ''),
      toId: String(row.target_character_id ?? ''),
      type: String(row.relationship_role ?? row.relationship_type ?? 'related'),
      category: String(row.relationship_category ?? 'relationship'),
      confidence: confidenceFromRelationship(row),
      direction: 'undirected',
      evidence: [{
        sourceTable: 'character_relationships',
        sourceId: String(row.id),
        label: String(row.relationship_type ?? 'Character relationship'),
        observedAt: row.updated_at ? String(row.updated_at) : null,
      }],
    });
  }

  for (const row of rowsBySource.get('organization_members') ?? []) {
    addEdge(edges, {
      id: String(row.id),
      fromId: String(row.character_id ?? ''),
      toId: String(row.organization_id ?? ''),
      type: String(row.role ?? 'member'),
      category: 'membership',
      confidence: row.character_id ? 0.98 : 0.5,
      direction: 'undirected',
      evidence: [{
        sourceTable: 'organization_members',
        sourceId: String(row.id),
        label: `${String(row.status ?? 'active')} organization membership`,
        observedAt: row.updated_at ? String(row.updated_at) : null,
      }],
    });
  }

  for (const row of rowsBySource.get('organization_relationships') ?? []) {
    addEdge(edges, {
      id: String(row.id),
      fromId: String(row.from_org_id ?? ''),
      toId: String(row.to_org_id ?? ''),
      type: String(row.relationship_type ?? 'related organization'),
      category: 'organization',
      confidence: 0.9,
      direction: 'undirected',
      evidence: [{
        sourceTable: 'organization_relationships',
        sourceId: String(row.id),
        label: String(row.relationship_type ?? 'Organization relationship'),
        observedAt: row.created_at ? String(row.created_at) : null,
      }],
    });
  }

  for (const row of rowsBySource.get('organization_locations') ?? []) {
    addEdge(edges, {
      id: String(row.id),
      fromId: String(row.organization_id ?? ''),
      toId: String(row.location_id ?? ''),
      type: 'located at',
      category: 'location',
      confidence: row.location_id ? 0.95 : 0.5,
      direction: 'undirected',
      evidence: [{
        sourceTable: 'organization_locations',
        sourceId: String(row.id),
        label: 'Organization-place link',
        observedAt: row.last_visited ? String(row.last_visited) : null,
      }],
    });
  }

  for (const row of rowsBySource.get('projects') ?? []) {
    const projectId = String(row.id);
    for (const characterId of stringArray(row.associated_character_ids)) {
      addEdge(edges, {
        fromId: characterId,
        toId: projectId,
        type: 'contributed to',
        category: 'project',
        confidence: 0.9,
        direction: 'undirected',
        evidence: [{
          sourceTable: 'projects',
          sourceId: projectId,
          label: 'Associated project contributor',
        }],
      });
    }
    for (const locationId of stringArray(row.associated_location_ids)) {
      addEdge(edges, {
        fromId: projectId,
        toId: locationId,
        type: 'associated place',
        category: 'location',
        confidence: 0.85,
        direction: 'undirected',
        evidence: [{
          sourceTable: 'projects',
          sourceId: projectId,
          label: 'Project-place association',
        }],
      });
    }
  }

  for (const row of rowsBySource.get('skills') ?? []) {
    const metadata = metadataRecord(row.metadata);
    for (const projectName of stringArray(metadata.related_projects)) {
      const projectId = names.get(`project:${normalize(projectName)}`);
      if (!projectId) continue;
      addEdge(edges, {
        fromId: String(row.id),
        toId: projectId,
        type: 'used by project',
        category: 'skill',
        confidence: 0.85,
        direction: 'undirected',
        evidence: [{
          sourceTable: 'skills',
          sourceId: String(row.id),
          label: `Skill profile links ${projectName}`,
        }],
      });
    }
  }

  for (const row of rowsBySource.get('events') ?? []) {
    const eventId = String(row.id);
    const eventConfidence = Number(row.confidence);
    const confidence = Number.isFinite(eventConfidence) ? eventConfidence : 0.7;
    for (const personName of stringArray(row.people)) {
      const characterId = names.get(`character:${normalize(personName)}`) ?? names.get(`any:${normalize(personName)}`);
      if (!characterId) continue;
      addEdge(edges, {
        fromId: characterId,
        toId: eventId,
        type: 'event participant',
        category: 'event',
        confidence,
        direction: 'undirected',
        evidence: [{
          sourceTable: 'resolved_events',
          sourceId: eventId,
          label: `Participant in ${String(row.title ?? 'event')}`,
          observedAt: row.start_time ? String(row.start_time) : null,
        }],
      });
    }
    for (const locationName of stringArray(row.locations)) {
      const locationId = names.get(`location:${normalize(locationName)}`) ?? names.get(`any:${normalize(locationName)}`);
      if (!locationId) continue;
      addEdge(edges, {
        fromId: eventId,
        toId: locationId,
        type: 'happened at',
        category: 'event',
        confidence,
        direction: 'undirected',
        evidence: [{
          sourceTable: 'resolved_events',
          sourceId: eventId,
          label: `Location of ${String(row.title ?? 'event')}`,
          observedAt: row.start_time ? String(row.start_time) : null,
        }],
      });
    }
  }

  const validEdges = [...edges.values()].filter((edge) => nodes.has(edge.fromId) && nodes.has(edge.toId));
  return { nodes: [...nodes.values()], edges: validEdges, degradedSources };
}

function edgeAllowed(edge: GraphEdge, edgeTypes: string[]): boolean {
  if (!edgeTypes.length) return true;
  const searchable = normalize(`${edge.type} ${edge.category ?? ''}`);
  return edgeTypes.some((type) => searchable.includes(normalize(type)));
}

function nodeMatches(node: GraphNode, target: TraversalPlan['target']): boolean {
  if (!target) return true;
  if (target.type && target.type !== node.type) return false;
  return !target.name || normalize(node.name) === normalize(target.name);
}

/**
 * Breadth-first traversal. Edges are treated as undirected for discovery,
 * while their stored direction is preserved for evidence and display.
 */
export function traverseBookGraph(
  graph: CanonicalBookGraph,
  plan: TraversalPlan,
  maxPaths = 20,
): TraversalResult {
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  let startId: string | undefined;
  if ('id' in plan.startNode) {
    startId = plan.startNode.id;
  } else {
    const startNode = plan.startNode;
    startId = graph.nodes.find((node) =>
      node.type === startNode.type &&
      normalize(node.name) === normalize(startNode.name))?.id;
  }
  if (!startId || !nodeById.has(startId)) {
    return { paths: [], visited: 0, degradedSources: graph.degradedSources };
  }

  const adjacency = new Map<string, GraphEdge[]>();
  for (const edge of graph.edges.filter((item) => edgeAllowed(item, plan.edgeTypes))) {
    adjacency.set(edge.fromId, [...(adjacency.get(edge.fromId) ?? []), edge]);
    adjacency.set(edge.toId, [...(adjacency.get(edge.toId) ?? []), edge]);
  }

  type QueueItem = { nodeId: string; nodeIds: string[]; edges: GraphEdge[] };
  const queue: QueueItem[] = [{ nodeId: startId, nodeIds: [startId], edges: [] }];
  const bestDepth = new Map<string, number>([[startId, 0]]);
  const paths: TraversalResult['paths'] = [];
  let visited = 0;

  while (queue.length && paths.length < maxPaths) {
    const current = queue.shift()!;
    visited += 1;
    const depth = current.edges.length;
    const currentNode = nodeById.get(current.nodeId)!;
    if (depth > 0 && nodeMatches(currentNode, plan.target)) {
      paths.push({
        nodes: current.nodeIds.map((id) => nodeById.get(id)!).filter(Boolean),
        edges: current.edges,
      });
      if (plan.target) continue;
    }
    if (depth >= Math.max(1, Math.min(plan.maxDepth, 4))) continue;

    for (const edge of adjacency.get(current.nodeId) ?? []) {
      const nextId = edge.fromId === current.nodeId ? edge.toId : edge.fromId;
      if (current.nodeIds.includes(nextId)) continue;
      const nextDepth = depth + 1;
      if ((bestDepth.get(nextId) ?? Number.POSITIVE_INFINITY) < nextDepth) continue;
      bestDepth.set(nextId, nextDepth);
      queue.push({
        nodeId: nextId,
        nodeIds: [...current.nodeIds, nextId],
        edges: [...current.edges, edge],
      });
    }
  }

  return { paths, visited, degradedSources: graph.degradedSources };
}

export class CanonicalBookGraphService {
  async load(userId: string): Promise<CanonicalBookGraph> {
    return loadCanonicalBookGraph(userId);
  }

  async traverse(userId: string, plan: TraversalPlan): Promise<TraversalResult> {
    return traverseBookGraph(await this.load(userId), plan);
  }
}

export const canonicalBookGraphService = new CanonicalBookGraphService();
