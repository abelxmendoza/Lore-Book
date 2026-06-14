// =====================================================
// FAMILY TREE SERVICE
// Purpose: Build visual family trees from character_relationships
//          and conversation-inferred kinship — centered on the user,
//          a specific character, or a family-type organization roster.
// =====================================================

import { logger } from '../logger';
import { organizationService } from './organizationService';
import { relationshipTreeBuilder } from './conversationCentered/relationshipTreeBuilder';
import { supabaseAdmin } from './supabaseClient';

export type FamilyRelationType =
  | 'parent' | 'child' | 'sibling' | 'twin' | 'grandparent' | 'grandchild'
  | 'aunt' | 'uncle' | 'cousin' | 'spouse' | 'in_law' | 'step_parent'
  | 'step_sibling' | 'half_sibling' | 'related';

export interface FamilyMemberDTO {
  id: string;
  name: string;
  first_name?: string;
  relation: FamilyRelationType;
  relation_label: string;
  generation: number;
  closeness?: number;
  is_self?: boolean;
  side?: 'maternal' | 'paternal' | 'both' | 'other';
  notes?: string;
}

export interface FamilyBranchDTO {
  side: 'maternal' | 'paternal' | 'partner' | 'other';
  label: string;
  color: string;
}

export interface FamilyTreeDTO {
  members: FamilyMemberDTO[];
  branches: FamilyBranchDTO[];
  self_id: string;
}

const FAMILY_TYPES = new Set([
  'parent_of', 'child_of', 'sibling_of', 'spouse_of', 'grandparent_of', 'grandchild_of',
  'aunt_of', 'uncle_of', 'niece_of', 'nephew_of', 'cousin_of', 'in_law_of',
  'step_parent_of', 'step_child_of', 'step_sibling_of', 'half_sibling_of',
  'adopted_parent_of', 'adopted_child_of', 'godparent_of', 'godchild_of', 'related_to',
  'mother', 'father', 'parent', 'child', 'sibling', 'brother', 'sister', 'cousin',
  'grandmother', 'grandfather', 'grandparent', 'grandchild', 'aunt', 'uncle', 'spouse',
  'family',
]);

/** Generation delta when traversing edge from `atId` toward neighbor. */
const GEN_DELTA: Record<string, { forward: number; backward: number }> = {
  parent_of: { forward: 1, backward: -1 },
  child_of: { forward: -1, backward: 1 },
  grandparent_of: { forward: 2, backward: -2 },
  grandchild_of: { forward: -2, backward: 2 },
  sibling_of: { forward: 0, backward: 0 },
  twin_of: { forward: 0, backward: 0 },
  half_sibling_of: { forward: 0, backward: 0 },
  step_sibling_of: { forward: 0, backward: 0 },
  spouse_of: { forward: 0, backward: 0 },
  in_law_of: { forward: 0, backward: 0 },
  aunt_of: { forward: 1, backward: -1 },
  uncle_of: { forward: 1, backward: -1 },
  niece_of: { forward: -1, backward: 1 },
  nephew_of: { forward: -1, backward: 1 },
  cousin_of: { forward: 0, backward: 0 },
  step_parent_of: { forward: 1, backward: -1 },
  step_child_of: { forward: -1, backward: 1 },
  adopted_parent_of: { forward: 1, backward: -1 },
  adopted_child_of: { forward: -1, backward: 1 },
  godparent_of: { forward: 1, backward: -1 },
  godchild_of: { forward: -1, backward: 1 },
  related_to: { forward: 0, backward: 0 },
};

const RELATION_LABEL: Record<string, string> = {
  parent_of: 'Parent', child_of: 'Child', sibling_of: 'Sibling', spouse_of: 'Spouse',
  grandparent_of: 'Grandparent', grandchild_of: 'Grandchild', aunt_of: 'Aunt', uncle_of: 'Uncle',
  cousin_of: 'Cousin', in_law_of: 'In-law', step_parent_of: 'Step-parent', step_sibling_of: 'Step-sibling',
  half_sibling_of: 'Half-sibling', related_to: 'Relative',
};

function isFamilyType(type: string): boolean {
  const t = (type ?? '').toLowerCase();
  return FAMILY_TYPES.has(t) || t.includes('parent') || t.includes('sibling') || t.includes('family');
}

