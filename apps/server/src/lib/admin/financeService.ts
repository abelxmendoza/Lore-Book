/**
 * Finance Service
 * Handles finance-related queries for admin dashboard
 */

import { logger } from '../../logger';
import { supabaseAdmin } from '../../services/supabaseClient';

export interface FinanceMetrics {
  mrr: number; // Monthly Recurring Revenue in dollars
  activeSubscriptions: number;
  churnRate: number; // percentage
  refundsLast30Days: number; // in dollars
  totalRevenue: number; // in dollars
}

export interface MonthlyFinancial {
  month: string; // YYYY-MM-DD format
  mrr: number;
  revenue: number;
  activeSubscriptions: number;
  newSubscriptions: number;
  churnedSubscriptions: number;
  churnRate: number;
  refunds: number;
}

export interface SubscriptionWithLTV {
  id: string;
  userId: string;
  email: string;
  plan: string;
  amount: number; // monthly amount in dollars
  renewalDate: string | null;
  status: string;
  ltv: number; // lifetime value in dollars
  createdAt: string;
}

export interface PaymentEvent {
  id: string;
  userId: string;
  email: string;
  timestamp: string;
  eventType: string;
  amount: number; // in dollars
  currency: string;
  status: string;
  invoiceId: string | null;
  metadata: Record<string, any>;
}

/**
 * Get finance metrics (MRR, active subs, churn rate, refunds)
 */
export async function getFinanceMetrics(): Promise<FinanceMetrics> {
  try {
    // Get all active subscriptions (trial, active)
    const { data: subscriptions, error: subError } = await supabaseAdmin
      .from('subscriptions')
      .select('*')
      .in('status', ['trial', 'active']);

    if (subError) {
      logger.error({ error: subError }, 'Failed to fetch subscriptions for metrics');
    }

    // Calculate MRR (sum of all active subscription monthly prices)
    // Assuming premium plan is $15/month (1500 cents)
    const PREMIUM_MONTHLY_PRICE = 15.0; // dollars
    const activeSubs = subscriptions?.filter(
      sub => sub.status === 'active' || sub.status === 'trial'
    ) || [];
    const mrr = activeSubs.length * PREMIUM_MONTHLY_PRICE;

    // Calculate churn rate (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const { data: allSubs, error: allSubsError } = await supabaseAdmin
      .from('subscriptions')
      .select('status, updated_at, created_at');

    if (allSubsError) {
      logger.error({ error: allSubsError }, 'Failed to fetch all subscriptions for churn');
    }

    // Count subscriptions that were active 30 days ago and are now canceled
    const active30DaysAgo = allSubs?.filter(sub => {
      const createdAt = new Date(sub.created_at);
      const updatedAt = new Date(sub.updated_at);
      return createdAt <= thirtyDaysAgo && (sub.status === 'active' || sub.status === 'trial');
    }).length || 0;

    const churnedLast30Days = allSubs?.filter(sub => {
      const updatedAt = new Date(sub.updated_at);
      return updatedAt >= thirtyDaysAgo && sub.status === 'canceled';
    }).length || 0;

    const churnRate = active30DaysAgo > 0 
      ? (churnedLast30Days / active30DaysAgo) * 100 
      : 0;

    // Get refunds in last 30 days
    const { data: refunds, error: refundsError } = await supabaseAdmin
      .from('payment_events')
      .select('amount')
      .eq('event_type', 'refund')
      .eq('status', 'refunded')
      .gte('created_at', thirtyDaysAgo.toISOString());

    if (refundsError) {
      logger.error({ error: refundsError }, 'Failed to fetch refunds');
    }

    const refundsLast30Days = refunds?.reduce((sum, r) => sum + (r.amount || 0), 0) || 0;

    // Get total revenue (sum of all successful payments)
    const { data: payments, error: paymentsError } = await supabaseAdmin
      .from('payment_events')
      .select('amount')
      .eq('event_type', 'payment_succeeded')
      .eq('status', 'succeeded');

    if (paymentsError) {
      logger.error({ error: paymentsError }, 'Failed to fetch total revenue');
    }

    const totalRevenue = payments?.reduce((sum, p) => sum + (p.amount || 0), 0) || 0;

    return {
      mrr,
      activeSubscriptions: activeSubs.length,
      churnRate: Math.round(churnRate * 100) / 100, // Round to 2 decimal places
      refundsLast30Days: Math.round(refundsLast30Days * 100) / 100,
      totalRevenue: Math.round(totalRevenue * 100) / 100,
    };
  } catch (error) {
    logger.error({ error }, 'Error fetching finance metrics');
    throw error;
  }
}

