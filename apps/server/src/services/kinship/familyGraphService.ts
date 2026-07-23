/**
 * Family Graph Engine — relationship paths, inference, analytics, audit.
 */
import { supabaseAdmin } from '../supabaseClient';
import { familyTreeService, type FamilyTreeDTO } from '../familyTreeService';
import { parseKinshipFromName } from './kinshipGlossary';

export type FamilyEdgeType =
  | 'parent' | 'child' | 'sibling' | 'grandparent' | 'grandchild'
  | 'uncle' | 'aunt' | 'cousin' | 'spouse' | 'in_law' | 'related';

export type FamilyGraphEdge = {
  id: string;
  fromCharacterId: string;
  toCharacterId: string;
  fromName: string;
  toName: string;
  relationshipType: FamilyEdgeType;
  confidence: number;
  evidenceCount: number;
  sourceEvidence: string[];
  sourceMessages: string[];
  inferencePath?: string[];
  kinship?: string;
};

export type FamilyGraphNode = {
  characterId: string;
  name: string;
  kinshipTitle?: string;
  kinshipRole?: string;
  generation: number;
  isSelf?: boolean;
  confidence: number;
  evidenceCount: number;
  mentionCount?: number;
};

export type FamilyGraph = {
  nodes: FamilyGraphNode[];
  edges: FamilyGraphEdge[];
  selfId: string | null;
  tree: FamilyTreeDTO | null;
};

export type RelationshipAnalytic = {
  characterId: string;
  name: string;
  kinshipLabel?: string;
  strength: number;
  mentionCount: number;
  evidenceCount: number;
  lastSeenAt?: string;
  trend: 'growing' | 'stable' | 'inactive';
};

export type FamilyStoryContext = {
  themeSummary: string;
  householdHighlight?: string;
  topFamilyMembers: Array<{ name: string; role: string; strength: number }>;
  familyGroupNames: string[];
  confidence: number;
};

const KINSHIP_TO_EDGE: Record<string, FamilyEdgeType> = {
  mother: 'parent',
  father: 'parent',
  parent: 'parent',
  child: 'child',
  son: 'child',
  daughter: 'child',
  grandmother: 'grandparent',
  grandfather: 'grandparent',
  grandparent: 'grandparent',
  grandchild: 'grandchild',
  uncle: 'uncle',
  aunt: 'aunt',
  cousin: 'cousin',
  sibling: 'sibling',
  brother: 'sibling',
  sister: 'sibling',
  spouse: 'spouse',
  in_law: 'in_law',
  household: 'related',
};

export type FamilyRelationshipRowLike = {
  relationship_category?: string | null;
  relationship_type?: string | null;
  relationship_role?: string | null;
  metadata?: Record<string, unknown> | null;
};

/**
 * Is this character_relationships row a family edge? Shared by the graph
 * builder and the surname-match gate — a single definition so the two never
 * drift apart. Chat-created kinship edges (assertProtagonistKinship) set
 * relationship_type: 'family' but never relationship_category, so all three
 * signals must be checked.
 */
export function isFamilyRelationshipRow(row: FamilyRelationshipRowLike): boolean {
  const kinship = (row.metadata?.kinship as string | undefined) ?? row.relationship_role ?? undefined;
  return (
    row.relationship_category === 'family' ||
    row.relationship_type === 'family' ||
    Boolean(kinship)
  );
}

function edgeTypeFromKinship(kinship?: string | null, relType?: string): FamilyEdgeType {
  if (!kinship) return relType === 'family' ? 'related' : 'related';
  const k = kinship.toLowerCase().replace(/[\s-]+/g, '_');
  return KINSHIP_TO_EDGE[k] ?? 'related';
}

function collectEvidence(meta: Record<string, unknown> | null | undefined): {
  evidence: string[];
  messages: string[];
  count: number;
} {
  const m = meta ?? {};
  const factIds = (m.fact_ids as string[] | undefined) ?? [];
  const memoryIds = (m.source_memory_ids as string[] | undefined) ?? [];
  const sources = (m.sources as string[] | undefined) ?? [];
  const messages = memoryIds.filter(Boolean);
  const evidence = [...sources, ...factIds.map((id) => `fact:${id}`)];
  return { evidence, messages, count: factIds.length + memoryIds.length + sources.length };
}

