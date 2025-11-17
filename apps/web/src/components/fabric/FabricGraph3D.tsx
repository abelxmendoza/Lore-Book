import type { FabricSnapshot } from '../../api/fabric';
import { Card, CardContent } from '../ui/card';

export const FabricGraph3D = ({ snapshot }: { snapshot: FabricSnapshot | null }) => (
  <Card className="border border-primary/20 bg-black/40">
    <CardContent className="space-y-2 p-4">
      <div className="text-xs uppercase tracking-wide text-white/50">Graph Overview</div>
      <div className="h-48 rounded-lg border border-dashed border-primary/30 bg-neon-grid" />
      <p className="text-sm text-white/60">
        {snapshot ? `${snapshot.nodes.length} nodes linked by ${snapshot.links.length} edges` : 'Loading fabric…'}
      </p>
    </CardContent>
  </Card>
);
