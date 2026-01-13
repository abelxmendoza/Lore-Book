import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip } from 'recharts';

interface ArcAppearance {
  arcName: string;
  count: number;
}

interface ArcAppearanceData {
  character: string;
  arcs: ArcAppearance[];
}

interface ArcAppearanceCardProps {
  arcData: ArcAppearanceData[];
}

export const ArcAppearanceCard = ({ arcData }: ArcAppearanceCardProps) => {
  if (!arcData || arcData.length === 0) {
    return (
      <Card className="bg-black/40 border-border/60">
        <CardHeader>
          <CardTitle className="text-white">Arc Appearances</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-64 flex items-center justify-center text-white/40">
            No arc appearance data available
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-black/40 border-border/60">
      <CardHeader>
        <CardTitle className="text-white">Arc Appearances</CardTitle>
        <CardDescription className="text-white/60">
          Relationship presence across narrative arcs
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {arcData
            .filter((item) => item.arcs && Array.isArray(item.arcs) && item.arcs.length > 0)
            .map((item) => {

            // Create sparkline data from arc counts
            const sparklineData = item.arcs.map((arc, index) => ({
              arc: arc.arcName.substring(0, 10),
              count: arc.count,
              index,
            }));

            const totalAppearances = item.arcs.reduce((sum, arc) => sum + arc.count, 0);
            const maxCount = Math.max(...item.arcs.map(a => a.count), 1);

            return (
              <Card
                key={item.character}
                className="bg-black/60 border-border/60 hover:border-primary/50 transition-colors"
              >
                <CardContent className="p-4">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="font-semibold text-white">{item.character}</h4>
                      <span className="text-sm text-white/60">
                        {totalAppearances} total
                      </span>
                    </div>

                    {/* Mini sparkline */}
                    {sparklineData.length > 0 && (
                      <div className="h-20 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={sparklineData}>
                            <XAxis dataKey="arc" hide />
                            <YAxis hide domain={[0, maxCount]} />
                            <Tooltip
                              contentStyle={{
                                backgroundColor: '#000000dd',
                                border: '1px solid #a855f7',
                                borderRadius: '4px',
                                padding: '4px 8px',
                              }}
                              labelStyle={{ color: '#ffffff' }}
                              formatter={(value: number) => [`${value} appearances`, '']}
                            />
                            <Line
                              type="monotone"
                              dataKey="count"
                              stroke="#a855f7"
                              strokeWidth={2}
                              dot={{ r: 2, fill: '#a855f7' }}
                            />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    )}

                    {/* Arc list */}
                    <div className="space-y-1">
                      {item.arcs.slice(0, 3).map((arc) => (
                        <div
                          key={arc.arcName}
                          className="flex items-center justify-between text-xs"
                        >
                          <span className="text-white/70 truncate flex-1" title={arc.arcName}>
                            {arc.arcName}
                          </span>
                          <span className="text-purple-400 font-medium ml-2">
                            {arc.count}
                          </span>
                        </div>
                      ))}
                      {item.arcs.length > 3 && (
                        <div className="text-xs text-white/40">
                          +{item.arcs.length - 3} more
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
};

