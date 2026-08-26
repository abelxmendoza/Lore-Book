/**
 * OrganizationGroupNetwork — G1 group hierarchy & affiliation graph.
 * Data: GET /api/organizations/network
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Network, GitBranch, Building2, List, RefreshCw, Loader2, MapPin } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../ui/tabs';
import { fetchJson } from '../../lib/api';
import { onStoryDataUpdated } from '../../lib/storyRefresh';
import type { OrgRelationshipType } from '../organizations/OrganizationProfileCard';
import {
  groupChildrenBySite,
  isOrgSiteNodeId,
  orgSiteNodeId,
  type OrgNetworkLocation,
} from './orgNetworkSites';

type OrgNetworkNode = {
  id: string;
  name: string;
  group_type?: string;
  member_count: number;
  member_names: string[];
  relationships: Array<{
    toId: string;
    relationshipType: OrgRelationshipType;
    direction: 'outgoing' | 'incoming';
    inferred: boolean;
    notes?: string;
    relationshipId?: string;
  }>;
  locations?: OrgNetworkLocation[];
};

type OrgNetworkEdge = {
  id?: string;
  fromId: string;
  toId: string;
  relationshipType: OrgRelationshipType;
  inferred: boolean;
  notes?: string;
};

type OrgNetwork = {
  rootOrg: OrgNetworkNode | null;
  nodes: OrgNetworkNode[];
  edges: OrgNetworkEdge[];
  orgCount: number;
  edgeCount: number;
};

type PreviewOrg = {
  id: string;
  name: string;
  group_type?: string;
  member_count?: number;
  parent_group_id?: string | null;
  members?: Array<{ character_name: string }>;
  locations?: Array<{ location_id?: string; location_name: string }>;
};

function mapPreviewLocations(org: PreviewOrg): OrgNetworkLocation[] {
  return (org.locations ?? []).map(loc => ({
    locationId: loc.location_id,
    name: loc.location_name,
  }));
}

export function buildOrgNetworkPreview(
  root: PreviewOrg,
  peers: PreviewOrg[],
  relationships: Array<{
    id: string;
    from_org_id: string;
    to_org_id: string;
    relationship_type: OrgRelationshipType;
    notes?: string;
  }>,
): OrgNetwork {
  const orgs = [root, ...peers.filter(org => org.id !== root.id)];
  const orgById = new Map(orgs.map(org => [org.id, org]));
  const relatedIds = new Set<string>([root.id]);
  for (const rel of relationships) {
    if (rel.from_org_id === root.id || rel.to_org_id === root.id) {
      relatedIds.add(rel.from_org_id);
      relatedIds.add(rel.to_org_id);
    }
  }
  if (root.parent_group_id && orgById.has(root.parent_group_id)) {
    relatedIds.add(root.parent_group_id);
  }
  for (const org of orgs) {
    if (org.parent_group_id === root.id) relatedIds.add(org.id);
  }
  const scopedRelationships = relationships.filter(
    (rel) => relatedIds.has(rel.from_org_id) && relatedIds.has(rel.to_org_id),
  );
  const edges: OrgNetworkEdge[] = scopedRelationships.map(rel => ({
    id: rel.id,
    fromId: rel.from_org_id,
    toId: rel.to_org_id,
    relationshipType: rel.relationship_type,
    inferred: Boolean(rel.notes?.startsWith('[auto-inferred]')),
    notes: rel.notes,
  }));
  const edgeKeys = new Set(edges.map(edge => `${edge.fromId}|${edge.toId}|${edge.relationshipType}`));
  for (const org of orgs) {
    if (!relatedIds.has(org.id)) continue;
    if (!org.parent_group_id || !relatedIds.has(org.parent_group_id) || !orgById.has(org.parent_group_id)) continue;
    const key = `${org.id}|${org.parent_group_id}|part_of`;
    if (edgeKeys.has(key)) continue;
    edgeKeys.add(key);
    edges.push({
      fromId: org.id,
      toId: org.parent_group_id,
      relationshipType: 'part_of',
      inferred: false,
      notes: '[parent-group] Canonical organization hierarchy',
    });
  }
  const nodeRels = new Map<string, OrgNetworkNode['relationships']>();
  const addRel = (orgId: string, rel: OrgNetworkNode['relationships'][number]) => {
    const list = nodeRels.get(orgId) ?? [];
    list.push(rel);
    nodeRels.set(orgId, list);
  };
  for (const edge of edges) {
    addRel(edge.fromId, {
      toId: edge.toId,
      relationshipType: edge.relationshipType,
      direction: 'outgoing',
      inferred: edge.inferred,
      notes: edge.notes,
      relationshipId: edge.id,
    });
    addRel(edge.toId, {
      toId: edge.fromId,
      relationshipType: edge.relationshipType,
      direction: 'incoming',
      inferred: edge.inferred,
      notes: edge.notes,
      relationshipId: edge.id,
    });
  }
  const nodes: OrgNetworkNode[] = orgs
    .filter(org => org.id === root.id || edges.some(edge => edge.fromId === org.id || edge.toId === org.id))
    .map(org => ({
      id: org.id,
      name: org.name,
      group_type: org.group_type,
      member_count: org.members?.length ?? org.member_count ?? 0,
      member_names: (org.members ?? []).map(member => member.character_name).slice(0, 8),
      relationships: nodeRels.get(org.id) ?? [],
      locations: mapPreviewLocations(org),
    }));
  const rootNode = nodes.find(node => node.id === root.id) ?? nodes[0] ?? null;
  return {
    rootOrg: rootNode,
    nodes,
    edges: edges.filter(edge => orgById.has(edge.fromId) && orgById.has(edge.toId)),
    orgCount: nodes.length,
    edgeCount: edges.length,
  };
}

const REL_LABEL: Record<string, string> = {
  part_of: 'part of',
  spawned_from: 'spawned from',
  affiliated_with: 'affiliated',
  rival_of: 'rival',
  collaborated_with: 'collaborated',
  succeeded_by: 'succeeded by',
  merged_with: 'merged',
};

const HIERARCHY = new Set(['part_of', 'spawned_from']);

const relColor = (type: string, inferred: boolean) => {
  if (HIERARCHY.has(type)) return inferred ? 'stroke-indigo-400/70' : 'stroke-indigo-300';
  if (type === 'rival_of') return 'stroke-rose-400/70';
  return inferred ? 'stroke-emerald-400/50' : 'stroke-emerald-300/80';
};

const nodeFill = (isRoot: boolean) =>
  isRoot ? 'fill-indigo-500/25 stroke-indigo-400/60' : 'fill-black/60 stroke-white/25';

type Props = {
  rootOrgId?: string;
  compact?: boolean;
  title?: string;
  onOrgClick?: (orgId: string, orgName: string) => void;
  onLocationClick?: (locationId: string | undefined, locationName: string) => void;
  onDisconnect?: (edge: OrgNetworkEdge) => void;
  previewNetwork?: OrgNetwork | null;
};

export function OrganizationGroupNetwork({
  rootOrgId,
  compact,
  title = 'Group Network',
  onOrgClick,
  onLocationClick,
  onDisconnect,
  previewNetwork,
}: Props) {
  const [fetchedNetwork, setFetchedNetwork] = useState<OrgNetwork | null>(previewNetwork ?? null);
  const [loading, setLoading] = useState(!previewNetwork);
  const [view, setView] = useState<'tree' | 'graph' | 'list'>(compact ? 'list' : 'graph');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [pendingDisconnect, setPendingDisconnect] = useState<OrgNetworkEdge | null>(null);
  const loadGeneration = useRef(0);
  const network = previewNetwork ?? fetchedNetwork;

  const load = useCallback(async () => {
    const generation = ++loadGeneration.current;
    if (previewNetwork) {
      setFetchedNetwork(previewNetwork);
      if (previewNetwork.rootOrg) setExpanded(new Set([previewNetwork.rootOrg.id]));
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const q = new URLSearchParams();
      if (rootOrgId) q.set('rootOrgId', rootOrgId);
      q.set('depth', compact ? '3' : '5');
      const data = await fetchJson<{ success: boolean; network: OrgNetwork }>(
        `/api/organizations/network?${q.toString()}`
      );
      if (generation !== loadGeneration.current) return;
      if (data.success) {
        setFetchedNetwork(data.network);
        if (data.network.rootOrg) setExpanded(new Set([data.network.rootOrg.id]));
      }
    } catch {
      if (generation !== loadGeneration.current) return;
      setFetchedNetwork(null);
    } finally {
      if (generation === loadGeneration.current) setLoading(false);
    }
  }, [rootOrgId, compact, previewNetwork]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => onStoryDataUpdated(() => { void load(); }, 'organizations'), [load]);

  const nodeById = useMemo(
    () => new Map((network?.nodes ?? []).map(n => [n.id, n])),
    [network]
  );

  const siteLayout = useMemo(() => {
    if (!network) {
      return {
        childrenOf: new Map<string, string[]>(),
        siteNodes: new Map<string, { id: string; name: string; locationId?: string; ownerId: string }>(),
        routedHierarchy: new Set<string>(),
      };
    }
    const childrenOf = new Map<string, string[]>();
    const siteNodes = new Map<string, { id: string; name: string; locationId?: string; ownerId: string }>();
    const routedHierarchy = new Set<string>();
    const addChild = (parentId: string, childId: string) => {
      const list = childrenOf.get(parentId) ?? [];
      if (!list.includes(childId)) list.push(childId);
      childrenOf.set(parentId, list);
    };
    for (const node of network.nodes) {
      const rawChildren = network.edges
        .filter(edge => edge.toId === node.id && HIERARCHY.has(edge.relationshipType))
        .map(edge => edge.fromId);
      // Leaf groups that only *occupy* a site should not grow their own empty
      // location nodes (that duplicated Depot/lab under Field Crew / QA Lab).
      const nestSites = node.group_type === 'company' || rawChildren.length > 0;
      if (!nestSites) continue;
      const { buckets, unassigned } = groupChildrenBySite(
        node.locations,
        rawChildren,
        id => nodeById.get(id)?.locations,
      );
      for (const bucket of buckets) {
        const siteId = orgSiteNodeId(node.id, bucket.key);
        siteNodes.set(siteId, {
          id: siteId,
          name: bucket.name,
          locationId: bucket.locationId,
          ownerId: node.id,
        });
        addChild(node.id, siteId);
        for (const childId of bucket.childIds) {
          addChild(siteId, childId);
          routedHierarchy.add(`${childId}|${node.id}`);
        }
      }
      for (const childId of unassigned) addChild(node.id, childId);
    }
    return { childrenOf, siteNodes, routedHierarchy };
  }, [network, nodeById]);

  const hierarchyChildren = useCallback((parentId: string): string[] => {
    return siteLayout.childrenOf.get(parentId) ?? [];
  }, [siteLayout]);

  const graphLayout = useMemo(() => {
    if (!network || network.nodes.length === 0) return null;
    const root = network.rootOrg ?? network.nodes[0];
    const positions = new Map<string, { x: number; y: number }>();
    const levels = new Map<string, number>();

    const assign = (id: string, level: number) => {
      if (levels.has(id) && levels.get(id)! <= level) return;
      levels.set(id, level);
      for (const childId of hierarchyChildren(id)) assign(childId, level + 1);
    };
    assign(root.id, 0);

    for (const n of network.nodes) {
      if (!levels.has(n.id)) assign(n.id, 0);
    }

    const byLevel = new Map<number, string[]>();
    for (const [id, lvl] of levels) {
      const list = byLevel.get(lvl) ?? [];
      list.push(id);
      byLevel.set(lvl, list);
    }

    const w = compact ? 520 : 640;
    const rowH = compact ? 72 : 88;
    const maxLevel = Math.max(...levels.values(), 0);
    const h = (maxLevel + 1) * rowH + 40;

    for (const [lvl, ids] of byLevel) {
      ids.forEach((id, i) => {
        const count = ids.length;
        const x = w / 2 + (i - (count - 1) / 2) * Math.min(140, w / Math.max(count, 1));
        positions.set(id, { x, y: 36 + lvl * rowH });
      });
    }

    return { positions, w, h, rootId: root.id };
  }, [network, hierarchyChildren, compact]);

  const toggle = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const renderTreeNode = (nodeId: string, depth = 0): React.ReactNode => {
    const site = siteLayout.siteNodes.get(nodeId);
    if (site) {
      const children = hierarchyChildren(nodeId);
      return (
        <div key={nodeId} style={{ marginLeft: depth * 16 }}>
          <button
            type="button"
            onClick={() => onLocationClick?.(site.locationId, site.name)}
            className="w-full text-left flex items-start gap-2 p-2.5 rounded-lg mb-1.5 border border-teal-400/25 bg-teal-500/10 transition hover:bg-teal-500/15"
          >
            <span className="text-white/40 w-4 shrink-0">{children.length > 0 ? '−' : ''}</span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <MapPin className="h-3.5 w-3.5 text-teal-300 shrink-0" />
                <span className="font-medium text-white text-sm">{site.name}</span>
                <Badge variant="outline" className="text-[10px] border-teal-400/30 text-teal-200">location</Badge>
                <span className="text-[10px] text-white/40">
                  {children.length} {children.length === 1 ? 'group' : 'groups'}
                </span>
              </div>
            </div>
          </button>
          {children.map(cid => renderTreeNode(cid, depth + 1))}
        </div>
      );
    }

    const node = nodeById.get(nodeId);
    if (!node) return null;
    const children = hierarchyChildren(nodeId);
    const isOpen = expanded.has(nodeId);
    const isRoot = network?.rootOrg?.id === nodeId;

    return (
      <div key={nodeId} style={{ marginLeft: depth * 16 }}>
        <button
          type="button"
          onClick={() => {
            if (children.length) toggle(nodeId);
            onOrgClick?.(nodeId, node.name);
          }}
          className={`w-full text-left flex items-start gap-2 p-2.5 rounded-lg mb-1.5 border transition hover:bg-white/5 ${
            isRoot ? 'border-indigo-500/40 bg-indigo-500/10' : 'border-white/10 bg-black/30'
          }`}
        >
          {children.length > 0 && (
            <span className="text-white/40 w-4 shrink-0">{isOpen ? '−' : '+'}</span>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium text-white text-sm">{node.name}</span>
              {node.group_type && (
                <Badge variant="outline" className="text-[10px]">{node.group_type.replace(/_/g, ' ')}</Badge>
              )}
              <span className="text-[10px] text-white/40">{node.member_count} members</span>
            </div>
            {node.relationships.filter(r => !HIERARCHY.has(r.relationshipType)).slice(0, 2).map((r, i) => {
              const other = nodeById.get(r.toId);
              if (!other) return null;
              return (
                <p key={i} className="text-[10px] text-white/45 mt-1">
                  {REL_LABEL[r.relationshipType] ?? r.relationshipType} → {other.name}
                  {r.inferred && <span className="text-purple-400/70"> · learned</span>}
                </p>
              );
            })}
          </div>
        </button>
        {isOpen && children.map(cid => renderTreeNode(cid, depth + 1))}
      </div>
    );
  };

  if (loading) {
    return (
      <div className={`flex items-center justify-center gap-2 text-white/50 text-sm ${compact ? 'py-6' : 'py-12'}`}>
        <Loader2 className="h-4 w-4 animate-spin" /> Mapping group network…
      </div>
    );
  }

  if (!network || network.edgeCount === 0) {
    return (
      <div className={`text-center text-white/45 ${compact ? 'py-6 px-2' : 'py-10 px-4'}`}>
        <Network className="h-8 w-8 mx-auto mb-2 opacity-30" />
        <p className="text-sm">No group links yet.</p>
        <p className="text-xs mt-1 max-w-xs mx-auto">
          Mention how groups relate in chat — households within families, inner circles within scenes — and LoreBook connects them.
        </p>
      </div>
    );
  }

  return (
    <Card className={`border-border/60 bg-black/40 ${compact ? 'border-0 bg-transparent shadow-none' : ''}`}>
      {!compact && (
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-2">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <Network className="w-4 h-4 text-indigo-400" />
                {title}
              </CardTitle>
              <CardDescription>
                {network.orgCount} groups · {network.edgeCount} connections
              </CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={() => void load()}>
              <RefreshCw className="h-3.5 w-3.5 mr-1" /> Refresh
            </Button>
          </div>
        </CardHeader>
      )}
      <CardContent className={compact ? 'p-0' : 'pt-0'}>
        <Tabs value={view} onValueChange={v => setView(v as 'tree' | 'graph' | 'list')}>
          <TabsList className={`mb-3 ${compact ? 'h-8' : ''}`}>
            <TabsTrigger value="graph" className="text-xs">
              <GitBranch className="w-3.5 h-3.5 mr-1" /> Graph
            </TabsTrigger>
            <TabsTrigger value="tree" className="text-xs">
              <Building2 className="w-3.5 h-3.5 mr-1" /> Tree
            </TabsTrigger>
            <TabsTrigger value="list" className="text-xs">
              <List className="w-3.5 h-3.5 mr-1" /> List
            </TabsTrigger>
          </TabsList>

          <TabsContent value="graph" className="mt-0">
            {graphLayout && (
              <div className="overflow-x-auto rounded-xl border border-white/10 bg-black/50">
                <svg width={graphLayout.w} height={graphLayout.h} className="min-w-full">
                  {network.edges.map((e, i) => {
                    if (HIERARCHY.has(e.relationshipType) && siteLayout.routedHierarchy.has(`${e.fromId}|${e.toId}`)) {
                      return null;
                    }
                    const a = graphLayout.positions.get(e.fromId);
                    const b = graphLayout.positions.get(e.toId);
                    if (!a || !b) return null;
                    const mx = (a.x + b.x) / 2;
                    const my = (a.y + b.y) / 2;
                    const canDisconnect = Boolean(onDisconnect && (e.id || e.relationshipType === 'part_of'));
                    return (
                      <g key={e.id ?? i}>
                        <line
                          x1={a.x} y1={a.y + 18} x2={b.x} y2={b.y - 18}
                          className={`${relColor(e.relationshipType, e.inferred)} ${canDisconnect ? 'cursor-pointer' : ''}`}
                          strokeWidth={HIERARCHY.has(e.relationshipType) ? 2 : 1.5}
                          strokeDasharray={e.inferred ? '4 3' : undefined}
                          onClick={canDisconnect ? (event) => {
                            event.stopPropagation();
                            setPendingDisconnect(e);
                          } : undefined}
                        />
                        <text x={mx} y={my} className="fill-white/35 text-[9px]" textAnchor="middle">
                          {REL_LABEL[e.relationshipType] ?? e.relationshipType}
                        </text>
                      </g>
                    );
                  })}
                  {[...siteLayout.childrenOf.entries()].flatMap(([parentId, childIds]) =>
                    childIds.map((childId) => {
                      const a = graphLayout.positions.get(parentId);
                      const b = graphLayout.positions.get(childId);
                      if (!a || !b) return null;
                      const isSiteHop = isOrgSiteNodeId(parentId) || isOrgSiteNodeId(childId);
                      if (!isSiteHop) return null;
                      const mx = (a.x + b.x) / 2;
                      const my = (a.y + b.y) / 2;
                      return (
                        <g key={`site-edge-${parentId}-${childId}`}>
                          <line
                            x1={a.x} y1={a.y + 18} x2={b.x} y2={b.y - 18}
                            className="stroke-teal-300/80"
                            strokeWidth={2}
                          />
                          <text x={mx} y={my} className="fill-teal-200/50 text-[9px]" textAnchor="middle">
                            {isOrgSiteNodeId(childId) ? 'site' : 'at'}
                          </text>
                        </g>
                      );
                    }),
                  )}
                  {[...siteLayout.siteNodes.values()].map(site => {
                    const p = graphLayout.positions.get(site.id);
                    if (!p) return null;
                    return (
                      <g
                        key={site.id}
                        className="cursor-pointer"
                        onClick={() => onLocationClick?.(site.locationId, site.name)}
                      >
                        <rect
                          x={p.x - 72} y={p.y - 22} width={144} height={44} rx={10}
                          className="fill-teal-500/20 stroke-teal-400/50"
                          strokeWidth={1.5}
                        />
                        <text x={p.x} y={p.y - 4} textAnchor="middle" className="fill-white text-[11px] font-medium pointer-events-none">
                          {site.name.length > 18 ? `${site.name.slice(0, 16)}…` : site.name}
                        </text>
                        <text x={p.x} y={p.y + 12} textAnchor="middle" className="fill-teal-200/70 text-[9px] pointer-events-none">
                          location
                        </text>
                      </g>
                    );
                  })}
                  {network.nodes.map(n => {
                    const p = graphLayout.positions.get(n.id);
                    if (!p) return null;
                    const isRoot = n.id === graphLayout.rootId;
                    return (
                      <g
                        key={n.id}
                        className="cursor-pointer"
                        onClick={() => onOrgClick?.(n.id, n.name)}
                      >
                        <rect
                          x={p.x - 72} y={p.y - 22} width={144} height={44} rx={10}
                          className={nodeFill(isRoot)}
                          strokeWidth={1.5}
                        />
                        <text x={p.x} y={p.y - 4} textAnchor="middle" className="fill-white text-[11px] font-medium pointer-events-none">
                          {n.name.length > 18 ? `${n.name.slice(0, 16)}…` : n.name}
                        </text>
                        <text x={p.x} y={p.y + 12} textAnchor="middle" className="fill-white/45 text-[9px] pointer-events-none">
                          {n.member_count} members{n.group_type ? ` · ${n.group_type.replace(/_/g, ' ')}` : ''}
                        </text>
                        {n.relationships.some(r => r.inferred) && (
                          <circle cx={p.x + 62} cy={p.y - 14} r={3} className="fill-purple-400/80" />
                        )}
                      </g>
                    );
                  })}
                </svg>
              </div>
            )}
            <p className="text-[10px] text-white/35 mt-2">
              Solid lines = hierarchy · dashed = learned from chat · click a group to open
              {onDisconnect ? ' · click a line to disconnect' : ''}
            </p>
            {pendingDisconnect && onDisconnect && (
              <div className="mt-3 rounded-lg border border-rose-400/30 bg-rose-500/10 p-3 text-xs text-white/80">
                Disconnect {nodeById.get(pendingDisconnect.fromId)?.name ?? 'this group'} from {nodeById.get(pendingDisconnect.toId)?.name ?? 'that group'}?
                <div className="mt-2 flex gap-2">
                  <Button
                    size="sm"
                    className="h-8 bg-rose-500/20 border border-rose-400/40 text-rose-100"
                    onClick={() => {
                      onDisconnect(pendingDisconnect);
                      setPendingDisconnect(null);
                    }}
                  >
                    Disconnect
                  </Button>
                  <Button size="sm" variant="outline" className="h-8" onClick={() => setPendingDisconnect(null)}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="tree" className="mt-0 max-h-[420px] overflow-y-auto pr-1">
            {network.rootOrg
              ? renderTreeNode(network.rootOrg.id)
              : network.nodes.map(n => renderTreeNode(n.id))}
          </TabsContent>

          <TabsContent value="list" className="mt-0 space-y-2 max-h-[420px] overflow-y-auto pr-1">
            {network.nodes.map(node => {
              const parentLinks = node.relationships.filter(
                rel => HIERARCHY.has(rel.relationshipType) && rel.direction === 'outgoing',
              );
              const subgroupLinks = node.relationships.filter(
                rel => HIERARCHY.has(rel.relationshipType) && rel.direction === 'incoming',
              );
              const connectedLinks = node.relationships.filter(rel => !HIERARCHY.has(rel.relationshipType));
              const isCompany = node.group_type === 'company';
              const subgroupLabel = isCompany ? 'Departments & jobs: ' : 'Subgroups: ';
              const rawChildIds = subgroupLinks.map(rel => rel.toId);
              const nestSites = isCompany || rawChildIds.length > 0;
              const { buckets, unassigned } = nestSites
                ? groupChildrenBySite(
                    node.locations,
                    rawChildIds,
                    id => nodeById.get(id)?.locations,
                  )
                : { buckets: [], unassigned: [] };
              const unassignedNames = unassigned
                .map(id => nodeById.get(id)?.name)
                .filter(Boolean);
              return (
                <div key={node.id} className="rounded-xl border border-white/10 bg-black/30 p-3">
                  <button
                    type="button"
                    onClick={() => onOrgClick?.(node.id, node.name)}
                    className="text-left text-sm font-semibold text-white hover:text-indigo-300"
                  >
                    {node.name}
                  </button>
                  <p className="mt-0.5 text-[10px] text-white/40">
                    {node.group_type?.replace(/_/g, ' ') ?? 'group'} · {node.member_count} members
                  </p>
                  <div className="mt-2 space-y-1 text-xs text-white/55">
                    {parentLinks.map((rel, index) => (
                      <p key={`parent-${index}`}>
                        <span className="text-white/35">Part of </span>
                        {nodeById.get(rel.toId)?.name ?? 'Unknown group'}
                        {rel.inferred && <span className="text-purple-300/70"> · learned</span>}
                      </p>
                    ))}
                    {buckets.length > 0 && (
                      <div className="space-y-1">
                        <p className="text-white/35">Locations:</p>
                        {buckets.map(bucket => (
                          <p key={bucket.key} className="pl-2">
                            <button
                              type="button"
                              className="text-teal-200 hover:text-teal-100"
                              onClick={() => onLocationClick?.(bucket.locationId, bucket.name)}
                            >
                              {bucket.name}
                            </button>
                            <span className="text-white/35"> — </span>
                            {bucket.childIds.length > 0
                              ? bucket.childIds.map(id => nodeById.get(id)?.name).filter(Boolean).join(', ')
                              : 'no groups yet'}
                          </p>
                        ))}
                      </div>
                    )}
                    {!nestSites && (node.locations?.length ?? 0) > 0 && (
                      <p>
                        <span className="text-white/35">Based at </span>
                        {(node.locations ?? []).map((loc, index) => (
                          <span key={`${loc.locationId ?? loc.name}-${index}`}>
                            {index > 0 ? ', ' : ''}
                            <button
                              type="button"
                              className="text-teal-200 hover:text-teal-100"
                              onClick={() => onLocationClick?.(loc.locationId, loc.name)}
                            >
                              {loc.name}
                            </button>
                          </span>
                        ))}
                      </p>
                    )}
                    {unassignedNames.length > 0 && (
                      <p>
                        <span className="text-white/35">
                          {buckets.length > 0 ? 'Company-wide: ' : subgroupLabel}
                        </span>
                        {unassignedNames.join(', ')}
                      </p>
                    )}
                    {connectedLinks.length > 0 && (
                      <p>
                        <span className="text-white/35">Connected: </span>
                        {connectedLinks.map(rel => {
                          const other = nodeById.get(rel.toId);
                          return other ? `${other.name} (${REL_LABEL[rel.relationshipType] ?? rel.relationshipType})` : null;
                        }).filter(Boolean).join(', ')}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
