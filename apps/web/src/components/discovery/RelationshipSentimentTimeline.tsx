import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';

interface SentimentTimelinePoint {
  date: string;
  sentiment: number;
  emotion: string;
}

interface SentimentTimelineData {
  character: string;
  timeline: SentimentTimelinePoint[];
}

interface RelationshipSentimentTimelineProps {
  data: SentimentTimelineData[];
}

const COLORS = [
  '#a855f7', // purple
  '#ec4899', // fuchsia
  '#06b6d4', // cyan
  '#10b981', // emerald
  '#f59e0b', // amber
  '#ef4444', // red
  '#3b82f6', // blue
  '#8b5cf6', // violet
];

export const RelationshipSentimentTimeline = ({ data }: RelationshipSentimentTimelineProps) => {
  if (!data || data.length === 0) {
    return (
      <Card className="bg-black/40 border-border/60">
        <CardHeader>
          <CardTitle className="text-white">Emotional Sentiment Timeline</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-64 flex items-center justify-center text-white/40">
            No sentiment timeline data available
          </div>
        </CardContent>
      </Card>
    );
  }

  // Transform data for Recharts: combine all timelines into a single dataset
  const dateSet = new Set<string>();
  for (const item of data) {
    if (item.timeline && Array.isArray(item.timeline)) {
      for (const point of item.timeline) {
        dateSet.add(point.date);
      }
    }
  }
  const sortedDates = Array.from(dateSet).sort();

  // Create chart data with one entry per date
  const chartData = sortedDates.map(date => {
    const entry: Record<string, any> = { date };
    for (const item of data) {
      if (item.timeline && Array.isArray(item.timeline)) {
        const point = item.timeline.find(p => p.date === date);
        if (point) {
          entry[item.character] = point.sentiment;
        }
      }
    }
    return entry;
  });

  return (
    <Card className="bg-black/40 border-border/60">
      <CardHeader>
        <CardTitle className="text-white">Emotional Sentiment Timeline</CardTitle>
        <CardDescription className="text-white/60">
          Sentiment trends over time for each relationship
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={400}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" />
            <XAxis 
              dataKey="date" 
              stroke="#ffffff60"
              tick={{ fill: '#ffffff60', fontSize: 12 }}
              angle={-45}
              textAnchor="end"
              height={80}
            />
            <YAxis 
              stroke="#ffffff60"
              tick={{ fill: '#ffffff60' }}
              domain={[-1, 1]}
            />
            <Tooltip 
              contentStyle={{ 
                backgroundColor: '#000000dd', 
                border: '1px solid #a855f7',
                borderRadius: '8px',
                color: '#ffffff'
              }}
            />
            <Legend wrapperStyle={{ color: '#ffffff80' }} />
            {data.map((item, index) => (
              <Line 
                key={item.character}
                type="monotone" 
                dataKey={item.character} 
                stroke={COLORS[index % COLORS.length]}
                strokeWidth={2}
                dot={{ r: 3 }}
                name={item.character}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
};

