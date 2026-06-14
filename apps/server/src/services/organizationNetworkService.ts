// =====================================================
// ORGANIZATION NETWORK SERVICE (G1)
// Builds group hierarchy / affiliation graph from organizations
// + organization_relationships for the network UI.
// =====================================================

import { logger } from '../logger';
import {
  organizationService,
  type Organization,
  type OrganizationRelationship,
  type OrgRelationshipType,
} from './organizationService';
import { supabaseAdmin } from './supabaseClient';

export type OrgNetworkEdge = {
  fromId: string;
  toId: string;
  relationshipType: OrgRelationshipType;
  inferred: boolean;
  notes?: string;
};

export type OrgNetworkNodeRel = {
  toId: string;
  relationshipType: OrgRelationshipType;
  direction: 'outgoing' | 'incoming';
  inferred: boolean;
  notes?: string;
};

export type OrgNetworkNode = {
  id: string;
  name: string;
  group_type?: string;
  member_count: number;
  member_names: string[];
  relationships: OrgNetworkNodeRel[];
};

export type OrgNetwork = {
  rootOrg: OrgNetworkNode | null;
  nodes: OrgNetworkNode[];
  edges: OrgNetworkEdge[];
  orgCount: number;
  edgeCount: number;
};

const HIERARCHY_TYPES = new Set<OrgRelationshipType>(['part_of', 'spawned_from']);

export class OrganizationNetworkService {
  async buildNetwork(
    userId: string,
    rootOrgId?: string,
    maxDepth = 4
  ): Promise<OrgNetwork> {
    try {
      const orgs = await organizationService.listOrganizations(userId);
      if (orgs.length === 0) {
        return { rootOrg: null, nodes: [], edges: [], orgCount: 0, edgeCount: 0 };
      }

      const orgById = new Map(orgs.map(o => [o.id, o]));
      const { data: relRows, error } = await supabaseAdmin
        .from('organization_relationships')
        .select('*')
        .eq('user_id', userId);
      if (error) throw error;

      const relationships = (relRows ?? []) as OrganizationRelationship[];
      const edges: OrgNetworkEdge[] = relationships.map(r => ({
        fromId: r.from_org_id,
        toId: r.to_org_id,
        relationshipType: r.relationship_type,
        inferred: Boolean(r.notes?.startsWith('[auto-inferred]')),
        notes: r.notes,
      }));

      const nodeRels = new Map<string, OrgNetworkNodeRel[]>();
      const addRel = (orgId: string, rel: OrgNetworkNodeRel) => {
        const list = nodeRels.get(orgId) ?? [];
        list.push(rel);
        nodeRels.set(orgId, list);
      };

      for (const e of edges) {
        addRel(e.fromId, {
          toId: e.toId,
          relationshipType: e.relationshipType,
          direction: 'outgoing',
          inferred: e.inferred,
          notes: e.notes,
        });
        addRel(e.toId, {
          toId: e.fromId,
          relationshipType: e.relationshipType,
          direction: 'incoming',
          inferred: e.inferred,
          notes: e.notes,
        });
      }

      const buildNode = (org: Organization): OrgNetworkNode => ({
        id: org.id,
        name: org.name,
        group_type: org.group_type ?? org.type,
        member_count: org.members?.length ?? org.member_count ?? 0,
        member_names: (org.members ?? []).map(m => m.character_name).slice(0, 8),
        relationships: nodeRels.get(org.id) ?? [],
      });

      const allNodes = orgs.map(buildNode);
      const nodeById = new Map(allNodes.map(n => [n.id, n]));

      let visibleIds: Set<string>;
      if (rootOrgId && nodeById.has(rootOrgId)) {
        visibleIds = this.collectWithinDepth(rootOrgId, edges, maxDepth);
      } else {
        visibleIds = new Set(allNodes.map(n => n.id));
      }

      const nodes = allNodes.filter(n => visibleIds.has(n.id));
      const visibleEdges = edges.filter(e => visibleIds.has(e.fromId) && visibleIds.has(e.toId));

      let rootOrg: OrgNetworkNode | null = null;
      if (rootOrgId && nodeById.has(rootOrgId)) {
        rootOrg = nodeById.get(rootOrgId)!;
      } else {
        rootOrg = this.pickRootOrg(nodes, edges);
      }

      return {
        rootOrg,
        nodes,
        edges: visibleEdges,
        orgCount: nodes.length,
        edgeCount: visibleEdges.length,
      };
    } catch (error) {
      logger.error({ error, userId }, 'Failed to build organization network');
      return { rootOrg: null, nodes: [], edges: [], orgCount: 0, edgeCount: 0 };
    }
  }

  private collectWithinDepth(
    rootId: string,
    edges: OrgNetworkEdge[],
    maxDepth: number
  ): Set<string> {
    const visible = new Set<string>([rootId]);
    let frontier = [rootId];

    for (let d = 0; d < maxDepth && frontier.length > 0; d++) {
      const next: string[] = [];
      for (const id of frontier) {
        for (const e of edges) {
          const neighbor =
            e.fromId === id ? e.toId :
            e.toId === id ? e.fromId : null;
          if (neighbor && !visible.has(neighbor)) {
            visible.add(neighbor);
            next.push(neighbor);
          }
        }
      }
      frontier = next;
    }
    return visible;
  }

  /** Prefer top-level parents (targets of part_of / spawned_from). */
  private pickRootOrg(nodes: OrgNetworkNode[], edges: OrgNetworkEdge[]): OrgNetworkNode | null {
    if (nodes.length === 0) return null;
    const childIds = new Set<string>();
    for (const e of edges) {
      if (HIERARCHY_TYPES.has(e.relationshipType)) childIds.add(e.fromId);
    }
    const roots = nodes.filter(n => !childIds.has(n.id));
    if (roots.length === 1) return roots[0];
    if (roots.length > 1) {
      const myFamily = roots.find(r => /\bmy family\b/i.test(r.name));
      if (myFamily) return myFamily;
      return roots.sort((a, b) => b.member_count - a.member_count)[0];
    }
    return nodes.sort((a, b) => b.relationships.length - a.relationships.length)[0];
  }
}

export const organizationNetworkService = new OrganizationNetworkService();
