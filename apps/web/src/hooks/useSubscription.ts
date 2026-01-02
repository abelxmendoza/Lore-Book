import { useState, useEffect, useCallback } from 'react';
import { fetchJson } from '../lib/api';

export type SubscriptionStatus = 'trial' | 'active' | 'canceled' | 'past_due' | 'incomplete' | 'incomplete_expired' | 'free';
export type PlanType = 'free' | 'premium';

export interface UsageData {
  entryCount: number;
  aiRequestsCount: number;
  entryLimit: number;
  aiLimit: number;
  isPremium: boolean;
  isTrial: boolean;
}

export interface SubscriptionData {
  status: SubscriptionStatus;
  planType: PlanType;
  trialDaysRemaining: number;
  trialEndsAt: string | null;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  usage: UsageData;
}

export function useSubscription() {
  const [subscription, setSubscription] = useState<SubscriptionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSubscription = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchJson<SubscriptionData>('/api/subscription/status');
      setSubscription(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load subscription');
      console.error('Error fetching subscription:', err);
      // Set default free tier on error to prevent blocking
      setSubscription({
        status: 'free',
        planType: 'free',
        trialDaysRemaining: 0,
        trialEndsAt: null,
        currentPeriodStart: null,
        currentPeriodEnd: null,
        cancelAtPeriodEnd: false,
        usage: {
          entryCount: 0,
          aiRequestsCount: 0,
          entryLimit: 50,
          aiLimit: 100,
          isPremium: false,
          isTrial: false,
        },
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSubscription();
  }, [fetchSubscription]);

  const createSubscription = useCallback(async () => {
    try {
      const result = await fetchJson<{
        subscriptionId: string;
        clientSecret: string;
        status: string;
        trialEnd: string | null;
      }>('/api/subscription/create', {
        method: 'POST',
      });
      await fetchSubscription();
      return result;
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : 'Failed to create subscription');
    }
  }, [fetchSubscription]);

  const cancelSubscription = useCallback(async () => {
    try {
      await fetchJson('/api/subscription/cancel', {
        method: 'POST',
      });
      await fetchSubscription();
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : 'Failed to cancel subscription');
    }
  }, [fetchSubscription]);

  const reactivateSubscription = useCallback(async () => {
    try {
      await fetchJson('/api/subscription/reactivate', {
        method: 'POST',
      });
      await fetchSubscription();
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : 'Failed to reactivate subscription');
    }
  }, [fetchSubscription]);

  const getBillingPortalUrl = useCallback(async (returnUrl?: string) => {
    try {
      const params = returnUrl ? `?return_url=${encodeURIComponent(returnUrl)}` : '';
      const result = await fetchJson<{ url: string }>(`/api/subscription/billing-portal${params}`);
      return result.url;
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : 'Failed to get billing portal URL');
    }
  }, []);

  return {
    subscription,
    loading,
    error,
    refresh: fetchSubscription,
    createSubscription,
    cancelSubscription,
    reactivateSubscription,
    getBillingPortalUrl,
  };
}

