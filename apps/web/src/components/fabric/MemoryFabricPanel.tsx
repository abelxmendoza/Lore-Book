import { useMemo } from 'react';

import { useMemoryFabric } from '../../hooks/useMemoryFabric';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { FabricFilterBar } from './FabricFilterBar';
import { FabricGraph3D } from './FabricGraph3D';
import { FabricNodeCard } from './FabricNodeCard';

export const MemoryFabricPanel = () => {
  const { snapshot, filters, setFilters } = useMemoryFabric();

  const filteredNodes = useMemo(() => {
    if (!snapshot) return [];
    if (!filters.search) return snapshot.nodes;
    return snapshot.nodes.filter((node) => node.label.toLowerCase().includes(filters.search!.toLowerCase()));
  }, [filters.search, snapshot]);

  return (
    <Card className="neon-surface border border-cyan/30">
      <CardHeader className="flex items-center justify-between">
        <CardTitle className="font-techno text-lg">Memory Fabric</CardTitle>
        <FabricFilterBar filters={filters} onChange={setFilters} />
      </CardHeader>
      <CardContent className="space-y-4">
        <FabricGraph3D snapshot={snapshot} />
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {filteredNodes.map((node) => (
            <FabricNodeCard key={node.id} node={node} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
};
