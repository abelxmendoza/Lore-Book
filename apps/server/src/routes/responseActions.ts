import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';
import { applyResponseAction } from '../services/responseCompiler/responseActionService';

const router = Router();

// ─── POST /api/response-actions/apply ────────────────────────────────────────
//
// Apply a Response Compiler action chip. This is the user-confirmation gate:
// the compiler only ever *suggests* chips; they become canon only when the user
// explicitly invokes this endpoint. Never called automatically from compile.
//
// Body: { type: string, label: string, payload?: object }
// Returns: { success, applied, status, actionType, message, entity? }
const applySchema = z.object({
  type: z.string().min(1).max(64),
  label: z.string().min(1).max(200),
  payload: z.record(z.string(), z.unknown()).optional(),
});

router.post(
  '/apply',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const parsed = applySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid action', details: parsed.error.flatten() });
    }

    const result = await applyResponseAction(req.user!.id, parsed.data);
    return res.status(result.applied ? 201 : 200).json({ success: result.applied, ...result });
  }),
);

export default router;
