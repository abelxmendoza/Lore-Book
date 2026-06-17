/**
 * Memory Fabric — clusters and bridges across memories.
 * Salvaged from _future-surfaces; wired to GET /api/fabric via useMemoryFabric.
 */
import { useMemo, useState } from 'react';
import { Network, Search } from 'lucide-react';
import { useMemoryFabric } from '../../hooks/useMemoryFabric';
import type { FabricNode } from '../../api/fabric';
import { Input } from '../ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';

function FabricNodeRow({ node }: { node: FabricNode }) {
  return (
    <div className="rounded-lg border border-white/10 bg-black/30 p-3">
      <p className="text-sm font-medium text-white">{node.label}</p>
      {node.type && <p className="text-xs text-white/40 mt-0.5 capitalize">{node.type}</p>}
      {node.metadata && Object.keys(node.metadata).length > 0 && (
        <p className="text-xs text-white/50 mt-1 line-clamp-2">
          {JSON.stringify(node.metadata)}
        </p>
      )}
    </div>
  );
}

export const MemoryFabricPanel = () => {
  const { snapshot, loading, error } = useMemoryFabric();
  const [search, setSearch] = useState('');

  const nodes = useMemo(() => {
    const all = snapshot?.nodes ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return all;
    return all.filter((n) => n.label.toLowerCase().includes(q));
  }, [snapshot?.nodes, search]);

  if (loading) {
    return <p className="text-sm text-white/50 py-12 text-center">Mapping memory connections…</p>;
  }

  if (error) {
    return (
      <p className="text-sm text-red-300/80 py-12 text-center">
        Could not load memory fabric. {error}
      </p>
    );
  }

  const linkCount = snapshot?.links?.length ?? 0;

  return (
    <div className="space-y-6" data-testid="memory-fabric-panel">
      <Card className="bg-gradient-to-r from-cyan-900/20 to-indigo-900/20 border-cyan-500/30">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-cyan-500/15 rounded-lg">
              <Network className="h-6 w-6 text-cyan-400" />
            </div>
            <div>
              <CardTitle className="text-2xl text-white">Memory Fabric</CardTitle>
              <p className="text-sm text-white/60 mt-1">
                Clusters, bridges, and outliers connecting your memories.
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-4 text-sm text-white/70">
          <span><strong className="text-white">{nodes.length}</strong> nodes</span>
          <span><strong className="text-white">{linkCount}</strong> links</span>
        </CardContent>
      </Card>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/30" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Filter nodes…"
          className="pl-9 bg-black/40 border-white/10"
        />
      </div>

      {nodes.length === 0 ? (
        <p className="text-sm text-white/50 py-8 text-center">
          No memory connections yet — chat and journal to build your fabric.
        </p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {nodes.map((node) => (
            <FabricNodeRow key={node.id} node={node} />
          ))}
        </div>
      )}
    </div>
  );
};
