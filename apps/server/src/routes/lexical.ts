/**
 * Lexical Analyzer API — pre-ontology text processing for LoreBook.
 */
import { Router } from 'express';
import { randomUUID } from 'crypto';
import { z } from 'zod';

import {
  lexicalAnalyzeLimit,
  lexicalDebugLimit,
  lexicalPreviewLimit,
  requireDevToolingAccess,
} from '../middleware/apiProtection';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';
import { lexicalAnalyzerService } from '../services/lexical';
import { previewLexicalSpans } from '../services/lexical/lexicalPreviewService';
import { runLoreInterpretationPipeline } from '../services/pipeline/loreInterpretationPipeline';

const router = Router();

const analyzeSchema = z.object({
  messageId: z.string().uuid().optional(),
  threadId: z.string().uuid().optional(),
  text: z.string().min(1).max(50_000),
  persist: z.boolean().optional(),
});

const previewSchema = z.object({
  text: z.string().min(1).max(50_000),
  threadId: z.string().uuid().optional(),
  mode: z.enum(['composer_preview']).optional(),
});

/** POST /api/lexical/analyze — run lexical analysis on raw text */
router.post(
  '/analyze',
  lexicalAnalyzeLimit,
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

/** POST /api/lexical/preview — read-only composer span preview (no persistence) */
router.post(
  '/preview',
  lexicalPreviewLimit,
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const body = previewSchema.parse(req.body);
    const userId = req.user!.id;

    const result = await previewLexicalSpans({
      text: body.text,
      userId,
      threadId: body.threadId,
      mode: body.mode ?? 'composer_preview',
    });

    res.json(result);
  })
);

const debugSchema = z.object({
  text: z.string().min(1).max(50_000),
  includeContext: z.boolean().optional().default(true),
  includeAlternatives: z.boolean().optional().default(true),
});

/** POST /api/lexical/debug — intelligence span debug (dev / quality tooling) */
router.post(
  '/debug',
  requireDevToolingAccess,
  lexicalDebugLimit,
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const body = debugSchema.parse(req.body);
    const { runLexicalIntelligence, buildLexicalDebugReport } = await import(
      '../services/lexical/intelligence'
    );

    const result = runLexicalIntelligence({
      text: body.text,
      userId: req.user!.id,
      includeAlternatives: body.includeAlternatives,
      includeAnalyzerEntities: true,
    });

    const report = buildLexicalDebugReport(body.text, result);

    res.json({
      spans: report.spans,
      rulesFired: report.rulesFired,
      overlapsResolved: report.overlapsResolved,
      missedCandidates: report.missedCandidates,
      warnings: report.warnings,
      spanCount: report.spanCount,
      averageConfidence: report.averageConfidence,
    });
  })
);

export const lexicalRouter = router;