export class FamilyGraphService {
  async getGraph(userId: string): Promise<FamilyGraph> {
    const selfId = await familyTreeService.findUserCharacterId(userId);
    const tree = await familyTreeService.getUserFamilyTree(userId);

    const { data: rels } = await supabaseAdmin
      .from('character_relationships')
      .select('id, source_character_id, target_character_id, relationship_type, relationship_role, relationship_category, closeness_score, strength, metadata, summary, updated_at')
      .eq('user_id', userId);

    const { data: chars } = await supabaseAdmin
      .from('characters')
      .select('id, name, metadata, mention_count')
      .eq('user_id', userId);

    const nameById = new Map((chars ?? []).map((c) => [c.id as string, c.name as string]));
    const mentionById = new Map((chars ?? []).map((c) => [c.id as string, Number((c.metadata as Record<string, unknown>)?.mention_count ?? 0)]));

    const edges: FamilyGraphEdge[] = [];
    const seen = new Set<string>();

    for (const r of rels ?? []) {
      const meta = (r.metadata ?? {}) as Record<string, unknown>;
      const kinship = (meta.kinship as string | undefined) ?? r.relationship_role ?? undefined;

      if (!isFamilyRelationshipRow(r)) continue;

      const edgeType = edgeTypeFromKinship(kinship, r.relationship_type);
      const key = `${r.source_character_id}|${r.target_character_id}|${edgeType}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const { evidence, messages, count } = collectEvidence(meta);
      const confidence = Number(meta.confidence ?? r.strength ?? 0.75);

      edges.push({
        id: r.id as string,
        fromCharacterId: r.source_character_id as string,
        toCharacterId: r.target_character_id as string,
        fromName: nameById.get(r.source_character_id as string) ?? 'Unknown',
        toName: nameById.get(r.target_character_id as string) ?? 'Unknown',
        relationshipType: edgeType,
        confidence,
        evidenceCount: count,
        sourceEvidence: evidence,
        sourceMessages: messages,
        kinship: kinship ?? undefined,
        inferencePath: kinship ? [`direct:${kinship}`] : ['direct:family'],
      });
    }

    // Transitive sibling inference: two uncles/aunts co-mentioned → siblings
    await this.inferSiblingEdges(userId, edges, nameById, selfId);

    const nodes = this.buildNodes(tree, edges, mentionById, selfId);

    return { nodes, edges, selfId, tree };
  }

  private async inferSiblingEdges(
    userId: string,
    edges: FamilyGraphEdge[],
    nameById: Map<string, string>,
    selfId: string | null
  ): Promise<void> {
    if (!selfId) return;

    const kinChars = [...nameById.entries()].filter(([id, name]) => {
      if (id === selfId) return false;
      return parseKinshipFromName(name) !== null;
    });

    const uncles = kinChars.filter(([, n]) => /\b(t[íi]o|uncle)\b/i.test(n));
    const aunts = kinChars.filter(([, n]) => /\b(t[íi]a|aunt)\b/i.test(n));

    const inferPairs = (pairs: Array<[string, string]>) => {
      for (let i = 0; i < pairs.length; i++) {
        for (let j = i + 1; j < pairs.length; j++) {
          const [aId, aName] = pairs[i];
          const [bId, bName] = pairs[j];
          const key = [aId, bId].sort().join('|');
          if (edges.some((e) => [e.fromCharacterId, e.toCharacterId].sort().join('|') === key && e.relationshipType === 'sibling')) continue;
          edges.push({
            id: `inferred-sibling-${key}`,
            fromCharacterId: aId,
            toCharacterId: bId,
            fromName: aName,
            toName: bName,
            relationshipType: 'sibling',
            confidence: 0.72,
            evidenceCount: 1,
            sourceEvidence: ['kinship_co_mention'],
            sourceMessages: [],
            inferencePath: ['co_mentioned_uncles/aunts', 'inferred:sibling'],
            kinship: 'sibling',
          });
        }
      }
    };

    inferPairs(uncles);
    inferPairs(aunts);
  }

  private buildNodes(
    tree: FamilyTreeDTO | null,
    edges: FamilyGraphEdge[],
    mentionById: Map<string, number>,
    selfId: string | null
  ): FamilyGraphNode[] {
    const nodeMap = new Map<string, FamilyGraphNode>();

    for (const m of tree?.members ?? []) {
      if (m.is_placeholder) continue;
      const parsed = parseKinshipFromName(m.name);
      nodeMap.set(m.id, {
        characterId: m.id,
        name: m.name,
        kinshipTitle: m.kinship_title,
        kinshipRole: parsed?.role.toLowerCase(),
        generation: m.generation,
        isSelf: m.is_self,
        confidence: m.inference_status === 'asserted' ? 0.95 : 0.8,
        evidenceCount: 0,
        mentionCount: mentionById.get(m.id),
      });
    }

    for (const e of edges) {
      for (const [id, name] of [[e.fromCharacterId, e.fromName], [e.toCharacterId, e.toName]] as const) {
        if (nodeMap.has(id)) {
          const n = nodeMap.get(id)!;
          n.evidenceCount += e.evidenceCount;
          n.confidence = Math.max(n.confidence, e.confidence);
        } else {
          const parsed = parseKinshipFromName(name);
          nodeMap.set(id, {
            characterId: id,
            name,
            kinshipRole: parsed?.role.toLowerCase() ?? e.kinship,
            generation: id === selfId ? 0 : -1,
            isSelf: id === selfId,
            confidence: e.confidence,
            evidenceCount: e.evidenceCount,
            mentionCount: mentionById.get(id),
          });
        }
      }
    }

    return [...nodeMap.values()].sort((a, b) => a.generation - b.generation || a.name.localeCompare(b.name));
  }

  async getAnalytics(userId: string): Promise<RelationshipAnalytic[]> {
    const graph = await this.getGraph(userId);
    const selfId = graph.selfId;

    const analytics: RelationshipAnalytic[] = [];
    for (const node of graph.nodes) {
      if (node.isSelf || node.characterId.startsWith('__')) continue;

      const relatedEdges = graph.edges.filter(
        (e) =>
          (e.fromCharacterId === selfId && e.toCharacterId === node.characterId) ||
          (e.toCharacterId === selfId && e.fromCharacterId === node.characterId)
      );

      const strength =
        relatedEdges.length > 0
          ? relatedEdges.reduce((s, e) => s + e.confidence, 0) / relatedEdges.length
          : node.confidence;

      const mentionCount = node.mentionCount ?? 0;
      const evidenceCount = relatedEdges.reduce((s, e) => s + e.evidenceCount, 0) || node.evidenceCount;

      let trend: RelationshipAnalytic['trend'] = 'stable';
      if (mentionCount >= 5 || evidenceCount >= 3) trend = 'growing';
      if (mentionCount <= 1 && evidenceCount <= 1) trend = 'inactive';

      analytics.push({
        characterId: node.characterId,
        name: node.name,
        kinshipLabel: node.kinshipTitle ?? node.kinshipRole,
        strength: Math.round(strength * 100) / 100,
        mentionCount,
        evidenceCount,
        trend,
      });
    }

    return analytics.sort((a, b) => b.strength - a.strength || b.mentionCount - a.mentionCount);
  }

  async getStoryContext(userId: string): Promise<FamilyStoryContext> {
    const graph = await this.getGraph(userId);
    const analytics = await this.getAnalytics(userId);

    const { data: orgs } = await supabaseAdmin
      .from('organizations')
      .select('name, metadata')
      .eq('user_id', userId)
      .eq('type', 'family');

    const familyGroups = (orgs ?? [])
      .filter((o) => (o.metadata as Record<string, unknown>)?.inference_source === 'kinship_graph')
      .map((o) => o.name as string);

    const households = (orgs ?? [])
      .filter((o) => (o.metadata as Record<string, unknown>)?.inference_source === 'household_residence')
      .map((o) => o.name as string);

    const top = analytics.slice(0, 5);
    const hasFamily = top.length >= 2;

    let themeSummary = 'Family relationships have not been strongly surfaced in your stories yet.';
    if (hasFamily) {
      themeSummary = `Family responsibilities and kinship appear as a recurring theme (${top.map((t) => t.name).join(', ')}).`;
    }

    let householdHighlight: string | undefined;
    if (households.length) {
      householdHighlight = `Most recent household context: ${households[0]}.`;
    }

    return {
      themeSummary,
      householdHighlight,
      topFamilyMembers: top.map((t) => ({
        name: t.name,
        role: t.kinshipLabel ?? 'relative',
        strength: t.strength,
      })),
      familyGroupNames: familyGroups,
      confidence: hasFamily ? Math.min(0.95, top.reduce((s, t) => s + t.strength, 0) / top.length) : 0.3,
    };
  }

  async generateAuditReport(userId: string): Promise<{
    generatedAt: string;
    edgeCount: number;
    nodeCount: number;
    byKinship: Record<string, number>;
    edges: FamilyGraphEdge[];
    gaps: string[];
  }> {
    const graph = await this.getGraph(userId);
    const byKinship: Record<string, number> = {};
    const expectedRoles = ['grandparent', 'parent', 'uncle', 'aunt', 'cousin', 'sibling', 'child'];

    for (const e of graph.edges) {
      const key = e.kinship ?? e.relationshipType;
      byKinship[key] = (byKinship[key] ?? 0) + 1;
    }

    const gaps: string[] = [];
    for (const role of expectedRoles) {
      if (!Object.keys(byKinship).some((k) => k.includes(role))) {
        gaps.push(`No ${role} edges detected yet`);
      }
    }

    for (const e of graph.edges) {
      if (e.confidence < 0.5) gaps.push(`Low confidence edge: ${e.fromName} → ${e.toName} (${e.confidence})`);
      if (e.evidenceCount === 0 && !e.id.startsWith('inferred')) {
        gaps.push(`Missing evidence: ${e.fromName} → ${e.toName}`);
      }
    }

    return {
      generatedAt: new Date().toISOString(),
      edgeCount: graph.edges.length,
      nodeCount: graph.nodes.length,
      byKinship,
      edges: graph.edges,
      gaps,
    };
  }
}

export const familyGraphService = new FamilyGraphService();
