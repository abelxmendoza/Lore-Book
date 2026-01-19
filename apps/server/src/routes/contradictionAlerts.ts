import { Router } from 'express';

import { logger } from '../logger';
import { contradictionAlertService } from '../services/contradictionAlertService';

const router = Router();

/**
 * GET /api/contradiction-alerts
 * Get all active (non-dismissed) alerts for user
 */
router.get('/', async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const limit = parseInt(req.query.limit as string) || 10;

    const alerts = await contradictionAlertService.getActiveAlerts(userId, limit);

    return res.json({ success: true, alerts, count: alerts.length });
  } catch (error) {
    logger.error({ error }, 'Failed to get contradiction alerts');
    return res.status(500).json({ error: 'Failed to get contradiction alerts' });
  }
});

/**
 * GET /api/contradiction-alerts/:alertId
 * Get a specific alert
 */
router.get('/:alertId', async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { alertId } = req.params;

    const alert = await contradictionAlertService.getActiveAlert(userId, alertId);

    if (!alert) {
      return res.status(404).json({ error: 'Alert not found' });
    }

    return res.json({ success: true, alert });
  } catch (error) {
    logger.error({ error }, 'Failed to get contradiction alert');
    return res.status(500).json({ error: 'Failed to get contradiction alert' });
  }
});

/**
 * POST /api/contradiction-alerts/:alertId/action
 * Handle user action on alert (REVIEW, ABANDON, DISMISS, NOT_NOW)
 */
router.post('/:alertId/action', async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { alertId } = req.params;
    const { action } = req.body;

    if (!['REVIEW', 'ABANDON', 'DISMISS', 'NOT_NOW'].includes(action)) {
      return res.status(400).json({ error: 'Invalid action' });
    }

    const success = await contradictionAlertService.handleUserAction(
      userId,
      alertId,
      action
    );

    if (!success) {
      return res.status(404).json({ error: 'Alert not found or action failed' });
    }

    return res.json({ success: true, message: 'Action processed' });
  } catch (error) {
    logger.error({ error }, 'Failed to handle alert action');
    return res.status(500).json({ error: 'Failed to handle alert action' });
  }
});

/**
 * POST /api/contradiction-alerts/check/:beliefUnitId
 * Manually trigger alert check for a belief
 */
router.post('/check/:beliefUnitId', async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { beliefUnitId } = req.params;

    const alert = await contradictionAlertService.createAlert(userId, beliefUnitId);

    if (!alert) {
      return res.json({ success: true, message: 'No alert needed', alert: null });
    }

    return res.json({ success: true, alert });
  } catch (error) {
    logger.error({ error }, 'Failed to check/create alert');
    return res.status(500).json({ error: 'Failed to check/create alert' });
  }
});

export default router;

