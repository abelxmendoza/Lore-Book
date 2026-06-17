/**
 * Profile Claims API — list, confirm, reject resume and chat-derived claims.
 */
import { Router } from 'express';
import { z } from 'zod';

import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';
import {
  profileClaimsService,
  type ClaimSource,
  type ClaimType,
  type VerifiedStatus,
} from '../services/profileClaims/profileClaimsService';

const router = Router();

const listQuerySchema = z.object({
  source: z.enum(['resume', 'chat', 'linkedin', 'manual', 'work_summary', 'journal_entry']).optional(),
  claim_type: z.enum(['role', 'skill', 'experience', 'achievement', 'education', 'certification', 'project']).optional(),
  verified_status: z.enum(['unverified', 'supported', 'verified', 'contradicted', 'downgraded']).optional(),
});

const patchSchema = z.object({
  action: z.enum(['confirm', 'reject']),
  notes: z.string().max(2000).optional(),
});

/** GET /api/profile-claims */
router.get(
  '/',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const parsed = listQuerySchema.safeParse(req.query);
    const filters = parsed.success ? parsed.data : {};

    const claims = await profileClaimsService.getClaims(req.user!.id, {
      source: filters.source as ClaimSource | undefined,
      claim_type: filters.claim_type as ClaimType | undefined,
      verified_status: filters.verified_status as VerifiedStatus | undefined,
    });

    const unverified = claims.filter((c) => !c.user_confirmed && c.verified_status === 'unverified');

    res.json({
      success: true,
      claims,
      stats: {
        total: claims.length,
        unverified: unverified.length,
        verified: claims.filter((c) => c.verified_status === 'verified').length,
      },
    });
  })
);

/** GET /api/profile-claims/:claimId */
router.get(
  '/:claimId',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const claim = await profileClaimsService.getClaim(req.user!.id, req.params.claimId);
    if (!claim) {
      return res.status(404).json({ error: 'Claim not found' });
    }
    const evidence = await profileClaimsService.getClaimEvidence(req.user!.id, claim.id);
    res.json({ success: true, claim, evidence });
  })
);

/** PATCH /api/profile-claims/:claimId — confirm or reject */
router.patch(
  '/:claimId',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const body = patchSchema.parse(req.body);
    const userId = req.user!.id;
    const { claimId } = req.params;

    const existing = await profileClaimsService.getClaim(userId, claimId);
    if (!existing) {
      return res.status(404).json({ error: 'Claim not found' });
    }

    const claim =
      body.action === 'confirm'
        ? await profileClaimsService.confirmClaim(userId, claimId, body.notes)
        : await profileClaimsService.rejectClaim(userId, claimId, body.notes);

    res.json({ success: true, claim });
  })
);

export const profileClaimsRouter = router;
