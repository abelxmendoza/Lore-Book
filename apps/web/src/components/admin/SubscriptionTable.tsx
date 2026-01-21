/**
 * Subscription Table Component
 * Displays subscriptions with LTV, sortable columns, and actions
 */

import { useState, useEffect, useMemo } from 'react';
import { fetchJson } from '../../lib/api';
import { AlertTriangle, X, RotateCcw } from 'lucide-react';
import { generateMockSubscriptions } from '../../lib/mockData';
import { useMockData } from '../../contexts/MockDataContext';

interface Subscription {
  id: string;
  userId: string;
  email: string;
  plan: string;
  amount: number;
  renewalDate: string | null;
  status: string;
  ltv: number;
  createdAt: string;
}

type SortField = 'email' | 'plan' | 'amount' | 'renewalDate' | 'status' | 'ltv';
type SortDirection = 'asc' | 'desc';

export const SubscriptionTable = () => {
  const { useMockData: isMockDataEnabled } = useMockData();
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [sortField, setSortField] = useState<SortField>('email');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    loadSubscriptions();
  }, [isMockDataEnabled]);

  const loadSubscriptions = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetchJson<{ subscriptions: Subscription[] }>(
        '/api/admin/finance/subscriptions'
      );
      if (response.subscriptions && response.subscriptions.length > 0 && !isMockDataEnabled) {
        setSubscriptions(response.subscriptions);
      } else if (isMockDataEnabled) {
        // Use mock data if toggle is enabled
        const mockData = generateMockSubscriptions(12);
        setSubscriptions(mockData);
      } else {
        setSubscriptions(response.subscriptions || []);
      }
    } catch (err: any) {
      // Use mock data on error only if toggle is enabled
      if (isMockDataEnabled) {
        const mockData = generateMockSubscriptions(12);
        setSubscriptions(mockData);
      } else {
        setSubscriptions([]);
        setError(err.message || 'Failed to load subscriptions');
      }
      console.error('Subscriptions load error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const handleCancel = async (subscriptionId: string) => {
    if (!confirm('Are you sure you want to cancel this subscription?')) {
      return;
    }

    try {
      setActionLoading(subscriptionId);
      await fetchJson(`/api/admin/finance/subscriptions/${subscriptionId}/cancel`, {
        method: 'POST',
      });
      await loadSubscriptions();
    } catch (err: any) {
      alert(err.message || 'Failed to cancel subscription');
    } finally {
      setActionLoading(null);
    }
  };

  const handleResetBilling = async (subscriptionId: string) => {
    if (!confirm('Reset billing retry for this subscription?')) {
      return;
    }

    try {
      setActionLoading(subscriptionId);
      await fetchJson(`/api/admin/finance/subscriptions/${subscriptionId}/reset-billing`, {
        method: 'POST',
      });
      await loadSubscriptions();
    } catch (err: any) {
      alert(err.message || 'Failed to reset billing');
    } finally {
      setActionLoading(null);
    }
  };

  const filteredAndSorted = useMemo(() => {
    let filtered = subscriptions;

    // Apply search filter
    if (search) {
      filtered = filtered.filter(
        sub => sub.email.toLowerCase().includes(search.toLowerCase())
      );
    }

    // Apply sorting
    filtered = [...filtered].sort((a, b) => {
      let aVal: any = a[sortField];
      let bVal: any = b[sortField];

      if (sortField === 'renewalDate') {
        aVal = aVal ? new Date(aVal).getTime() : 0;
        bVal = bVal ? new Date(bVal).getTime() : 0;
      }

      if (typeof aVal === 'string') {
        aVal = aVal.toLowerCase();
        bVal = bVal.toLowerCase();
      }

      if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });

    return filtered;
  }, [subscriptions, search, sortField, sortDirection]);

  const formatCurrency = (value: number) => {
    return `$${value.toFixed(2)}`;
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString();
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
      case 'trial':
        return 'text-green-400';
      case 'canceled':
        return 'text-red-400';
      case 'past_due':
        return 'text-yellow-400';
      default:
        return 'text-white/60';
    }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return null;
    return sortDirection === 'asc' ? '↑' : '↓';
  };

  if (loading) {
    return (
      <div className="rounded-lg border border-border/60 bg-black/40 p-6">
        <div className="text-white/60">Loading subscriptions...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-6">
        <div className="text-red-400 flex items-center gap-2">
          <AlertTriangle className="h-5 w-5" />
          {error}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border/60 bg-black/40 p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h3 className="text-lg font-semibold text-white">Subscriptions</h3>
          {isMockDataEnabled && (
            <span className="px-2 py-0.5 text-xs font-medium bg-yellow-500/20 text-yellow-400 rounded border border-yellow-500/30">
              Demo Data
            </span>
          )}
        </div>
        <input
          type="text"
          placeholder="Search by email..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="px-3 py-2 bg-black/40 border border-border/60 rounded-lg text-white text-sm focus:outline-none focus:border-primary/50"
        />
      </div>

      <div className="overflow-x-auto -mx-4 sm:mx-0">
        <div className="inline-block min-w-full align-middle">
          <table className="w-full text-xs sm:text-sm">
            <thead>
              <tr className="border-b border-purple-500/30">
                <th
                  className="text-left py-2 sm:py-3 px-2 sm:px-4 text-white/70 font-medium cursor-pointer hover:text-white whitespace-nowrap"
                  onClick={() => handleSort('email')}
                >
                  Email <SortIcon field="email" />
                </th>
                <th
                  className="text-left py-2 sm:py-3 px-2 sm:px-4 text-white/70 font-medium cursor-pointer hover:text-white whitespace-nowrap hidden sm:table-cell"
                  onClick={() => handleSort('plan')}
                >
                  Plan <SortIcon field="plan" />
                </th>
                <th
                  className="text-left py-2 sm:py-3 px-2 sm:px-4 text-white/70 font-medium cursor-pointer hover:text-white whitespace-nowrap"
                  onClick={() => handleSort('amount')}
                >
                  Amount <SortIcon field="amount" />
                </th>
                <th
                  className="text-left py-2 sm:py-3 px-2 sm:px-4 text-white/70 font-medium cursor-pointer hover:text-white whitespace-nowrap hidden md:table-cell"
                  onClick={() => handleSort('renewalDate')}
                >
                  Renews <SortIcon field="renewalDate" />
                </th>
                <th
                  className="text-left py-2 sm:py-3 px-2 sm:px-4 text-white/70 font-medium cursor-pointer hover:text-white whitespace-nowrap"
                  onClick={() => handleSort('status')}
                >
                  Status <SortIcon field="status" />
                </th>
                <th
                  className="text-left py-2 sm:py-3 px-2 sm:px-4 text-white/70 font-medium cursor-pointer hover:text-white whitespace-nowrap hidden lg:table-cell"
                  onClick={() => handleSort('ltv')}
                >
                  LTV <SortIcon field="ltv" />
                </th>
                <th className="text-left py-2 sm:py-3 px-2 sm:px-4 text-white/70 font-medium whitespace-nowrap">Actions</th>
              </tr>
            </thead>
          <tbody>
            {filteredAndSorted.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center py-8 text-white/50">
                  No subscriptions found
                </td>
              </tr>
            ) : (
              filteredAndSorted.map((sub) => (
                <tr
                  key={sub.id}
                  className="border-b border-purple-500/10 hover:bg-purple-500/5"
                >
                  <td className="py-2 sm:py-3 px-2 sm:px-4 text-white/80 text-xs sm:text-sm">{sub.email}</td>
                  <td className="py-2 sm:py-3 px-2 sm:px-4 text-white/80 capitalize text-xs sm:text-sm hidden sm:table-cell">{sub.plan}</td>
                  <td className="py-2 sm:py-3 px-2 sm:px-4 text-white/80 text-xs sm:text-sm">
                    {sub.amount > 0 ? formatCurrency(sub.amount) : 'Free'}
                  </td>
                  <td className="py-2 sm:py-3 px-2 sm:px-4 text-white/80 text-xs sm:text-sm hidden md:table-cell">
                    {formatDate(sub.renewalDate)}
                  </td>
                  <td className={`py-2 sm:py-3 px-2 sm:px-4 text-xs sm:text-sm ${getStatusColor(sub.status)}`}>
                    {sub.status}
                  </td>
                  <td className="py-2 sm:py-3 px-2 sm:px-4 text-white/80 text-xs sm:text-sm hidden lg:table-cell">
                    {formatCurrency(sub.ltv)}
                  </td>
                  <td className="py-2 sm:py-3 px-2 sm:px-4">
                    <div className="flex gap-1 sm:gap-2">
                      {sub.status === 'past_due' && (
                        <button
                          onClick={() => handleResetBilling(sub.id)}
                          disabled={actionLoading === sub.id}
                          className="p-1.5 rounded hover:bg-white/10 text-cyan-400 hover:text-cyan-300 disabled:opacity-50 min-h-[44px] min-w-[44px] flex items-center justify-center"
                          title="Reset billing retry"
                        >
                          <RotateCcw className="h-4 w-4" />
                        </button>
                      )}
                      {sub.status !== 'canceled' && (
                        <button
                          onClick={() => handleCancel(sub.id)}
                          disabled={actionLoading === sub.id}
                          className="p-1.5 rounded hover:bg-white/10 text-red-400 hover:text-red-300 disabled:opacity-50 min-h-[44px] min-w-[44px] flex items-center justify-center"
                          title="Cancel subscription"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  );
};