/**
 * Get monthly financials for revenue graph
 */
export async function getMonthlyFinancials(
  startDate: Date,
  endDate: Date
): Promise<MonthlyFinancial[]> {
  try {
    // Try to get from precomputed monthly_financials table first
    const { data: monthlyData, error: monthlyError } = await supabaseAdmin
      .from('monthly_financials')
      .select('*')
      .gte('month', startDate.toISOString().split('T')[0])
      .lte('month', endDate.toISOString().split('T')[0])
      .order('month', { ascending: true });

    if (!monthlyError && monthlyData && monthlyData.length > 0) {
      return monthlyData.map(row => ({
        month: row.month,
        mrr: Number(row.mrr) || 0,
        revenue: Number(row.revenue) || 0,
        activeSubscriptions: row.active_subscriptions || 0,
        newSubscriptions: row.new_subscriptions || 0,
        churnedSubscriptions: row.churned_subscriptions || 0,
        churnRate: Number(row.churn_rate) || 0,
        refunds: Number(row.refunds) || 0,
      }));
    }

    // Fallback: compute from subscriptions and payment_events
    // This is a simplified version - in production you'd want to precompute this
    const months: MonthlyFinancial[] = [];
    const current = new Date(startDate);
    
    while (current <= endDate) {
      const monthStart = new Date(current.getFullYear(), current.getMonth(), 1);
      const monthEnd = new Date(current.getFullYear(), current.getMonth() + 1, 0);
      
      // Get subscriptions active at start of month
      const { data: subsAtStart } = await supabaseAdmin
        .from('subscriptions')
        .select('*')
        .or('status.eq.active,status.eq.trial')
        .lte('created_at', monthEnd.toISOString());

      const activeSubs = subsAtStart?.length || 0;
      const PREMIUM_MONTHLY_PRICE = 15.0;
      const mrr = activeSubs * PREMIUM_MONTHLY_PRICE;

      // Get revenue for this month
      const { data: payments } = await supabaseAdmin
        .from('payment_events')
        .select('amount')
        .eq('event_type', 'payment_succeeded')
        .eq('status', 'succeeded')
        .gte('created_at', monthStart.toISOString())
        .lte('created_at', monthEnd.toISOString());

      const revenue = payments?.reduce((sum, p) => sum + (p.amount || 0), 0) || 0;

      // Get new subscriptions this month
      const { data: newSubs } = await supabaseAdmin
        .from('subscriptions')
        .select('id')
        .gte('created_at', monthStart.toISOString())
        .lte('created_at', monthEnd.toISOString());

      const newSubscriptions = newSubs?.length || 0;

      // Get churned subscriptions this month
      const { data: churnedSubs } = await supabaseAdmin
        .from('subscriptions')
        .select('id')
        .eq('status', 'canceled')
        .gte('updated_at', monthStart.toISOString())
        .lte('updated_at', monthEnd.toISOString());

      const churnedSubscriptions = churnedSubs?.length || 0;
      const churnRate = activeSubs > 0 ? (churnedSubscriptions / activeSubs) * 100 : 0;

      // Get refunds this month
      const { data: refunds } = await supabaseAdmin
        .from('payment_events')
        .select('amount')
        .eq('event_type', 'refund')
        .gte('created_at', monthStart.toISOString())
        .lte('created_at', monthEnd.toISOString());

      const refundsAmount = refunds?.reduce((sum, r) => sum + (r.amount || 0), 0) || 0;

      months.push({
        month: monthStart.toISOString().split('T')[0],
        mrr: Math.round(mrr * 100) / 100,
        revenue: Math.round(revenue * 100) / 100,
        activeSubscriptions: activeSubs,
        newSubscriptions,
        churnedSubscriptions,
        churnRate: Math.round(churnRate * 100) / 100,
        refunds: Math.round(refundsAmount * 100) / 100,
      });

      current.setMonth(current.getMonth() + 1);
    }

    return months;
  } catch (error) {
    logger.error({ error }, 'Error fetching monthly financials');
    throw error;
  }
}

