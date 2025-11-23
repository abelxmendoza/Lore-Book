import { useMemo } from 'react';

import { useMemoryFabric } from '../../hooks/useMemoryFabric';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { FabricFilterBar } from './FabricFilterBar';
import { FabricGraph3D } from './FabricGraph3D';
import { FabricNodeCard } from './FabricNodeCard';

export const MemoryFabricPanel = () => {
  const { snapshot, filters, setFilters, loading, error } = useMemoryFabric();

  const filteredNodes = useMemo(() => {
    if (!snapshot) return [];
    if (!filters.search) return snapshot.nodes;
    return snapshot.nodes.filter((node) => node.label.toLowerCase().includes(filters.search!.toLowerCase()));
  }, [filters.search, snapshot]);

  if (loading) {
    return (
      <Card className="neon-surface border border-cyan/30">
        <CardHeader>
          <CardTitle className="font-techno text-lg">Memory Fabric</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-white/60">Loading memory fabric...</div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="neon-surface border border-cyan/30">
        <CardHeader>
          <CardTitle className="font-techno text-lg">Memory Fabric</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-red-400">
            <p>Failed to load memory fabric</p>
            <p className="text-sm text-white/60 mt-2">{error}</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="neon-surface border border-cyan/30">
      <CardHeader className="flex items-center justify-between">
        <CardTitle className="font-techno text-lg">Memory Fabric</CardTitle>
        <FabricFilterBar filters={filters} onChange={setFilters} />
      </CardHeader>
      <CardContent className="space-y-4">
        {snapshot && snapshot.nodes.length > 0 ? (
          <>
            <FabricGraph3D snapshot={snapshot} />
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
              {filteredNodes.map((node) => (
                <FabricNodeCard key={node.id} node={node} />
              ))}
            </div>
          </>
        ) : (
          <div className="text-center py-8 text-white/60">
            <p>No memory connections yet</p>
            <p className="text-sm text-white/40 mt-2">Start creating entries to build your memory fabric</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
