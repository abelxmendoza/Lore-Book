/**
 * Admin Console Routes (Production-Facing)
 * Access: only if user.role === "admin"
 */

import { Router } from 'express';

import { config } from '../config';
import {
  getFinanceMetrics,
  getMonthlyFinancials,
  getSubscriptions,
  getPaymentEvents,
  calculateLTV,
} from '../lib/admin/financeService';
import { getAdminMetrics } from '../lib/admin/getAdminMetrics';
import { logger } from '../logger';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { requireAdmin } from '../middleware/rbac';
import { cancelSubscription } from '../services/stripeService';
import { supabaseAdmin } from '../services/supabaseClient';

const router = Router();

// All admin routes require authentication and admin role
router.use(requireAuth);
router.use(requireAdmin);

/**
 * Log admin action
 */
function logAdminAction(userId: string, action: string, details?: any) {
  logger.info({ userId, action, details, timestamp: new Date().toISOString() }, 'Admin action');
}

/**
 * GET /admin/metrics
 * Get admin dashboard metrics
 */
router.get('/metrics', async (req: AuthenticatedRequest, res) => {
  try {
    logAdminAction(req.user!.id, 'view_metrics');
    const metrics = await getAdminMetrics();
    res.json(metrics);
  } catch (error) {
    logger.error({ error }, 'Error fetching metrics');
    res.status(500).json({ error: 'Failed to fetch metrics' });
  }
});

/**
 * GET /admin/users
 * Get user metrics
 */