function relationFromType(type: string, delta: number): FamilyRelationType {
  const t = type.toLowerCase();
  if (delta <= -2 || t.includes('grandparent')) return 'grandparent';
  if (delta >= 2 || t.includes('grandchild')) return 'grandchild';
  if (delta === -1 || t.includes('parent') || t === 'mother' || t === 'father') return 'parent';
  if (delta === 1 || t.includes('child')) return 'child';
  if (t.includes('spouse')) return 'spouse';
  if (t.includes('cousin')) return 'cousin';
  if (t.includes('aunt')) return 'aunt';
  if (t.includes('uncle')) return 'uncle';
  if (t.includes('half_sibling')) return 'half_sibling';
  if (t.includes('step_sibling')) return 'step_sibling';
  if (t.includes('step_parent')) return 'step_parent';
  if (t.includes('in_law')) return 'in_law';
  if (t.includes('sibling') || t === 'brother' || t === 'sister') return 'sibling';
  return 'related';
}

function labelForRelation(relation: FamilyRelationType, name: string, evidence?: string): string {
  if (evidence?.trim()) {
    const short = evidence.trim().slice(0, 40);
    if (/^(my|our|mi)\s/i.test(short)) return short.replace(/^(my|our|mi)\s/i, '').trim() || relation;
  }
  const map: Record<FamilyRelationType, string> = {
    parent: 'Parent', child: 'Child', sibling: 'Sibling', twin: 'Twin',
    grandparent: 'Grandparent', grandchild: 'Grandchild', aunt: 'Aunt', uncle: 'Uncle',
    cousin: 'Cousin', spouse: 'Spouse', in_law: 'In-law', step_parent: 'Step-parent',
    step_sibling: 'Step-sibling', half_sibling: 'Half-sibling', related: 'Relative',
  };
  return map[relation] ?? name.split(' ')[0];
}

class FamilyTreeService {
  /** The user's own character row (protagonist / "You"). */
  async findUserCharacterId(userId: string): Promise<string | null> {
    const { data } = await supabaseAdmin
      .from('characters')
      .select('id, name, importance_level, metadata')
      .eq('user_id', userId)
      .order('importance_score', { ascending: false })
      .limit(50);

    const rows = (data ?? []) as Array<{ id: string; name: string; importance_level?: string; metadata?: Record<string, unknown> }>;
    const self = rows.find(r =>
      r.metadata?.is_self === true ||
      /^you$/i.test(r.name) ||
      r.importance_level === 'protagonist'
    );
    return self?.id ?? rows[0]?.id ?? null;
  }

  /** User's personal family tree (centered on the user character). */
  async getUserFamilyTree(userId: string): Promise<FamilyTreeDTO | null> {
    const selfId = await this.findUserCharacterId(userId);
    if (!selfId) return null;
    return this.getCharacterFamilyTree(userId, selfId, { isUserTree: true });
  }

  /** Family tree centered on a specific character. */
  async getCharacterFamilyTree(
    userId: string,
    characterId: string,
    opts: { isUserTree?: boolean; rebuild?: boolean } = {}
  ): Promise<FamilyTreeDTO | null> {
    try {
      if (opts.rebuild) {
        await relationshipTreeBuilder.buildTree(userId, characterId, 'character', 'family', 4);
      }

      const edges = await this.loadFamilyEdges(userId, characterId);
      if (edges.length === 0) {
        // Fallback: relationship tree builder
        const built = await relationshipTreeBuilder.buildTree(userId, characterId, 'character', 'family', 4);
        if (built) {
          for (const rel of built.relationships) {
            if (rel.category === 'family' || isFamilyType(rel.type)) {
              edges.push({
                fromId: rel.fromId,
                toId: rel.toId,
                type: rel.type,
                confidence: rel.confidence,
              });
            }
          }
        }
      }

      const { data: rootChar } = await supabaseAdmin
        .from('characters')
        .select('id, name, importance_score, metadata')
        .eq('id', characterId)
        .eq('user_id', userId)
        .single();

      if (!rootChar) return null;

      const names = await this.loadNames(userId, [characterId, ...edges.flatMap(e => [e.fromId, e.toId])]);
      names.set(characterId, rootChar.name);

      return this.buildTreeFromEdges(characterId, rootChar.name, edges, names, {
        markSelf: opts.isUserTree ?? false,
        selfId: characterId,
      });
    } catch (error) {
      logger.error({ error, userId, characterId }, 'Failed to build character family tree');
      return null;
    }
  }

