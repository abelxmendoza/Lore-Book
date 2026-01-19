/**
 * Dev Console Routes (Development Only)
 * Visible only when API_ENV === "dev" OR user.id == ADMIN_ID
 */

import { Router } from 'express';

import { config } from '../config';
import { logger } from '../logger';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { requireDevAccess } from '../middleware/rbac';
import { supabaseAdmin } from '../services/supabaseClient';

const router = Router();

// All dev routes require dev access
router.use(requireAuth);
router.use(requireDevAccess);

/**
 * GET /dev/logs
 * Get real-time frontend + backend logs
 */
router.get('/logs', async (req: AuthenticatedRequest, res) => {
  try {
    const limit = Number(req.query.limit) || 200;
    const { tailLogs } = await import('../lib/dev/tailLogs');
    const logs = await tailLogs(limit);
    
    res.json({
      logs,
      limit,
      environment: config.apiEnv
    });
  } catch (error) {
    logger.error({ error }, 'Error fetching dev logs');
    res.status(500).json({ error: 'Failed to fetch logs' });
  }
});

/**
 * POST /dev/seed-db
 * Seed database with test data
 */
router.post('/seed-db', async (req: AuthenticatedRequest, res) => {
  try {
    if (config.apiEnv !== 'dev') {
      return res.status(403).json({ error: 'Seed DB only available in dev mode' });
    }

    logger.info({ userId: req.user!.id }, 'Seeding database with test data');

    const { seedDatabase } = await import('../lib/dev/seedDatabase');
    await seedDatabase();

    res.json({ 
      message: 'Database seeded with test data',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error({ error }, 'Error seeding database');
    res.status(500).json({ error: 'Failed to seed database' });
  }
});

/**
 * POST /dev/clear-db
 * Clear test data (dev-only)
 */
router.post('/clear-db', async (req: AuthenticatedRequest, res) => {
  try {
    if (config.apiEnv !== 'dev') {
      return res.status(403).json({ error: 'Clear DB only available in dev mode' });
    }

    logger.warn({ userId: req.user!.id }, 'Clearing test data from database');

    const { clearDatabase } = await import('../lib/dev/clearDatabase');
    await clearDatabase();

    res.json({ 
      message: 'Test data cleared',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error({ error }, 'Error clearing database');
    res.status(500).json({ error: 'Failed to clear database' });
  }
});

/**
 * POST /dev/preview-component
 * Preview component (for dev console)
 */
router.post('/preview-component', async (req: AuthenticatedRequest, res) => {
  try {
    const { componentName, props } = req.body;

    // Return component preview data
    res.json({
      component: componentName,
      props,
      preview: 'Component preview data',
      timestamp: new Date().toISOString()
    });
      } catch (error) {
    logger.error({ error }, 'Error previewing component');
    res.status(500).json({ error: 'Failed to preview component' });
  }
});

/**
 * POST /dev/toggle-flag
 * Toggle feature flag (dev only)
 */
router.post('/toggle-flag', async (req: AuthenticatedRequest, res) => {
  try {
    if (config.apiEnv !== 'dev') {
      return res.status(403).json({ error: 'Feature flag toggling only available in dev mode' });
    }

    const { flag, enabled } = req.body;

    const { toggleFlag } = await import('../lib/dev/toggleFlag');
    await toggleFlag(flag, enabled);

    res.json({
      flag,
      enabled,
      message: 'Feature flag updated (dev mode only)',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error({ error }, 'Error toggling feature flag');
    res.status(500).json({ error: 'Failed to toggle feature flag' });
  }
});

export const devRouter = router;
