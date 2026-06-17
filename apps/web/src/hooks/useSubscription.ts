import { useState, useEffect, useCallback } from 'react';
import { fetchJson } from '../lib/api';
import { supabase, useAuth } from '../lib/supabase';
import { canCallAuthenticatedApi } from '../lib/runtimeIdentity';
import type { AccountAuthority } from '../lib/accountAuthority';

export type SubscriptionStatus = 'trial' | 'active' | 'canceled' | 'past_due' | 'incomplete' | 'incomplete_expired' | 'free' | 'privileged';
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
  authority?: AccountAuthority;
}

const DEFAULT_FREE_SUBSCRIPTION: SubscriptionData = {
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
};

export function useSubscription() {
  const { user, loading: authLoading } = useAuth();
  const [subscription, setSubscription] = useState<SubscriptionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSubscription = useCallback(async () => {
    if (!canCallAuthenticatedApi()) {
      setSubscription(DEFAULT_FREE_SUBSCRIPTION);
      setError(null);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const data = await fetchJson<SubscriptionData>('/api/subscription/status');
      setSubscription(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load subscription');
      if (import.meta.env.DEV) {
        console.debug('Subscription unavailable:', err);
      }
      setSubscription(DEFAULT_FREE_SUBSCRIPTION);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setSubscription(DEFAULT_FREE_SUBSCRIPTION);
      setLoading(false);
      return;
    }
    void fetchSubscription();
  }, [authLoading, user, fetchSubscription]);

  const createSubscription = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session?.access_token) {
      throw new Error('Sign in required to start a subscription.');
    }

    try {
      const result = await fetchJson<{
        subscriptionId: string;
        clientSecret: string | null;
        intentType: 'payment' | 'setup' | null;
        status: string;
        trialEnd: string | null;
      }>('/api/subscription/create', {
        method: 'POST',
      });
      await fetchSubscription();
      return result;
    } catch (err) {
      if (err instanceof Error) {
        if (err.message.includes('billing_not_configured')) {
          throw new Error('Billing is not configured on this server. Add STRIPE_SECRET_KEY and SUBSCRIPTION_PRICE_ID.');
        }
        if (err.message.includes('billing_not_required')) {
          throw new Error('Your account already has full access — billing is not required.');
        }
        if (err.message.includes('checkout_unavailable')) {
          throw new Error('Checkout could not start. Verify your Stripe price ID is active.');
        }
      }
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