  /** Family tree for a family-type organization (all member kinship). */
  async getOrganizationFamilyTree(userId: string, organizationId: string): Promise<FamilyTreeDTO | null> {
    try {
      const org = await organizationService.getOrganization(userId, organizationId);
      if (!org) return null;

      const members = await organizationService.getMembers(organizationId);
      const charIds = [...new Set(members.map(m => m.character_id).filter((id): id is string => Boolean(id)))];
      if (charIds.length === 0) {
        // Name-only members → flat roster at gen 0
        const selfId = await this.findUserCharacterId(userId);
        const roster: FamilyMemberDTO[] = members.map((m, i) => ({
          id: m.character_id ?? `name-${i}`,
          name: m.character_name,
          first_name: m.character_name.split(' ')[0],
          relation: 'related',
          relation_label: m.role ?? 'Member',
          generation: 0,
          is_self: m.character_id === selfId,
        }));
        return {
          members: roster,
          branches: [{ side: 'other', label: org.name, color: '#a855f7' }],
          self_id: selfId ?? roster[0]?.id ?? '',
        };
      }

      const edges: Array<{ fromId: string; toId: string; type: string; confidence: number }> = [];
      const { data: rels } = await supabaseAdmin
        .from('character_relationships')
        .select('source_character_id, target_character_id, relationship_type, closeness_score, metadata')
        .eq('user_id', userId)
        .in('source_character_id', charIds);

      for (const r of (rels ?? []) as Array<{ source_character_id: string; target_character_id: string; relationship_type: string; closeness_score?: number; metadata?: Record<string, unknown> }>) {
        if (!charIds.includes(r.target_character_id)) continue;
        if (!isFamilyType(r.relationship_type)) continue;
        edges.push({
          fromId: r.source_character_id,
          toId: r.target_character_id,
          type: r.relationship_type,
          confidence: 0.7,
        });
      }

      const selfId = (await this.findUserCharacterId(userId)) ?? charIds[0];
      const anchor = charIds.includes(selfId) ? selfId : charIds[0];
      const names = await this.loadNames(userId, charIds);
      for (const m of members) {
        if (m.character_id) names.set(m.character_id, m.character_name);
      }

      const tree = this.buildTreeFromEdges(anchor, names.get(anchor) ?? org.name, edges, names, {
        markSelf: true,
        selfId,
        restrictIds: new Set(charIds),
      });

      // Ensure every org member appears even if no edges
      for (const m of members) {
        const id = m.character_id ?? m.character_name;
        if (!tree.members.some(x => x.id === id)) {
          tree.members.push({
            id,
            name: m.character_name,
            first_name: m.character_name.split(' ')[0],
            relation: 'related',
            relation_label: m.role ?? 'Member',
            generation: 0,
          });
        }
      }

      tree.branches = [
        { side: 'maternal', label: 'Maternal', color: '#f472b6' },
        { side: 'paternal', label: 'Paternal', color: '#60a5fa' },
        { side: 'other', label: org.name, color: '#a855f7' },
      ];
      return tree;
    } catch (error) {
      logger.error({ error, userId, organizationId }, 'Failed to build organization family tree');
      return null;
    }
  }

  /** All group affiliations for a character (multiple orgs/cliques/teams). */
  async getCharacterAffiliations(userId: string, characterId: string, characterName?: string) {
    return organizationService.getOrganizationsByCharacter(userId, characterId, characterName);
  }

  async getMemberAffiliationsForOrganization(userId: string, organizationId: string) {
    return organizationService.getMemberAffiliationsBatch(userId, organizationId);
  }

  private async loadFamilyEdges(userId: string, rootId: string) {
    const edges: Array<{ fromId: string; toId: string; type: string; confidence: number; evidence?: string }> = [];
    const seen = new Set<string>();

    const { data: out } = await supabaseAdmin
      .from('character_relationships')
      .select('source_character_id, target_character_id, relationship_type, closeness_score, metadata, summary')
      .eq('user_id', userId)
      .or(`source_character_id.eq.${rootId},target_character_id.eq.${rootId}`);

    for (const r of (out ?? []) as Array<{ source_character_id: string; target_character_id: string; relationship_type: string; closeness_score?: number; metadata?: Record<string, unknown>; summary?: string }>) {
      if (!isFamilyType(r.relationship_type)) continue;
      const key = `${r.source_character_id}|${r.target_character_id}|${r.relationship_type}`;
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push({
        fromId: r.source_character_id,
        toId: r.target_character_id,
        type: r.relationship_type,
        confidence: 0.75,
        evidence: (r.metadata?.evidence as string) ?? r.summary,
      });
    }
    return edges;
  }

