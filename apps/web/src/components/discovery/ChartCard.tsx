import { 
  LineChart, 
  Line, 
  BarChart, 
  Bar, 
  PieChart, 
  Pie, 
  Cell, 
  AreaChart, 
  Area,
  ScatterChart,
  Scatter,
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer 
} from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import type { ReactElement } from 'react';

interface ChartCardProps {
  title: string;
  chartType: 'line' | 'bar' | 'scatter' | 'pie' | 'area';
  data: Array<Record<string, any>>;
  description?: string;
  xAxis?: string;
  yAxis?: string;
  series?: string[];
  customTooltip?: ReactElement;
  yAxisDomain?: [number, number];
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

export const ChartCard = ({ 
  title, 
  chartType, 
  data, 
  description,
  xAxis = 'x',
  yAxis = 'y',
  series = [],
  customTooltip,
  yAxisDomain
}: ChartCardProps) => {
  if (!data || data.length === 0) {
    return (
      <Card className="bg-black/40 border-border/60">
        <CardHeader>
          <CardTitle className="text-white">{title}</CardTitle>
          {description && <CardDescription className="text-white/60">{description}</CardDescription>}
        </CardHeader>
        <CardContent>
          <div className="h-64 flex items-center justify-center text-white/40">
            No data available
          </div>
        </CardContent>
      </Card>
    );
  }

  const renderChart = () => {
    switch (chartType) {
      case 'line':
        return (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" />
              <XAxis 
                dataKey={xAxis} 
                stroke="#ffffff60"
                tick={{ fill: '#ffffff60' }}
              />
              <YAxis 
                stroke="#ffffff60"
                tick={{ fill: '#ffffff60' }}
                domain={yAxisDomain || ['auto', 'auto']}
              />
              {customTooltip ? (
                <Tooltip content={customTooltip} />
              ) : (
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: '#000000dd', 
                    border: '1px solid #a855f7',
                    borderRadius: '8px',
                    color: '#ffffff'
                  }}
                />
              )}
              <Legend wrapperStyle={{ color: '#ffffff80' }} />
              {series.length > 0 ? (
                series.map((s, i) => (
                  <Line 
                    key={s}
                    type="monotone" 
                    dataKey={s} 
                    stroke={COLORS[i % COLORS.length]}
                    strokeWidth={2}
                  />
                ))
              ) : (
                <Line 
                  type="monotone" 
                  dataKey={yAxis} 
                  stroke={COLORS[0]}
                  strokeWidth={2}
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        );

      case 'bar':
        return (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" />
              <XAxis 
                dataKey={xAxis} 
                stroke="#ffffff60"
                tick={{ fill: '#ffffff60' }}
              />
              <YAxis 
                stroke="#ffffff60"
                tick={{ fill: '#ffffff60' }}
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
              {series.length > 0 ? (
                series.map((s, i) => (
                  <Bar 
                    key={s}
                    dataKey={s} 
                    fill={COLORS[i % COLORS.length]}
                  />
                ))
              ) : (
                <Bar dataKey={yAxis} fill={COLORS[0]} />
              )}
            </BarChart>
          </ResponsiveContainer>
        );

      case 'pie':
        const pieData = data.map((d, i) => ({
          name: d.name || d.label || `Item ${i + 1}`,
          value: d.value || d.y || 0
        }));
        return (
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                outerRadius={80}
                fill="#8884d8"
                dataKey="value"
              >
                {pieData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: '#000000dd', 
                  border: '1px solid #a855f7',
                  borderRadius: '8px',
                  color: '#ffffff'
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        );

      case 'area':
        return (
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" />
              <XAxis 
                dataKey={xAxis} 
                stroke="#ffffff60"
                tick={{ fill: '#ffffff60' }}
              />
              <YAxis 
                stroke="#ffffff60"
                tick={{ fill: '#ffffff60' }}
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
              {series.length > 0 ? (
                series.map((s, i) => (
                  <Area 
                    key={s}
                    type="monotone" 
                    dataKey={s} 
                    stroke={COLORS[i % COLORS.length]}
                    fill={COLORS[i % COLORS.length]}
                    fillOpacity={0.3}
                  />
                ))
              ) : (
                <Area 
                  type="monotone" 
                  dataKey={yAxis} 
                  stroke={COLORS[0]}
                  fill={COLORS[0]}
                  fillOpacity={0.3}
                />
              )}
            </AreaChart>
          </ResponsiveContainer>
        );

      case 'scatter':
        return (
          <ResponsiveContainer width="100%" height={300}>
            <ScatterChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" />
              <XAxis 
                dataKey={xAxis} 
                stroke="#ffffff60"
                tick={{ fill: '#ffffff60' }}
              />
              <YAxis 
                dataKey={yAxis}
                stroke="#ffffff60"
                tick={{ fill: '#ffffff60' }}
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
              {series.length > 0 ? (
                series.map((s, i) => (
                  <Scatter 
                    key={s}
                    name={s}
                    dataKey={s}
                    fill={COLORS[i % COLORS.length]}
                  />
                ))
              ) : (
                <Scatter 
                  dataKey={yAxis}
                  fill={COLORS[0]}
                />
              )}
            </ScatterChart>
          </ResponsiveContainer>
        );

      default:
        return (
          <div className="h-64 flex items-center justify-center text-white/40">
            Unsupported chart type: {chartType}
          </div>
        );
    }
  };

  return (
    <Card className="bg-black/40 border-border/60">
      <CardHeader>
        <CardTitle className="text-white">{title}</CardTitle>
        {description && <CardDescription className="text-white/60">{description}</CardDescription>}
      </CardHeader>
      <CardContent>
        {renderChart()}
      </CardContent>
    </Card>
  );
};