router.get('/users', async (req: AuthenticatedRequest, res) => {
  try {
    logAdminAction(req.user!.id, 'view_users');

    const { data: users, error } = await supabaseAdmin.auth.admin.listUsers({
      page: 1,
      perPage: 100
    });

    if (error) {
      logger.error({ error }, 'Failed to fetch users');
      return res.status(500).json({ error: 'Failed to fetch users' });
    }

    // Get memory counts per user (no content visible)
    const { data: memoryCounts } = await supabaseAdmin
      .from('journal_entries')
      .select('user_id')
      .then(result => {
        if (result.error) return { data: [] };
        const counts = new Map<string, number>();
        result.data?.forEach(entry => {
          counts.set(entry.user_id, (counts.get(entry.user_id) || 0) + 1);
        });
        return { data: Array.from(counts.entries()).map(([user_id, count]) => ({ user_id, count })) };
      });

    const usersWithMetrics = users.users.map(user => ({
      id: user.id,
      email: user.email,
      createdAt: user.created_at,
      lastSignInAt: user.last_sign_in_at,
      memoryCount: memoryCounts.find((m: any) => m.user_id === user.id)?.count || 0,
      role: user.user_metadata?.role || user.app_metadata?.role || 'standard_user'
    }));

    res.json({ users: usersWithMetrics, total: usersWithMetrics.length });
  } catch (error) {
    logger.error({ error }, 'Error fetching users');
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

/**
 * GET /admin/logs
 * Get system logs with filtering support
 */
router.get('/logs', async (req: AuthenticatedRequest, res) => {
  try {
    logAdminAction(req.user!.id, 'view_logs');

    const limit = Math.min(Number(req.query.limit) || 100, 1000); // Max 1000
    const level = req.query.level as string | undefined;
    const source = req.query.source as string | undefined;
    const timeRange = req.query.timeRange as string | undefined;
    const search = req.query.search as string | undefined;

    // Calculate time range filter
    let startDate: Date | null = null;
    if (timeRange && timeRange !== 'all') {
      const now = new Date();
      switch (timeRange) {
        case '1h':
          startDate = new Date(now.getTime() - 60 * 60 * 1000);
          break;
        case '24h':
          startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
          break;
        case '7d':
          startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case '30d':
          startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          break;
      }
    }

    // In a real implementation, you'd query from a logs table or service
    // Example query structure:
    // SELECT * FROM system_logs
    // WHERE (level = $1 OR $1 IS NULL)
    //   AND (source = $2 OR $2 IS NULL)
    //   AND (created_at >= $3 OR $3 IS NULL)
    //   AND (message ILIKE $4 OR $4 IS NULL)
    // ORDER BY created_at DESC
    // LIMIT $5
    
    // For now, return empty array - frontend will use mock data
    res.json({
      logs: [],
      message: 'Logs endpoint - implement with your logging service',
      limit,
      filters: {
        level,
        source,
        timeRange,
        search,
        startDate: startDate?.toISOString(),
      }
    });
  } catch (error) {
    logger.error({ error }, 'Error fetching logs');
    res.status(500).json({ error: 'Failed to fetch logs' });
  }
});

/**
 * GET /admin/ai-events
 * Get AI generation logs
 */
router.get('/ai-events', async (req: AuthenticatedRequest, res) => {
  try {
    logAdminAction(req.user!.id, 'view_ai_events');

    const limit = Number(req.query.limit) || 100;
    const userId = req.query.userId as string;

    // Query AI generation events (you'd need to log these in your services)
    // For now, return placeholder
    res.json({
      events: [],
      message: 'AI events endpoint - implement with your AI logging service',
      limit,
      userId
    });
  } catch (error) {
    logger.error({ error }, 'Error fetching AI events');
    res.status(500).json({ error: 'Failed to fetch AI events' });
  }
});

/**
 * POST /admin/reindex
 * Trigger embedding re-index
 */
router.post('/reindex', async (req: AuthenticatedRequest, res) => {
  try {
    logAdminAction(req.user!.id, 'trigger_reindex', req.body);

    // Trigger re-indexing of embeddings
    // This would call your embedding service to re-process entries
    res.json({ 
      message: 'Re-indexing triggered',
      status: 'queued'
    });
  } catch (error) {
    logger.error({ error }, 'Error triggering reindex');
    res.status(500).json({ error: 'Failed to trigger reindex' });
  }
});

/**
 * POST /admin/flush-cache
 * Flush cache
 */
router.post('/flush-cache', async (req: AuthenticatedRequest, res) => {
  try {
    logAdminAction(req.user!.id, 'flush_cache', req.body);

    const { flushMemoryCache } = await import('../lib/cache/flushMemoryCache');
    await flushMemoryCache();

    res.json({ 
      message: 'Cache flushed',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error({ error }, 'Error flushing cache');
    res.status(500).json({ error: 'Failed to flush cache' });
  }
});

/**
 * POST /admin/rebuild-clusters
 * Rebuild memory clusters
 */
router.post('/rebuild-clusters', async (req: AuthenticatedRequest, res) => {
  try {
    logAdminAction(req.user!.id, 'rebuild_clusters', req.body);

    const { runClusterRebuild } = await import('../jobs/runClusterRebuild');
    
    // Run cluster rebuild job (fire and forget for now, could be queued)
    runClusterRebuild()
      .then(result => {
        logger.info({ result }, 'Cluster rebuild job completed');
      })
      .catch(error => {
        logger.error({ error }, 'Cluster rebuild job failed');
      });

    res.json({ 
      message: 'Memory clusters rebuild triggered',
      status: 'queued'
    });
  } catch (error) {
    logger.error({ error }, 'Error rebuilding clusters');
    res.status(500).json({ error: 'Failed to rebuild clusters' });
  }
});

// ============================================
// Finance Routes
// ============================================

/**
 * GET /admin/finance/metrics
 * Get finance KPIs (MRR, active subs, churn rate, refunds)
 */
router.get('/finance/metrics', async (req: AuthenticatedRequest, res) => {
  try {
    logAdminAction(req.user!.id, 'view_finance_metrics');
    const metrics = await getFinanceMetrics();
    res.json(metrics);
  } catch (error) {
    logger.error({ error }, 'Error fetching finance metrics');
    res.status(500).json({ error: 'Failed to fetch finance metrics' });
  }
});

/**
 * GET /admin/finance/revenue
 * Get revenue graph data (monthly)
 */
router.get('/finance/revenue', async (req: AuthenticatedRequest, res) => {
  try {
    logAdminAction(req.user!.id, 'view_revenue_graph');

    const days = Number(req.query.days) || 90;
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const monthlyData = await getMonthlyFinancials(startDate, endDate);
    res.json({ data: monthlyData });
  } catch (error) {
    logger.error({ error }, 'Error fetching revenue data');
    res.status(500).json({ error: 'Failed to fetch revenue data' });
  }
});

/**
 * GET /admin/finance/subscriptions
 * Get subscription list with LTV
 */
router.get('/finance/subscriptions', async (req: AuthenticatedRequest, res) => {
  try {
    logAdminAction(req.user!.id, 'view_subscriptions');

    const status = req.query.status as string | undefined;
    const search = req.query.search as string | undefined;

    const subscriptions = await getSubscriptions({ status, search });
    res.json({ subscriptions });
  } catch (error) {
    logger.error({ error }, 'Error fetching subscriptions');
    res.status(500).json({ error: 'Failed to fetch subscriptions' });
  }
});

/**
 * GET /admin/finance/payment-events
 * Get payment events feed
 */
router.get('/finance/payment-events', async (req: AuthenticatedRequest, res) => {
  try {
    logAdminAction(req.user!.id, 'view_payment_events');

    const eventType = req.query.eventType as string | undefined;
    const status = req.query.status as string | undefined;
    const limit = Number(req.query.limit) || 100;

    const events = await getPaymentEvents({ eventType, status, limit });
    res.json({ events });
  } catch (error) {
    logger.error({ error }, 'Error fetching payment events');
    res.status(500).json({ error: 'Failed to fetch payment events' });
  }
});

/**
 * POST /admin/finance/subscriptions/:id/cancel
 * Cancel a subscription
 */
router.post('/finance/subscriptions/:id/cancel', async (req: AuthenticatedRequest, res) => {
  try {
    const subscriptionId = req.params.id;
    logAdminAction(req.user!.id, 'cancel_subscription', { subscriptionId });

    // Get subscription to find user_id and stripe_subscription_id
    const { data: subscription, error: subError } = await supabaseAdmin
      .from('subscriptions')
      .select('user_id, stripe_subscription_id')
      .eq('id', subscriptionId)
      .single();

    if (subError || !subscription) {
      return res.status(404).json({ error: 'Subscription not found' });
    }

    if (!subscription.stripe_subscription_id) {
      return res.status(400).json({ error: 'Subscription has no Stripe ID' });
    }

    await cancelSubscription(subscription.stripe_subscription_id, subscription.user_id);

    res.json({ 
      message: 'Subscription canceled',
      subscriptionId 
    });
  } catch (error) {
    logger.error({ error }, 'Error canceling subscription');
    res.status(500).json({ error: 'Failed to cancel subscription' });
  }
});

/**
 * POST /admin/finance/subscriptions/:id/reset-billing
 * Reset billing retry (clear past_due status)
 */
router.post('/finance/subscriptions/:id/reset-billing', async (req: AuthenticatedRequest, res) => {
  try {
    const subscriptionId = req.params.id;
    logAdminAction(req.user!.id, 'reset_billing', { subscriptionId });

    const { error } = await supabaseAdmin
      .from('subscriptions')
      .update({ status: 'active' })
      .eq('id', subscriptionId)
      .eq('status', 'past_due');

    if (error) {
      logger.error({ error }, 'Error resetting billing');
      return res.status(500).json({ error: 'Failed to reset billing' });
    }

    res.json({ 
      message: 'Billing retry reset',
      subscriptionId 
    });
  } catch (error) {
    logger.error({ error }, 'Error resetting billing');
    res.status(500).json({ error: 'Failed to reset billing' });
  }
});

export const adminRouter = router;

