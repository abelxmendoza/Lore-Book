/**
 * Finance Dashboard Component
 * Main finance dashboard combining graph, cards, table, and feed
 */

import { useState, useEffect } from 'react';
import { fetchJson } from '../../lib/api';
import { RevenueGraph } from './RevenueGraph';
import { SubscriptionTable } from './SubscriptionTable';
import { PaymentEventsFeed } from './PaymentEventsFeed';
import { AdminCard } from './AdminCard';
import { DollarSign, Users, TrendingDown, AlertTriangle } from 'lucide-react';
import { generateMockFinanceMetrics } from '../../lib/mockData';
import { useMockData } from '../../contexts/MockDataContext';

interface FinanceMetrics {
  mrr: number;
  activeSubscriptions: number;
  churnRate: number;
  refundsLast30Days: number;
  totalRevenue: number;
}

export const FinanceDashboard = () => {
  const { useMockData: isMockDataEnabled } = useMockData();
  const [metrics, setMetrics] = useState<FinanceMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadMetrics();
  }, [isMockDataEnabled]);

  const loadMetrics = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchJson<FinanceMetrics>('/api/admin/finance/metrics');
      // Only use real data if toggle is off, or if we have data and toggle is on
      if (data && !isMockDataEnabled) {
        setMetrics(data);
      } else if (isMockDataEnabled) {
        // Use mock data if toggle is on
        const mockMetrics = generateMockFinanceMetrics();
        setMetrics(mockMetrics);
      } else {
        setMetrics(data);
      }
    } catch (err: any) {
      // Use mock data on error only if toggle is enabled
      if (isMockDataEnabled) {
        const mockMetrics = generateMockFinanceMetrics();
        setMetrics(mockMetrics);
      } else {
        setMetrics(null);
        setError(err.message || 'Failed to load finance metrics');
      }
      console.error('Finance metrics load error:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading && !metrics) {
    return (
      <div className="space-y-6">
        <div className="text-white/60">Loading finance dashboard...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {isMockDataEnabled && metrics && (
        <div className="rounded-lg bg-yellow-500/10 border border-yellow-500/30 p-3 text-yellow-400 flex items-center gap-2 text-sm">
          <AlertTriangle className="h-4 w-4" />
          Showing demo data - Mock data toggle is enabled
        </div>
      )}
      {error && !isMockData && (
        <div className="rounded-lg bg-red-500/20 border border-red-500/50 p-4 text-red-200 flex items-center gap-2">
          <AlertTriangle className="h-5 w-5" />
          {error}
        </div>
      )}

      {/* Revenue Graph */}
      <RevenueGraph />

      {/* KPI Cards */}
      {metrics && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <AdminCard
            title="MRR"
            value={`$${metrics.mrr.toFixed(2)}/mo`}
            icon={DollarSign}
            description="Monthly Recurring Revenue"
          />
          <AdminCard
            title="Active Subscriptions"
            value={metrics.activeSubscriptions}
            icon={Users}
            description="Currently active subscriptions"
          />
          <AdminCard
            title="Churn Rate"
            value={`${metrics.churnRate.toFixed(2)}%`}
            icon={TrendingDown}
            description="Last 30 days"
            trend={{
              value: metrics.churnRate,
              isPositive: false, // Lower churn is better
            }}
          />
          <AdminCard
            title="Refunds (30d)"
            value={`$${metrics.refundsLast30Days.toFixed(2)}`}
            icon={AlertTriangle}
            description="Refunds in last 30 days"
          />
        </div>
      )}

      {/* Subscription Table */}
      <SubscriptionTable />

      {/* Payment Events Feed */}
      <PaymentEventsFeed />
    </div>
  );
};

