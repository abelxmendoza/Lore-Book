/**
 * OrganizationGroupNetwork — G1 group hierarchy & affiliation graph.
 * Data: GET /api/organizations/network
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Network, GitBranch, Building2, RefreshCw, Loader2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../ui/tabs';
import { fetchJson } from '../../lib/api';
import { onStoryDataUpdated } from '../../lib/storyRefresh';
import type { OrgRelationshipType } from '../organizations/OrganizationProfileCard';

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
  }>;
};

type OrgNetworkEdge = {
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
};

export function OrganizationGroupNetwork({
  rootOrgId,
  compact,
  title = 'Group Network',
  onOrgClick,
}: Props) {
  const [network, setNetwork] = useState<OrgNetwork | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'tree' | 'graph'>('graph');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const q = new URLSearchParams();
      if (rootOrgId) q.set('rootOrgId', rootOrgId);
      q.set('depth', compact ? '3' : '5');
      const data = await fetchJson<{ success: boolean; network: OrgNetwork }>(
        `/api/organizations/network?${q.toString()}`
      );
      if (data.success) {
        setNetwork(data.network);
        if (data.network.rootOrg) setExpanded(new Set([data.network.rootOrg.id]));
      }
    } catch {
      setNetwork(null);
    } finally {
      setLoading(false);
    }
  }, [rootOrgId, compact]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => onStoryDataUpdated(() => { void load(); }, 'organizations'), [load]);

  const nodeById = useMemo(
    () => new Map((network?.nodes ?? []).map(n => [n.id, n])),
    [network]
  );

  const hierarchyChildren = useCallback((parentId: string): string[] => {
    if (!network) return [];
    return network.edges
      .filter(e => e.toId === parentId && HIERARCHY.has(e.relationshipType))
      .map(e => e.fromId);
  }, [network]);

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
      if (!levels.has(n.id)) levels.set(n.id, 0);
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

  if (!network || network.orgCount === 0) {
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
        <Tabs value={view} onValueChange={v => setView(v as 'tree' | 'graph')}>
          <TabsList className={`mb-3 ${compact ? 'h-8' : ''}`}>
            <TabsTrigger value="graph" className="text-xs">
              <GitBranch className="w-3.5 h-3.5 mr-1" /> Graph
            </TabsTrigger>
            <TabsTrigger value="tree" className="text-xs">
              <Building2 className="w-3.5 h-3.5 mr-1" /> Tree
            </TabsTrigger>
          </TabsList>

          <TabsContent value="graph" className="mt-0">
            {graphLayout && (
              <div className="overflow-x-auto rounded-xl border border-white/10 bg-black/50">
                <svg width={graphLayout.w} height={graphLayout.h} className="min-w-full">
                  {network.edges.map((e, i) => {
                    const a = graphLayout.positions.get(e.fromId);
                    const b = graphLayout.positions.get(e.toId);
                    if (!a || !b) return null;
                    const mx = (a.x + b.x) / 2;
                    const my = (a.y + b.y) / 2;
                    return (
                      <g key={i}>
                        <line
                          x1={a.x} y1={a.y + 18} x2={b.x} y2={b.y - 18}
                          className={`${relColor(e.relationshipType, e.inferred)}`}
                          strokeWidth={HIERARCHY.has(e.relationshipType) ? 2 : 1.5}
                          strokeDasharray={e.inferred ? '4 3' : undefined}
                        />
                        <text x={mx} y={my} className="fill-white/35 text-[9px]" textAnchor="middle">
                          {REL_LABEL[e.relationshipType] ?? e.relationshipType}
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
            </p>
          </TabsContent>

          <TabsContent value="tree" className="mt-0 max-h-[420px] overflow-y-auto pr-1">
            {network.rootOrg
              ? renderTreeNode(network.rootOrg.id)
              : network.nodes.map(n => renderTreeNode(n.id))}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
