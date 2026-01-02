import { Card, CardContent } from '../ui/card';

export const LoadingSkeleton = () => {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <Card key={i} className="bg-black/40 border-border/60">
            <CardContent className="p-6">
              <div className="space-y-3">
                <div className="h-4 bg-white/10 rounded w-3/4 animate-pulse" />
                <div className="h-8 bg-white/10 rounded w-1/2 animate-pulse" />
                <div className="h-3 bg-white/5 rounded w-full animate-pulse" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card className="bg-black/40 border-border/60">
        <CardContent className="p-6">
          <div className="space-y-4">
            <div className="h-6 bg-white/10 rounded w-1/4 animate-pulse" />
            <div className="h-32 bg-white/5 rounded w-full animate-pulse" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export const MetricSkeleton = () => {
  return (
    <Card className="bg-black/40 border-border/60">
      <CardContent className="p-4">
        <div className="space-y-2">
          <div className="h-3 bg-white/10 rounded w-1/2 animate-pulse" />
          <div className="h-6 bg-white/10 rounded w-1/3 animate-pulse" />
        </div>
      </CardContent>
    </Card>
  );
};

export const ChartSkeleton = () => {
  return (
    <Card className="bg-black/40 border-border/60">
      <CardContent className="p-6">
        <div className="space-y-4">
          <div className="h-5 bg-white/10 rounded w-1/4 animate-pulse" />
          <div className="h-64 bg-white/5 rounded w-full animate-pulse" />
        </div>
      </CardContent>
    </Card>
  );
};

