/**
 * Payment Events Feed Component
 * Stream-style feed of payment events with filters and auto-refresh
 */

import { useState, useEffect, useRef } from 'react';
import { fetchJson } from '../../lib/api';
import { RefreshCw, AlertTriangle } from 'lucide-react';
import { generateMockPaymentEvents } from '../../lib/mockData';
import { useMockData } from '../../contexts/MockDataContext';

interface PaymentEvent {
  id: string;
  userId: string;
  email: string;
  timestamp: string;
  eventType: string;
  amount: number;
  currency: string;
  status: string;
  invoiceId: string | null;
  metadata: Record<string, any>;
}

export const PaymentEventsFeed = () => {
  const { useMockData: isMockDataEnabled } = useMockData();
  const [events, setEvents] = useState<PaymentEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [eventTypeFilter, setEventTypeFilter] = useState<string>('all');
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    loadEvents();

    if (autoRefresh) {
      intervalRef.current = setInterval(() => {
        loadEvents();
      }, 5000); // Refresh every 5 seconds
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [autoRefresh, eventTypeFilter, isMockDataEnabled]);

  const loadEvents = async () => {
    try {
      setError(null);
      const params = new URLSearchParams();
      if (eventTypeFilter !== 'all') {
        params.append('eventType', eventTypeFilter);
      }
      params.append('limit', '50');

      const response = await fetchJson<{ events: PaymentEvent[] }>(
        `/api/admin/finance/payment-events?${params.toString()}`
      );
      if (response.events && response.events.length > 0 && !isMockDataEnabled) {
        setEvents(response.events);
      } else if (isMockDataEnabled) {
        // Use mock data if toggle is enabled
        const mockData = generateMockPaymentEvents(25);
        setEvents(mockData);
      } else {
        setEvents(response.events || []);
      }
    } catch (err: any) {
      // Use mock data on error only if toggle is enabled
      if (isMockDataEnabled) {
        const mockData = generateMockPaymentEvents(25);
        setEvents(mockData);
      } else {
        setEvents([]);
        setError(err.message || 'Failed to load payment events');
      }
      console.error('Payment events load error:', err);
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string, eventType: string) => {
    if (status === 'succeeded' || eventType === 'payment_succeeded') {
      return 'bg-green-500/20 border-green-500/50 text-green-400';
    }
    if (status === 'failed' || eventType === 'payment_failed') {
      return 'bg-red-500/20 border-red-500/50 text-red-400';
    }
    if (status === 'pending' || status === 'refunded' || eventType === 'refund') {
      return 'bg-yellow-500/20 border-yellow-500/50 text-yellow-400';
    }
    return 'bg-white/5 border-white/10 text-white/60';
  };

  const formatCurrency = (amount: number, currency: string = 'usd') => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency.toUpperCase(),
    }).format(amount);
  };

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatEventType = (eventType: string) => {
    return eventType
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  const eventTypes = ['all', 'payment_succeeded', 'payment_failed', 'refund', 'subscription_created', 'subscription_deleted'];

  if (loading && events.length === 0) {
    return (
      <div className="rounded-lg border border-border/60 bg-black/40 p-6">
        <div className="text-white/60">Loading payment events...</div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border/60 bg-black/40 p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h3 className="text-lg font-semibold text-white">Payment Events</h3>
          {isMockDataEnabled && (
            <span className="px-2 py-0.5 text-xs font-medium bg-yellow-500/20 text-yellow-400 rounded border border-yellow-500/30">
              Demo Data
            </span>
          )}
        </div>
        <div className="flex items-center gap-4">
          <select
            value={eventTypeFilter}
            onChange={(e) => setEventTypeFilter(e.target.value)}
            className="px-3 py-1.5 bg-black/40 border border-border/60 rounded-lg text-white text-sm focus:outline-none focus:border-primary/50"
          >
            {eventTypes.map((type) => (
              <option key={type} value={type}>
                {type === 'all' ? 'All Events' : formatEventType(type)}
              </option>
            ))}
          </select>
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`px-3 py-1.5 rounded-lg text-sm transition-colors flex items-center gap-2 ${
              autoRefresh
                ? 'bg-primary/20 text-primary border border-primary/30'
                : 'bg-white/5 text-white/60 hover:bg-white/10 border border-transparent'
            }`}
          >
            <RefreshCw className={`h-4 w-4 ${autoRefresh ? 'animate-spin' : ''}`} />
            Auto-refresh
          </button>
          <button
            onClick={loadEvents}
            className="px-3 py-1.5 rounded-lg text-sm bg-white/5 text-white/60 hover:bg-white/10 border border-transparent transition-colors"
          >
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-lg bg-red-500/20 border border-red-500/50 p-3 text-red-400 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4" />
          {error}
        </div>
      )}

      <div className="space-y-2 max-h-96 overflow-y-auto">
        {events.length === 0 && !isMockDataEnabled ? (
          <div className="text-center py-8 text-white/50">
            No payment events found
          </div>
        ) : (
          events.map((event) => (
            <div
              key={event.id}
              className={`rounded-lg border p-3 ${getStatusColor(event.status, event.eventType)}`}
            >
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-1">
                    <span className="font-semibold">{formatEventType(event.eventType)}</span>
                    <span className="text-xs opacity-75">{formatTimestamp(event.timestamp)}</span>
                  </div>
                  <div className="text-sm opacity-90">
                    {event.email} • {formatCurrency(event.amount, event.currency)}
                  </div>
                  {event.invoiceId && (
                    <div className="text-xs opacity-60 mt-1">
                      Invoice: {event.invoiceId}
                    </div>
                  )}
                </div>
                <div className="text-xs opacity-75 capitalize">
                  {event.status}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

