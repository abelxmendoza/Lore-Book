import type { FabricNode } from '../../api/fabric';
import { Card, CardContent } from '../ui/card';

export const FabricNodeCard = ({ node }: { node: FabricNode }) => (
  <Card className="border-border/30 bg-white/5">
    <CardContent className="space-y-1 p-3 text-sm">
      <div className="text-xs uppercase text-white/50">{node.type}</div>
      <div className="text-lg font-semibold text-foreground">{node.label}</div>
      {node.group && <p className="text-xs text-white/60">Group: {node.group}</p>}
    </CardContent>
  </Card>
);
