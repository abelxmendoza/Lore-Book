import { useEffect, useMemo, useRef, useState } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import { RefreshCw } from 'lucide-react';
import { fetchJson } from '../../lib/api';

export type ConstellationNode = {
  id: string;
  label: string;
  kind: string;
  artifactType: string;
  color?: string;
};

export type ConstellationLink = {
  source: string;
  target: string;
  relation: string;
  weight: number;
};

export type LoreConstellation = {
  nodes: ConstellationNode[];
  links: ConstellationLink[];
  centerId?: string;
};

type Props = {
  centerId?: string;
  onNodeClick?: (node: ConstellationNode) => void;
};

export function LoreConstellationView({ centerId, onNodeClick }: Props) {
  const graphRef = useRef<any>();
  const [data, setData] = useState<LoreConstellation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const query = new URLSearchParams();
      if (centerId) query.set('centerId', centerId);
      query.set('limit', '60');
      const result = await fetchJson<LoreConstellation>(`/api/artifacts/constellation?${query}`);
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load constellation');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [centerId]);

  const graphData = useMemo(() => {
    if (!data) return { nodes: [], links: [] };
    return {
      nodes: data.nodes.map((n) => ({ ...n, val: n.id === centerId ? 3 : 1 })),
      links: data.links.map((l) => ({
        source: l.source,
        target: l.target,
        relation: l.relation,
        weight: l.weight,
      })),
    };
  }, [data, centerId]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-zinc-500 py-16 justify-center">
        <RefreshCw className="w-5 h-5 animate-spin" />
        <span className="text-sm">Mapping your lore…</span>
      </div>
    );
  }

  if (error) {
    return <p className="text-rose-400 text-sm text-center py-12">{error}</p>;
  }

  if (!data || data.nodes.length === 0) {
    return (
      <p className="text-zinc-500 text-sm text-center py-16">
        Not enough linked assets yet. Chat, upload files, or add people to grow your constellation.
      </p>
    );
  }

  return (
    <div
      className="rounded-xl border border-zinc-800 bg-zinc-950 overflow-hidden"
      data-testid="lore-constellation-view"
    >
      <div className="px-4 py-2 border-b border-zinc-800 flex items-center justify-between">
        <p className="text-xs text-zinc-500">
          {data.nodes.length} assets · {data.links.length} links
          {centerId ? ' · centered view' : ''}
        </p>
        <button
          type="button"
          onClick={() => void load()}
          className="text-xs text-zinc-400 hover:text-white"
        >
          Refresh
        </button>
      </div>
      <div className="h-[420px]">
        <ForceGraph2D
          ref={graphRef}
          graphData={graphData}
          nodeLabel={(n: any) => n.label}
          nodeColor={(n: any) => n.color ?? '#71717a'}
          nodeRelSize={6}
          linkColor={() => 'rgba(168, 85, 247, 0.35)'}
          linkWidth={(l: any) => Math.max(1, (l.weight ?? 1) * 1.5)}
          linkDirectionalArrowLength={3}
          linkDirectionalArrowRelPos={1}
          onNodeClick={(node: any) => onNodeClick?.(node as ConstellationNode)}
          backgroundColor="rgba(0,0,0,0)"
        />
      </div>
    </div>
  );
}
