// =====================================================
// FAMILY TREE ROUTES
// =====================================================

import { Router } from 'express';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { logger } from '../logger';
import { familyTreeService } from '../services/familyTreeService';
import { characterTimelineBuilder } from '../services/conversationCentered/characterTimelineBuilder';

const router = Router();

// GET /api/family-trees/mine — user's personal family
router.get('/mine', requireAuth, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  try {
    const tree = await familyTreeService.getUserFamilyTree(userId);
    res.json({ success: true, tree: tree ?? { members: [], branches: [], self_id: '' } });
  } catch (error) {
    logger.error({ error, userId }, 'Failed to get user family tree');
    res.status(500).json({ success: false, error: 'Failed to load family tree' });
  }
});

// GET /api/family-trees/character/:id
router.get('/character/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const characterId = String(req.params.id);
  try {
    const tree = await familyTreeService.getCharacterFamilyTree(userId, characterId);
    res.json({ success: true, tree: tree ?? { members: [], branches: [], self_id: characterId } });
  } catch (error) {
    logger.error({ error, userId, characterId }, 'Failed to get character family tree');
    res.status(500).json({ success: false, error: 'Failed to load family tree' });
  }
});

// POST /api/family-trees/character/:id/rebuild — re-scan conversations for kinship
router.post('/character/:id/rebuild', requireAuth, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const characterId = String(req.params.id);
  try {
    await characterTimelineBuilder.rebuildTimelinesForCharacter(userId, characterId);
    const tree = await familyTreeService.getCharacterFamilyTree(userId, characterId, { rebuild: true });
    res.json({ success: true, tree: tree ?? { members: [], branches: [], self_id: characterId } });
  } catch (error) {
    logger.error({ error, userId, characterId }, 'Failed to rebuild family tree');
    res.status(500).json({ success: false, error: 'Failed to rebuild family tree' });
  }
});

// GET /api/family-trees/organization/:id
router.get('/organization/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const organizationId = String(req.params.id);
  try {
    const tree = await familyTreeService.getOrganizationFamilyTree(userId, organizationId);
    res.json({ success: true, tree: tree ?? { members: [], branches: [], self_id: '' } });
  } catch (error) {
    logger.error({ error, userId, organizationId }, 'Failed to get organization family tree');
    res.status(500).json({ success: false, error: 'Failed to load family tree' });
  }
});

// GET /api/family-trees/character/:id/affiliations — all groups this person belongs to
router.get('/character/:id/affiliations', requireAuth, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const characterId = String(req.params.id);
  const name = typeof req.query.name === 'string' ? req.query.name : undefined;
  try {
    const organizations = await familyTreeService.getCharacterAffiliations(userId, characterId, name);
    res.json({ success: true, organizations });
  } catch (error) {
    logger.error({ error, userId, characterId }, 'Failed to get character affiliations');
    res.status(500).json({ success: false, error: 'Failed to load affiliations' });
  }
});

// GET /api/family-trees/organization/:id/member-affiliations — batch other-group badges for roster
router.get('/organization/:id/member-affiliations', requireAuth, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const organizationId = String(req.params.id);
  try {
    const affiliations = await familyTreeService.getMemberAffiliationsForOrganization(userId, organizationId);
    res.json({ success: true, affiliations });
  } catch (error) {
    logger.error({ error, userId, organizationId }, 'Failed to get member affiliations');
    res.status(500).json({ success: false, error: 'Failed to load member affiliations' });
  }
});

export default router;
