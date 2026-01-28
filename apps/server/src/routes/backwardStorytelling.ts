/**
 * Backward-Storytelling–Safe Narrative Ingestion API
 * Use when the user tells a life story that may be out of chronological order.
 */

import { Router } from 'express';
import { z } from 'zod';

import { logger } from '../logger';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { runBackwardStorytellingPipeline } from '../services/backwardStorytelling';

const router = Router();

const ingestSchema = z.object({
  text: z.string().min(1).max(50000),
  source: z.enum(['chat', 'journal']).default('chat'),
  sourceEntryId: z.string().uuid().optional(),
  sourceTimestamp: z.string().datetime().optional(),
  tags: z.array(z.string()).optional(),
  /** When true and parentSagaId is set, pipeline creates arcs under that saga and wires threads/relations from inference */
  createArcs: z.boolean().optional(),
  /** Saga id under which to create arcs when createArcs is true */
  parentSagaId: z.string().uuid().optional(),
  /** Optional known life anchors for resolving relative dates */
  knownAnchors: z.object({
    anchors: z.array(z.object({
      id: z.string(),
      label: z.string(),
      date: z.string(),
      type: z.enum(['graduation', 'job_start', 'job_end', 'move', 'relationship_start', 'other']).optional(),
    })).optional(),
  }).optional(),
});

/**
 * POST /api/backward-storytelling/ingest
 * Run backward-storytelling–safe pipeline on narrative text.
 * Returns created slices (journal entry ids), segments, and any low-confidence review prompt.
 */
router.post('/ingest', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const parsed = ingestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }

    const { text, source, sourceEntryId, sourceTimestamp, tags, createArcs, parentSagaId, knownAnchors } = parsed.data;

    const result = await runBackwardStorytellingPipeline({
      userId: req.user!.id,
      text,
      source,
      sourceEntryId,
      sourceTimestamp,
      tags,
      createArcs,
      parentSagaId,
      context: { knownAnchors, parentSagaId },
    });

    res.status(201).json({
      slices: result.slices.map(s => ({
        entry_id: s.entry_id,
        date: s.date,
        narrative_order: s.narrative_order,
        inference_confidence: s.inference_confidence,
      })),
      segmentCount: result.segments.length,
      lowConfidenceSegmentIds: result.lowConfidenceSegmentIds,
      suggestedReviewPrompt: result.suggestedReviewPrompt,
    });
  } catch (error) {
    logger.error({ error, userId: req.user?.id }, 'Backward-storytelling ingest failed');
    res.status(500).json({
      error: 'Backward-storytelling ingest failed',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export const backwardStorytellingRouter = router;
