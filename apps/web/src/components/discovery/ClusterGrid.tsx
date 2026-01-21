import { Card, CardContent } from '../ui/card';

interface Cluster {
  id: string;
  label: string;
  size: number;
  summary?: string;
  members?: string[];
}

interface ClusterGridProps {
  clusters: Cluster[];
  onClusterClick?: (cluster: Cluster) => void;
}

export const ClusterGrid = ({ clusters, onClusterClick }: ClusterGridProps) => {
  if (!clusters || clusters.length === 0) {
    return (
      <div className="text-center text-white/40 py-8">
        No clusters available
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
      {clusters.map((cluster) => (
        <Card
          key={cluster.id}
          className="bg-black/40 border-border/60 hover:border-primary/50 transition-colors cursor-pointer"
          onClick={() => onClusterClick?.(cluster)}
        >
          <CardContent className="p-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="font-semibold text-white">{cluster.label}</h4>
                <span className="text-xs text-white/60 bg-white/10 px-2 py-1 rounded">
                  {cluster.size}
                </span>
              </div>
              {cluster.summary && (
                <p className="text-sm text-white/70 line-clamp-2">
                  {cluster.summary}
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};

