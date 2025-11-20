import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { TrendingUp, TrendingDown, Minus, Activity } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip } from 'recharts';

interface Forecast {
  character: string;
  trend: 'warming' | 'cooling' | 'stable' | 'volatile';
  confidence: number;
}

interface RelationshipForecastCardProps {
  forecast: Forecast[];
}

const TREND_CONFIG: Record<string, { icon: React.ComponentType<{ className?: string }>; color: string; label: string }> = {
  warming: {
    icon: TrendingUp,
    color: 'text-green-400',
    label: 'Warming',
  },
  cooling: {
    icon: TrendingDown,
    color: 'text-red-400',
    label: 'Cooling',
  },
  stable: {
    icon: Minus,
    color: 'text-blue-400',
    label: 'Stable',
  },
  volatile: {
    icon: Activity,
    color: 'text-orange-400',
    label: 'Volatile',
  },
};

// Generate mock sparkline data for visualization
const generateSparklineData = (trend: string): number[] => {
  const data: number[] = [];
  const base = 0.5;
  for (let i = 0; i < 10; i++) {
    if (trend === 'warming') {
      data.push(base + (i / 10) * 0.3 + (Math.random() - 0.5) * 0.1);
    } else if (trend === 'cooling') {
      data.push(base - (i / 10) * 0.3 + (Math.random() - 0.5) * 0.1);
    } else if (trend === 'volatile') {
      data.push(base + (Math.random() - 0.5) * 0.6);
    } else {
      data.push(base + (Math.random() - 0.5) * 0.2);
    }
  }
  return data;
};

export const RelationshipForecastCard = ({ forecast }: RelationshipForecastCardProps) => {
  if (!forecast || forecast.length === 0) {
    return (
      <Card className="bg-black/40 border-border/60">
        <CardHeader>
          <CardTitle className="text-white">Relationship Forecast</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-64 flex items-center justify-center text-white/40">
            No forecast data available
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-black/40 border-border/60">
      <CardHeader>
        <CardTitle className="text-white">Relationship Forecast</CardTitle>
        <CardDescription className="text-white/60">
          Predicted trends and confidence levels for your relationships
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {forecast.map((item) => {
            const config = TREND_CONFIG[item.trend] || TREND_CONFIG.stable;
            const Icon = config.icon;
            const sparklineData = generateSparklineData(item.trend).map((value, index) => ({
              index,
              value,
            }));

            return (
              <Card
                key={item.character}
                className="bg-black/60 border-border/60 hover:border-primary/50 transition-colors"
              >
                <CardContent className="p-4">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h4 className="font-semibold text-white">{item.character}</h4>
                      <div className={`flex items-center gap-1 ${config.color}`}>
                        <Icon className="h-4 w-4" />
                        <span className="text-sm font-medium">{config.label}</span>
                      </div>
                    </div>

                    {/* Mini sparkline */}
                    <div className="h-16 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={sparklineData}>
                          <XAxis dataKey="index" hide />
                          <YAxis hide domain={[0, 1]} />
                          <Tooltip
                            contentStyle={{
                              backgroundColor: '#000000dd',
                              border: '1px solid #a855f7',
                              borderRadius: '4px',
                              padding: '4px 8px',
                            }}
                            labelStyle={{ color: '#ffffff' }}
                          />
                          <Line
                            type="monotone"
                            dataKey="value"
                            stroke={
                              item.trend === 'warming' ? '#10b981' :
                              item.trend === 'cooling' ? '#ef4444' :
                              item.trend === 'volatile' ? '#f59e0b' :
                              '#3b82f6'
                            }
                            strokeWidth={2}
                            dot={false}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>

                    {/* Confidence */}
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-white/60">Confidence</span>
                      <span className={`font-semibold ${config.color}`}>
                        {item.confidence}%
                      </span>
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