/**
 * Get subscriptions list with LTV
 */
export async function getSubscriptions(filters?: {
  status?: string;
  search?: string;
}): Promise<SubscriptionWithLTV[]> {
  try {
    let query = supabaseAdmin
      .from('subscriptions')
      .select('*');

    if (filters?.status) {
      query = query.eq('status', filters.status);
    }

    const { data: subscriptions, error } = await query;

    if (error) {
      logger.error({ error }, 'Failed to fetch subscriptions');
      throw error;
    }

    // Get user emails
    const userIds = subscriptions?.map(s => s.user_id) || [];
    const { data: usersData } = await supabaseAdmin.auth.admin.listUsers();
    const userMap = new Map(
      usersData?.users.map(u => [u.id, u.email || '']) || []
    );

    // Calculate LTV for each subscription
    const subscriptionsWithLTV: SubscriptionWithLTV[] = [];

    for (const sub of subscriptions || []) {
      const ltv = await calculateLTV(sub.user_id);
      const email = userMap.get(sub.user_id) || '';

      // Apply search filter if provided
      if (filters?.search && !email.toLowerCase().includes(filters.search.toLowerCase())) {
        continue;
      }

      const PREMIUM_MONTHLY_PRICE = 15.0;
      const amount = sub.plan_type === 'premium' ? PREMIUM_MONTHLY_PRICE : 0;

      subscriptionsWithLTV.push({
        id: sub.id,
        userId: sub.user_id,
        email,
        plan: sub.plan_type,
        amount,
        renewalDate: sub.current_period_end || null,
        status: sub.status,
        ltv: Math.round(ltv * 100) / 100,
        createdAt: sub.created_at,
      });
    }

    return subscriptionsWithLTV;
  } catch (error) {
    logger.error({ error }, 'Error fetching subscriptions');
    throw error;
  }
}

/**
 * Calculate lifetime value for a user
 */
export async function calculateLTV(userId: string): Promise<number> {
  try {
    // Sum all successful payments for this user
    const { data: payments, error } = await supabaseAdmin
      .from('payment_events')
      .select('amount')
      .eq('user_id', userId)
      .eq('event_type', 'payment_succeeded')
      .eq('status', 'succeeded');

    if (error) {
      logger.error({ error, userId }, 'Failed to calculate LTV');
      return 0;
    }

    const total = payments?.reduce((sum, p) => sum + (p.amount || 0), 0) || 0;
    return total;
  } catch (error) {
    logger.error({ error, userId }, 'Error calculating LTV');
    return 0;
  }
}

/**
 * Get payment events feed
 */
export async function getPaymentEvents(filters?: {
  eventType?: string;
  status?: string;
  limit?: number;
}): Promise<PaymentEvent[]> {
  try {
    let query = supabaseAdmin
      .from('payment_events')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(filters?.limit || 100);

    if (filters?.eventType) {
      query = query.eq('event_type', filters.eventType);
    }

    if (filters?.status) {
      query = query.eq('status', filters.status);
    }

    const { data: events, error } = await query;

    if (error) {
      logger.error({ error }, 'Failed to fetch payment events');
      throw error;
    }

    // Get user emails
    const userIds = [...new Set(events?.map(e => e.user_id) || [])];
    const { data: usersData } = await supabaseAdmin.auth.admin.listUsers();
    const userMap = new Map(
      usersData?.users.map(u => [u.id, u.email || '']) || []
    );

    return (events || []).map(event => ({
      id: event.id,
      userId: event.user_id,
      email: userMap.get(event.user_id) || '',
      timestamp: event.created_at,
      eventType: event.event_type,
      amount: Number(event.amount) || 0,
      currency: event.currency || 'usd',
      status: event.status,
      invoiceId: event.stripe_invoice_id || null,
      metadata: event.metadata || {},
    }));
  } catch (error) {
    logger.error({ error }, 'Error fetching payment events');
    throw error;
  }
}

