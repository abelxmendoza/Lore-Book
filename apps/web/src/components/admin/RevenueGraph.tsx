/**
 * Revenue Graph Component
 * Displays MRR over time with time range toggles
 */

import { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { fetchJson } from '../../lib/api';
import { generateMockMonthlyFinancials } from '../../lib/mockData';

interface MonthlyFinancial {
  month: string;
  mrr: number;
  revenue: number;
  activeSubscriptions: number;
}

type TimeRange = '30d' | '90d' | '6m' | '12m' | 'all';

interface RevenueGraphProps {
  timeRange?: TimeRange;
}

export const RevenueGraph = ({ timeRange: initialTimeRange = '90d' }: RevenueGraphProps) => {
  const [timeRange, setTimeRange] = useState<TimeRange>(initialTimeRange);
  const [data, setData] = useState<MonthlyFinancial[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isMockData, setIsMockData] = useState(false);

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        setError(null);

        const days = timeRange === '30d' ? 30 
          : timeRange === '90d' ? 90
          : timeRange === '6m' ? 180
          : timeRange === '12m' ? 365
          : 365 * 2; // all time - last 2 years

        const response = await fetchJson<{ data: MonthlyFinancial[] }>(
          `/api/admin/finance/revenue?days=${days}`
        );
        if (response.data && response.data.length > 0) {
          setData(response.data);
          setIsMockData(false);
        } else {
          // Use mock data if API returns empty
          const mockData = generateMockMonthlyFinancials(
            timeRange === '30d' ? 1 : timeRange === '90d' ? 3 : timeRange === '6m' ? 6 : timeRange === '12m' ? 12 : 24
          );
          setData(mockData);
          setIsMockData(true);
        }
      } catch (err: any) {
        // Use mock data on error
        const mockData = generateMockMonthlyFinancials(
          timeRange === '30d' ? 1 : timeRange === '90d' ? 3 : timeRange === '6m' ? 6 : timeRange === '12m' ? 12 : 24
        );
        setData(mockData);
        setIsMockData(true);
        console.error('Revenue data load error, using mock data:', err);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [timeRange]);

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  };

  const formatCurrency = (value: number) => {
    return `$${value.toFixed(2)}`;
  };

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-black/90 border border-primary/30 rounded-lg p-3 shadow-lg">
          <p className="text-white/60 text-xs mb-1">{formatDate(data.month)}</p>
          <p className="text-primary font-semibold">
            MRR: {formatCurrency(data.mrr)}
          </p>
          <p className="text-cyan-400 text-sm">
            Revenue: {formatCurrency(data.revenue)}
          </p>
          <p className="text-white/60 text-xs mt-1">
            Active Subs: {data.activeSubscriptions}
          </p>
        </div>
      );
    }
    return null;
  };

  if (loading) {
    return (
      <div className="rounded-lg border border-border/60 bg-black/40 p-6 h-80 flex items-center justify-center">
        <div className="text-white/60">Loading revenue data...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-6 h-80 flex items-center justify-center">
        <div className="text-red-400">{error}</div>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="rounded-lg border border-border/60 bg-black/40 p-6 h-80 flex items-center justify-center">
        <div className="text-white/60">No revenue data available</div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border/60 bg-black/40 p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h3 className="text-lg font-semibold text-white">Revenue (MRR / Month)</h3>
          {isMockData && (
            <span className="px-2 py-0.5 text-xs font-medium bg-yellow-500/20 text-yellow-400 rounded border border-yellow-500/30">
              Demo Data
            </span>
          )}
        </div>
        <div className="flex gap-2">
          {(['30d', '90d', '6m', '12m', 'all'] as TimeRange[]).map((range) => (
            <button
              key={range}
              onClick={() => setTimeRange(range)}
              className={`px-3 py-1 text-xs rounded-lg transition-colors ${
                timeRange === range
                  ? 'bg-primary/20 text-primary border border-primary/30'
                  : 'bg-white/5 text-white/60 hover:bg-white/10 border border-transparent'
              }`}
            >
              {range === '30d' ? '30d' : range === '90d' ? '90d' : range === '6m' ? '6m' : range === '12m' ? '12m' : 'All'}
            </button>
          ))}
        </div>
      </div>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={data} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
          <XAxis
            dataKey="month"
            tickFormatter={formatDate}
            stroke="rgba(255,255,255,0.4)"
            tick={{ fill: 'rgba(255,255,255,0.6)', fontSize: 12 }}
          />
          <YAxis
            tickFormatter={(value) => `$${value}`}
            stroke="rgba(255,255,255,0.4)"
            tick={{ fill: 'rgba(255,255,255,0.6)', fontSize: 12 }}
          />
          <Tooltip content={<CustomTooltip />} />
          <Line
            type="monotone"
            dataKey="mrr"
            stroke="#8b5cf6"
            strokeWidth={2}
            dot={{ fill: '#8b5cf6', r: 4 }}
            activeDot={{ r: 6, fill: '#a78bfa' }}
          />
          <Line
            type="monotone"
            dataKey="revenue"
            stroke="#06b6d4"
            strokeWidth={2}
            dot={{ fill: '#06b6d4', r: 4 }}
            activeDot={{ r: 6, fill: '#22d3ee' }}
          />
        </LineChart>
      </ResponsiveContainer>
      <div className="flex gap-4 mt-4 text-xs text-white/60">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-primary"></div>
          <span>MRR</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-cyan-400"></div>
          <span>Revenue</span>
        </div>
      </div>
    </div>
  );
};

