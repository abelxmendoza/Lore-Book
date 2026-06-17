/**
 * Lexical Analyzer API — pre-ontology text processing for LoreBook.
 */
import { Router } from 'express';
import { randomUUID } from 'crypto';
import { z } from 'zod';

import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';
import { lexicalAnalyzerService } from '../services/lexical';
import { runLoreInterpretationPipeline } from '../services/pipeline/loreInterpretationPipeline';

const router = Router();

const analyzeSchema = z.object({
  messageId: z.string().uuid().optional(),
  threadId: z.string().uuid().optional(),
  text: z.string().min(1).max(50_000),
  persist: z.boolean().optional(),
});

/** POST /api/lexical/analyze — run lexical analysis on raw text */
router.post(
  '/analyze',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const body = analyzeSchema.parse(req.body);
    const userId = req.user!.id;
    const messageId = body.messageId ?? randomUUID();

    const result = body.persist
      ? await runLoreInterpretationPipeline({
          userId,
          messageId,
          text: body.text,
          threadId: body.threadId,
        }).then((r) => r.lexical)
      : lexicalAnalyzerService.analyzeMessage({
          userId,
          messageId,
          text: body.text,
          threadId: body.threadId,
        });

    res.json(result);
  })
);

export const lexicalRouter = router;
