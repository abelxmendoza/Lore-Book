// =====================================================
// GROUP CANDIDATES ROUTES
// Purpose: Review queue for detected group signals
// =====================================================

import { Router } from 'express';
import { z } from 'zod';

import { logger } from '../logger';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { groupCandidateService } from '../services/groupCandidateService';
import { CANONICAL_GROUP_TYPES } from '../constants/groupTypes';

const router = Router();

const USER_RELATIONSHIPS = [
  'founder','leader','member','former_member','collaborator',
  'adjacent','fan','aware_of','referenced','alumnus',
] as const;

const MEMBERSHIP_MODELS = ['strict','fuzzy','none'] as const;

// GET /api/group-candidates
// Returns pending candidates that have met the surface threshold
router.get('/', requireAuth, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const status = (String(req.query.status || 'pending')) as 'pending' | 'accepted' | 'rejected' | 'all';
  try {
    const candidates = await groupCandidateService.getCandidates(userId, status);
    const pendingCount = await groupCandidateService.getPendingCount(userId);
    res.json({ success: true, candidates, pending_count: pendingCount });
  } catch (error) {
    logger.error({ error, userId }, 'Failed to get group candidates');
    res.status(500).json({ success: false, error: 'Failed to get group candidates' });
  }
});

// POST /api/group-candidates/scan
// On-demand scan of the user's recent threads + journals for group signals.
// Lets the UI surface groups immediately instead of waiting for the cycle.
router.post('/scan', requireAuth, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const days = Math.min(Math.max(Number(req.body?.days) || 90, 1), 365);
  const cap = Math.min(Math.max(Number(req.body?.cap) || 120, 10), 300);
  try {
    const { groupDetectionWorker } = await import('../workers/groupDetectionWorker');
    await groupDetectionWorker.runForUser(userId, days, cap);
    const candidates = await groupCandidateService.getCandidates(userId, 'pending');
    res.json({ success: true, candidates, scanned_days: days, scanned_cap: cap });
  } catch (error) {
    logger.error({ error, userId }, 'Failed to scan for group candidates');
    res.status(500).json({ success: false, error: 'Failed to scan for groups' });
  }
});

// GET /api/group-candidates/count
// Lightweight count for badge/notification purposes
router.get('/count', requireAuth, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  try {
    const count = await groupCandidateService.getPendingCount(userId);
    res.json({ success: true, count });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to get count' });
  }
});

// POST /api/group-candidates/:id/accept
router.post('/:id/accept', requireAuth, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const candidateId = String(req.params.id);

  const schema = z.object({
    name: z.string().min(1).optional(),
    group_type: z.enum(CANONICAL_GROUP_TYPES).optional(),
    user_relationship: z.enum(USER_RELATIONSHIPS).optional(),
    membership_model: z.enum(MEMBERSHIP_MODELS).optional(),
    description: z.string().optional(),
    members: z.array(z.string()).optional(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: parsed.error.issues });
    return;
  }

  try {
    const result = await groupCandidateService.acceptCandidate(userId, candidateId, parsed.data);
    res.json({ success: true, organization_id: result.organization_id });
  } catch (error) {
    logger.error({ error, userId, candidateId }, 'Failed to accept group candidate');
    res.status(500).json({ success: false, error: 'Failed to accept candidate' });
  }
});

// POST /api/group-candidates/:id/merge
// Merge a candidate into an existing organization instead of creating a new one.
router.post('/:id/merge', requireAuth, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const candidateId = String(req.params.id);

  const schema = z.object({ organization_id: z.string().min(1) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: parsed.error.issues });
    return;
  }

  try {
    const result = await groupCandidateService.mergeCandidate(userId, candidateId, parsed.data.organization_id);
    res.json({ success: true, ...result });
  } catch (error) {
    logger.error({ error, userId, candidateId }, 'Failed to merge group candidate');
    res.status(500).json({ success: false, error: 'Failed to merge candidate' });
  }
});

// POST /api/group-candidates/:id/reject
router.post('/:id/reject', requireAuth, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const candidateId = String(req.params.id);
  try {
    await groupCandidateService.rejectCandidate(userId, candidateId);
    res.json({ success: true });
  } catch (error) {
    logger.error({ error, userId, candidateId }, 'Failed to reject group candidate');
    res.status(500).json({ success: false, error: 'Failed to reject candidate' });
  }
});

export default router;
