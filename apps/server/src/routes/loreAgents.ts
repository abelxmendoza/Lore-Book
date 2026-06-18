/**
 * LORE AGENTS API
 *
 * Read-only window into the System Cognition / Agent Layer. Powers the
 * "How LoreBook Understood This" developer/admin panel.
 *
 * GET /api/lore-agents/trace/:messageId
 *   Returns every agent run, observation, and proposed action recorded for a
 *   single message, plus the pipeline trace the agents observed.
 *
 * There are intentionally no write endpoints here: proposed actions are
 * confirmed through the existing Memory Review Queue / Entity Authority /
 * Correction Authority surfaces, never through this route.
 */

import { Router } from 'express';
import { z } from 'zod';

import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';
import { config } from '../config';
import { loreAgentRunService } from '../services/agents/loreAgentRunService';
import { loreAgentTools } from '../services/agents/loreAgentTools';

const router = Router();

const messageIdParam = z.object({ messageId: z.string().uuid() });

/** GET /api/lore-agents/trace/:messageId */
router.get(
  '/trace/:messageId',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const { messageId } = messageIdParam.parse(req.params);
    const userId = req.user!.id;

    const [trace, pipeline] = await Promise.all([
      loreAgentRunService.getTraceByMessage(userId, messageId),
      loreAgentTools.getPipelineTrace(userId, messageId),
    ]);

    res.json({
      enabled: config.enableLoreAgents,
      messageId,
      pipeline,
      runs: trace.runs,
      observations: trace.observations,
      proposedActions: trace.proposedActions,
    });
  })
);

export const loreAgentsRouter = router;
