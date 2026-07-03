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

// POST /api/family-trees/member/:characterId/exclude — remove from tree, keep the character
router.post('/member/:characterId/exclude', requireAuth, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const characterId = String(req.params.characterId);
  const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() || undefined : undefined;
  try {
    const ok = await familyTreeService.excludeMember(userId, characterId, reason);
    if (!ok) return res.status(404).json({ success: false, error: 'Family member not found or not removable' });
    res.json({ success: true });
  } catch (error) {
    logger.error({ error, userId, characterId }, 'Failed to exclude family member');
    res.status(500).json({ success: false, error: 'Failed to remove from family tree' });
  }
});

// POST /api/family-trees/member/:characterId/keep — confirm a flagged node is family
router.post('/member/:characterId/keep', requireAuth, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const characterId = String(req.params.characterId);
  try {
    const ok = await familyTreeService.keepMember(userId, characterId);
    if (!ok) return res.status(404).json({ success: false, error: 'Family member not found' });
    res.json({ success: true });
  } catch (error) {
    logger.error({ error, userId, characterId }, 'Failed to keep family member');
    res.status(500).json({ success: false, error: 'Failed to keep family member' });
  }
});

// DELETE /api/family-trees/member/:characterId — the node shouldn't be a character at all
router.delete('/member/:characterId', requireAuth, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const characterId = String(req.params.characterId);
  const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() || undefined : undefined;
  try {
    const ok = await familyTreeService.deleteMember(userId, characterId, reason);
    if (!ok) return res.status(404).json({ success: false, error: 'Family member not found or not deletable' });
    res.json({ success: true, deleted: true });
  } catch (error) {
    logger.error({ error, userId, characterId }, 'Failed to delete family member');
    res.status(500).json({ success: false, error: 'Failed to delete character' });
  }
});

// PATCH /api/family-trees/member/:characterId/relationship — correct how they relate
router.patch('/member/:characterId/relationship', requireAuth, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const characterId = String(req.params.characterId);
  const relation = typeof req.body?.relation === 'string' ? req.body.relation.trim() : '';
  const connectsToId = typeof req.body?.connectsToId === 'string' ? req.body.connectsToId.trim() || undefined : undefined;
  const side = ['maternal', 'paternal', 'both', 'other'].includes(req.body?.side) ? req.body.side : undefined;
  if (!relation) return res.status(400).json({ success: false, error: 'relation is required' });
  try {
    const ok = await familyTreeService.setMemberRelationship(userId, characterId, { relation, connectsToId, side });
    if (!ok) return res.status(404).json({ success: false, error: 'Could not set relationship' });
    res.json({ success: true });
  } catch (error) {
    logger.error({ error, userId, characterId }, 'Failed to set family relationship');
    res.status(500).json({ success: false, error: 'Failed to update relationship' });
  }
});

// POST /api/family-trees/:anchorId/members — add an existing character card to this family tree
router.post('/:anchorId/members', requireAuth, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const anchorId = String(req.params.anchorId);
  const memberId = typeof req.body?.characterId === 'string' ? req.body.characterId.trim() : '';
  const relation = typeof req.body?.relation === 'string' ? req.body.relation.trim() : '';
  const side = ['maternal', 'paternal', 'both', 'other'].includes(req.body?.side) ? req.body.side : undefined;
  if (!memberId || !relation) {
    return res.status(400).json({ success: false, error: 'characterId and relation are required' });
  }
  try {
    const ok = await familyTreeService.addExistingFamilyMember(userId, anchorId, memberId, { relation, side });
    if (!ok) return res.status(404).json({ success: false, error: 'Could not add family member' });
    const tree = await familyTreeService.getCharacterFamilyTree(userId, anchorId);
    res.json({ success: true, tree: tree ?? { members: [], branches: [], self_id: anchorId } });
  } catch (error) {
    logger.error({ error, userId, anchorId, memberId }, 'Failed to add existing family member');
    res.status(500).json({ success: false, error: 'Failed to add family member' });
  }
});

// POST /api/family-trees/member/:characterId/ensure-card — create + link a card if missing
router.post('/member/:characterId/ensure-card', requireAuth, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const characterId = String(req.params.characterId);
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
  try {
    const result = await familyTreeService.ensureMemberCard(userId, characterId, name);
    if (!result) return res.status(422).json({ success: false, error: 'No character card could be created for this node' });
    res.json({ success: true, character: result.character, created: result.created });
  } catch (error) {
    logger.error({ error, userId, characterId }, 'Failed to ensure family member card');
    res.status(500).json({ success: false, error: 'Failed to create character card' });
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
