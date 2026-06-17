/**
 * Meaning Resolution API
 */
import { Router } from 'express';
import { randomUUID } from 'crypto';
import { z } from 'zod';

import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';
import { lexicalAnalyzerService } from '../services/lexical';
import { meaningResolutionService } from '../services/meaning';
import { runLoreInterpretationPipeline } from '../services/pipeline/loreInterpretationPipeline';
import { supabaseAdmin } from '../services/supabaseClient';

const router = Router();

const resolveSchema = z.object({
  messageId: z.string().uuid().optional(),
  threadId: z.string().uuid().optional(),
  text: z.string().min(1).max(50_000),
  lexicalResultId: z.string().uuid().optional(),
  persist: z.boolean().optional(),
  fullPipeline: z.boolean().optional(),
});

/** POST /api/meaning/resolve */
router.post(
  '/resolve',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const body = resolveSchema.parse(req.body);
    const userId = req.user!.id;
    const messageId = body.messageId ?? randomUUID();

    if (body.fullPipeline) {
      const result = await runLoreInterpretationPipeline({
        userId,
        messageId,
        text: body.text,
        threadId: body.threadId,
      });
      return res.json(result.meaning);
    }

    let lexicalResultId = body.lexicalResultId;
    if (!lexicalResultId && body.persist) {
      const { data } = await supabaseAdmin
        .from('lexical_analysis_results')
        .select('id')
        .eq('message_id', messageId)
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      lexicalResultId = data?.id;
    }

    const lexical = lexicalAnalyzerService.analyzeMessage({
      userId,
      messageId,
      text: body.text,
      threadId: body.threadId,
    });

    const input = {
      userId,
      messageId,
      text: body.text,
      threadId: body.threadId,
      lexicalResult: lexical,
      timestamp: new Date().toISOString(),
      lexicalResultId,
    };

    const meaning = body.persist
      ? await meaningResolutionService.resolveAndIntegrate(input)
      : await meaningResolutionService.resolve(input);

    res.json(meaning);
  })
);

export const meaningRouter = router;