  private async loadNames(userId: string, ids: string[]): Promise<Map<string, string>> {
    const uniq = [...new Set(ids.filter(Boolean))];
    if (uniq.length === 0) return new Map();
    const { data } = await supabaseAdmin
      .from('characters')
      .select('id, name')
      .eq('user_id', userId)
      .in('id', uniq);
    const map = new Map<string, string>();
    for (const row of (data ?? []) as Array<{ id: string; name: string }>) {
      map.set(row.id, row.name);
    }
    return map;
  }

  private buildTreeFromEdges(
    rootId: string,
    rootName: string,
    edges: Array<{ fromId: string; toId: string; type: string; confidence: number; evidence?: string }>,
    names: Map<string, string>,
    opts: { markSelf?: boolean; selfId?: string; restrictIds?: Set<string> }
  ): FamilyTreeDTO {
    const adj = new Map<string, Array<{ neighbor: string; type: string; evidence?: string }>>();
    const addAdj = (a: string, b: string, type: string, evidence?: string) => {
      (adj.get(a) ?? adj.set(a, []).get(a)!).push({ neighbor: b, type, evidence });
    };
    for (const e of edges) {
      addAdj(e.fromId, e.toId, e.type, e.evidence);
      addAdj(e.toId, e.fromId, e.type, e.evidence);
    }

    const generations = new Map<string, number>();
    const relationToRoot = new Map<string, { relation: FamilyRelationType; label: string; evidence?: string }>();
    generations.set(rootId, 0);
    relationToRoot.set(rootId, { relation: 'related', label: 'You' });

    const queue = [rootId];
    while (queue.length) {
      const current = queue.shift()!;
      const currentGen = generations.get(current)!;
      for (const { neighbor, type, evidence } of adj.get(current) ?? []) {
        if (opts.restrictIds && !opts.restrictIds.has(neighbor)) continue;
        const deltas = GEN_DELTA[type.toLowerCase()] ?? { forward: 0, backward: 0 };
        let delta = 0;
        const edge = edges.find(e =>
          (e.fromId === current && e.toId === neighbor) || (e.fromId === neighbor && e.toId === current)
        );
        if (edge?.fromId === current) delta = deltas.forward;
        else if (edge?.toId === current) delta = deltas.backward;

        const nextGen = currentGen + delta;
        if (!generations.has(neighbor)) {
          generations.set(neighbor, nextGen);
          const rel = relationFromType(type, nextGen - 0);
          relationToRoot.set(neighbor, {
            relation: rel,
            label: labelForRelation(rel, names.get(neighbor) ?? '', evidence),
            evidence,
          });
          queue.push(neighbor);
        }
      }
    }

    const selfId = opts.selfId ?? rootId;
    const members: FamilyMemberDTO[] = [...generations.entries()].map(([id, generation]) => {
      const relInfo = relationToRoot.get(id)!;
      const name = names.get(id) ?? 'Unknown';
      return {
        id,
        name,
        first_name: name.split(' ')[0],
        relation: relInfo.relation,
        relation_label: id === selfId && opts.markSelf ? 'You' : relInfo.label,
        generation,
        is_self: id === selfId,
        closeness: id === selfId ? 100 : undefined,
        side: inferSide(relInfo.evidence),
      };
    });

    members.sort((a, b) => a.generation - b.generation || a.name.localeCompare(b.name));

    return {
      members,
      branches: [
        { side: 'maternal', label: 'Maternal', color: '#f472b6' },
        { side: 'paternal', label: 'Paternal', color: '#60a5fa' },
        { side: 'partner', label: 'Partner side', color: '#34d399' },
      ],
      self_id: selfId,
    };
  }
}

function inferSide(evidence?: string): 'maternal' | 'paternal' | 'both' | 'other' | undefined {
  if (!evidence) return undefined;
  const t = evidence.toLowerCase();
  if (/\b(maternal|mother'?s? side|mom'?s? side|mi mam[aá]|lado materno)\b/.test(t)) return 'maternal';
  if (/\b(paternal|father'?s? side|dad'?s? side|mi pap[aá]|lado paterno)\b/.test(t)) return 'paternal';
  return undefined;
}

export const familyTreeService = new FamilyTreeService();
