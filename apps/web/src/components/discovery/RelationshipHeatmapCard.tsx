import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';

interface HeatmapEntry {
  character: string;
  values: number[];
}

interface RelationshipHeatmapCardProps {
  heatmap: HeatmapEntry[];
}

export const RelationshipHeatmapCard = ({ heatmap }: RelationshipHeatmapCardProps) => {
  if (!heatmap || heatmap.length === 0) {
    return (
      <Card className="bg-black/40 border-border/60">
        <CardHeader>
          <CardTitle className="text-white">Relationship Activity Heatmap</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-64 flex items-center justify-center text-white/40">
            No heatmap data available
          </div>
        </CardContent>
      </Card>
    );
  }

  // Filter out entries without valid values arrays
  const validHeatmap = heatmap.filter(h => h.values && Array.isArray(h.values) && h.values.length > 0);
  
  if (validHeatmap.length === 0) {
    return (
      <Card className="bg-black/40 border-border/60">
        <CardHeader>
          <CardTitle className="text-white">Relationship Activity Heatmap</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-64 flex items-center justify-center text-white/40">
            No heatmap data available
          </div>
        </CardContent>
      </Card>
    );
  }

  // Find max value for normalization
  const maxValue = Math.max(...validHeatmap.flatMap(h => h.values), 1);

  // Get number of weeks/columns
  const maxWeeks = Math.max(...validHeatmap.map(h => h.values.length), 0);

  const getIntensityColor = (value: number): string => {
    if (value === 0) return 'bg-black/20';
    const intensity = value / maxValue;
    if (intensity > 0.8) return 'bg-purple-600';
    if (intensity > 0.6) return 'bg-purple-500';
    if (intensity > 0.4) return 'bg-purple-400/70';
    if (intensity > 0.2) return 'bg-purple-400/50';
    return 'bg-purple-400/30';
  };

  return (
    <Card className="bg-black/40 border-border/60">
      <CardHeader>
        <CardTitle className="text-white">Relationship Activity Heatmap</CardTitle>
        <CardDescription className="text-white/60">
          Weekly mention frequency across your relationships
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <div className="min-w-full">
            {/* Header row with week numbers */}
            <div className="flex mb-2">
              <div className="w-32 flex-shrink-0"></div>
              <div className="flex gap-1 flex-1">
                {Array.from({ length: Math.min(maxWeeks, 20) }, (_, i) => (
                  <div
                    key={i}
                    className="flex-1 text-xs text-white/40 text-center"
                    title={`Week ${i + 1}`}
                  >
                    {i + 1}
                  </div>
                ))}
              </div>
            </div>

            {/* Character rows */}
            <div className="space-y-1">
              {validHeatmap.slice(0, 20).map((entry) => (
                <div key={entry.character} className="flex items-center gap-2">
                  <div className="w-32 flex-shrink-0 text-sm text-white/80 truncate" title={entry.character}>
                    {entry.character}
                  </div>
                  <div className="flex gap-1 flex-1">
                    {entry.values.slice(0, 20).map((value, idx) => (
                      <div
                        key={idx}
                        className={`flex-1 h-6 rounded ${getIntensityColor(value)} transition-colors hover:opacity-80`}
                        title={`${entry.character}: ${value} mentions in week ${idx + 1}`}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Legend */}
            <div className="mt-4 flex items-center gap-4 text-xs text-white/60">
              <span>Less</span>
              <div className="flex gap-1 flex-1">
                <div className="flex-1 h-3 bg-purple-400/30 rounded"></div>
                <div className="flex-1 h-3 bg-purple-400/50 rounded"></div>
                <div className="flex-1 h-3 bg-purple-400/70 rounded"></div>
                <div className="flex-1 h-3 bg-purple-500 rounded"></div>
                <div className="flex-1 h-3 bg-purple-600 rounded"></div>
              </div>
              <span>More</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

