/**
 * LORE-KEEPER PRIVACY, SCOPE & MEMORY OWNERSHIP ENGINE
 * API Routes
 */

import { Router } from 'express';

import { logger } from '../logger';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { privacyScopeService } from '../services/privacyScopeService';

const router = Router();

/**
 * PATCH /api/privacy/scope
 * Update resource scope
 */
router.patch('/scope', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { resource_type, resource_id, scope_type } = req.body;

    if (!resource_type || !resource_id || !scope_type) {
      return res.status(400).json({ error: 'resource_type, resource_id, and scope_type are required' });
    }

    if (!['PRIVATE', 'SHARED', 'ANONYMOUS', 'ARCHIVED', 'DELETED'].includes(scope_type)) {
      return res.status(400).json({ error: 'Invalid scope_type' });
    }

    const scopedResource = await privacyScopeService.updateScope(
      req.user!.id,
      resource_type,
      resource_id,
      scope_type
    );

    res.json({ scoped_resource: scopedResource });
  } catch (error) {
    logger.error({ err: error }, 'Failed to update scope');
    res.status(500).json({ error: 'Failed to update scope' });
  }
});

/**
 * DELETE /api/privacy/resources/:resource_type/:resource_id
 * Delete resource (hard deletion)
 */
router.delete('/resources/:resource_type/:resource_id', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { resource_type, resource_id } = req.params;

    await privacyScopeService.deleteResource(
      req.user!.id,
      resource_type as any,
      resource_id
    );

    res.json({ success: true, message: 'Resource deleted permanently' });
  } catch (error) {
    logger.error({ err: error }, 'Failed to delete resource');
    res.status(500).json({ error: 'Failed to delete resource' });
  }
});

/**
 * POST /api/privacy/resources/:resource_type/:resource_id/archive
 * Archive resource (soft retention)
 */
router.post('/resources/:resource_type/:resource_id/archive', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { resource_type, resource_id } = req.params;

    const scopedResource = await privacyScopeService.archiveResource(
      req.user!.id,
      resource_type as any,
      resource_id
    );

    res.json({ scoped_resource: scopedResource });
  } catch (error) {
    logger.error({ err: error }, 'Failed to archive resource');
    res.status(500).json({ error: 'Failed to archive resource' });
  }
});

/**
 * GET /api/privacy/chat-visible
 * Get chat-visible state (enforces scope)
 */
router.get('/chat-visible', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const visibleState = await privacyScopeService.getChatVisibleState(req.user!.id);

    res.json({ visible_state: visibleState });
  } catch (error) {
    logger.error({ err: error }, 'Failed to get chat visible state');
    res.status(500).json({ error: 'Failed to get chat visible state' });
  }
});

/**
 * GET /api/privacy/export
 * Export user data
 */
router.get('/export', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const exportData = await privacyScopeService.exportUserData(req.user!.id);

    res.json(exportData);
  } catch (error) {
    logger.error({ err: error }, 'Failed to export user data');
    res.status(500).json({ error: 'Failed to export user data' });
  }
});

/**
 * GET /api/privacy/access/:resource_type/:resource_id
 * Check access to resource
 */
router.get('/access/:resource_type/:resource_id', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { resource_type, resource_id } = req.params;

    const accessResult = await privacyScopeService.canAccess(
      resource_type as any,
      resource_id,
      {
        user_id: req.user!.id,
      }
    );

    res.json(accessResult);
  } catch (error) {
    logger.error({ err: error }, 'Failed to check access');
    res.status(500).json({ error: 'Failed to check access' });
  }
});

export const privacyRouter = router;
