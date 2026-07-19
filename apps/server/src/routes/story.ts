/**
 * Story API — narrative IR-powered story surfaces.
 */
import { Router } from 'express';

import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';
import { compileBookOutline } from '../services/narrative/bookCompilerService';
import { historyEngineService } from '../services/narrative/history';
import { narrativeCompilerService } from '../services/narrative/narrativeCompilerService';
import { narrativeStoryChapterService } from '../services/narrative/narrativeStoryChapterService';
import { narrativeLifeEraService } from '../services/narrative/narrativeLifeEraService';
import { answerGoldenQuestions } from '../services/narrative/storyGoldenQuestions';
import { computeStoryHealth } from '../services/narrative/storyHealthService';
import type { BookOutline } from '../services/narrative/types';

const router = Router();

/** GET /api/story — full NarrativeIR */
router.get(
  '/',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const ir = await narrativeCompilerService.compile(req.user!.id);
    res.json({ success: true, ir });
  })
);

function parseStoryLimit(raw: unknown): number | undefined {
  if (typeof raw !== 'string' || !raw.trim()) return undefined;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) return undefined;
  return Math.min(n, 5000);
}

/** GET /api/story/life-history — classified events, life chapters, turning points */
router.get(
  '/life-history',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const limit = parseStoryLimit(req.query.limit);
    const history = await historyEngineService.compile(req.user!.id, [], { limit });
    res.json({ success: true, history });
  }),
);

/** GET /api/story/life-chapters */
router.get(
  '/life-chapters',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const limit = parseStoryLimit(req.query.limit);
    const history = await historyEngineService.compile(req.user!.id, [], { limit });
    res.json({
      success: true,
      generatedAt: history.generatedAt,
      chapters: history.chapters,
      eventCount: history.eventCount,
    });
  }),
);

/** GET /api/story/story-chapters — durable chapters assembled from Scenes */
router.get(
  '/story-chapters',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const limit = parseStoryLimit(req.query.limit) ?? 100;
    const chapters = await narrativeStoryChapterService.listChapters(req.user!.id, { limit });
    res.json({
      success: true,
      chapters,
      chapterCount: chapters.length,
    });
  }),
);

/** GET /api/story/life-eras — durable eras assembled from Story Chapters */
router.get(
  '/life-eras',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const limit = parseStoryLimit(req.query.limit) ?? 50;
    const eras = await narrativeLifeEraService.listEras(req.user!.id, { limit });
    res.json({
      success: true,
      eras,
      eraCount: eras.length,
    });
  }),
);

/** GET /api/story/current-chapter */
router.get(
  '/current-chapter',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const ir = await narrativeCompilerService.compile(req.user!.id);
    res.json({
      success: true,
      generatedAt: ir.generatedAt,
      chapter: ir.currentChapter,
      provenance: ir.provenance,
    });
  })
);

/** GET /api/story/arcs */
router.get(
  '/arcs',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const ir = await narrativeCompilerService.compile(req.user!.id);
    res.json({
      success: true,
      generatedAt: ir.generatedAt,
      active: ir.activeArcs,
      dormant: ir.dormantArcs,
      provenance: ir.provenance,
    });
  })
);

/** GET /api/story/turning-points */
router.get(
  '/turning-points',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const ir = await narrativeCompilerService.compile(req.user!.id);
    res.json({ success: true, generatedAt: ir.generatedAt, turningPoints: ir.turningPoints });
  })
);

/** GET /api/story/relationships */
router.get(
  '/relationships',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const ir = await narrativeCompilerService.compile(req.user!.id);
    res.json({ success: true, generatedAt: ir.generatedAt, relationships: ir.relationships });
  })
);

/** GET /api/story/family */
router.get(
  '/family',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const ir = await narrativeCompilerService.compile(req.user!.id);
    res.json({ success: true, generatedAt: ir.generatedAt, family: ir.family });
  })
);

/** GET /api/story/timeline */
router.get(
  '/timeline',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const ir = await narrativeCompilerService.compile(req.user!.id);
    res.json({ success: true, generatedAt: ir.generatedAt, timeline: ir.timeline });
  })
);

/** GET /api/story/health */
router.get(
  '/health',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const ir = await narrativeCompilerService.compile(req.user!.id);
    const health = await computeStoryHealth(req.user!.id, ir);
    res.json({ success: true, generatedAt: ir.generatedAt, health });
  })
);

/** GET /api/story/golden-questions */
router.get(
  '/golden-questions',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const ir = await narrativeCompilerService.compile(req.user!.id);
    res.json({ success: true, generatedAt: ir.generatedAt, answers: answerGoldenQuestions(ir) });
  })
);

/** GET /api/story/book-outline?kind=autobiography */
router.get(
  '/book-outline',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const kind = (req.query.kind as BookOutline['kind']) || 'autobiography';
    const ir = await narrativeCompilerService.compile(req.user!.id);
    const outline = compileBookOutline(ir, kind);
    res.json({ success: true, outline });
  })
);

export const storyRouter = router;
