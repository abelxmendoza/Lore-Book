import { Router } from 'express';
import { z } from 'zod';

import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { memoirService } from '../services/memoirService';
import { logger } from '../logger';

const router = Router();

/**
 * ⚠️ DEPRECATION NOTICE ⚠️
 * 
 * The memoir endpoints are being deprecated in favor of the Biography system.
 * 
 * Migration guide:
 * - /api/memoir/outline → Use /api/biography/main-lifestory (returns biography with chapters)
 * - /api/memoir/sections → Use /api/biography/sections (returns biography chapters)
 * - /api/memoir/generate-section → Use /api/biography/generate with scope/timeRange
 * - /api/memoir/generate-full → Use /api/biography/generate with scope: 'full_life'
 * - /api/memoir/chat-edit → Use /api/biography/chat (biography auto-updates after chat)
 * 
 * Biography system advantages:
 * - Uses NarrativeAtoms (precomputed, structured data)
 * - Aligns with timeline hierarchy (chapters, arcs, sagas, eras)
 * - Supports multiple versions (safe, explicit, private)
 * - Better filtering (domain, time range, themes)
 * 
 * These endpoints will remain available for backward compatibility but will be removed in a future version.
 */

/**
 * @deprecated Use /api/biography/main-lifestory instead
 * Returns biography with chapters (replaces memoir outline)
 */
router.get('/outline', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    logger.warn({ userId: req.user!.id }, 'Deprecated endpoint /api/memoir/outline called - use /api/biography/main-lifestory instead');
    const outline = await memoirService.getOutline(req.user!.id);
    res.json({
      ...outline,
      _deprecated: true,
      _migration: 'Use /api/biography/main-lifestory instead'
    });
  } catch (error) {
    logger.error({ err: error }, 'Failed to get memoir outline');
    res.status(500).json({ error: 'Failed to load memoir outline' });
  }
});

router.post('/auto-update', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    await memoirService.autoUpdateMemoir(req.user!.id);
    res.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, 'Failed to auto-update memoir');
    res.status(500).json({ error: 'Failed to auto-update memoir' });
  }
});

const generateSectionSchema = z.object({
  focus: z.string().optional(),
  period: z
    .object({
      from: z.string().optional(),
      to: z.string().optional()
    })
    .optional(),
  chapterId: z.string().uuid().optional()
});

router.post('/generate-section', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const parsed = generateSectionSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid request' });
    }

    const section = await memoirService.generateSection(req.user!.id, parsed.data);
    res.json(section);
  } catch (error) {
    logger.error({ err: error }, 'Failed to generate memoir section');
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to generate section' });
  }
});

const generateFullMemoirSchema = z.object({
  focus: z.string().optional(),
  period: z
    .object({
      from: z.string().optional(),
      to: z.string().optional()
    })
    .optional()
});

router.post('/generate-full', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const parsed = generateFullMemoirSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid request' });
    }

    const memoir = await memoirService.generateFullMemoir(req.user!.id, parsed.data);
    res.json({ memoir });
  } catch (error) {
    logger.error({ err: error }, 'Failed to generate full memoir');
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to generate memoir' });
  }
});

const updateSectionSchema = z.object({
  sectionId: z.string().uuid(),
  title: z.string().optional(),
  content: z.string().optional()
});

router.patch('/section', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const parsed = updateSectionSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid request' });
    }

    await memoirService.updateSection(req.user!.id, parsed.data.sectionId, {
      title: parsed.data.title,
      content: parsed.data.content
    });

    res.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, 'Failed to update memoir section');
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to update section' });
  }
});

const chatEditSchema = z.object({
  sectionId: z.string().uuid(),
  focus: z.string(),
  message: z.string().min(1),
  history: z.array(
    z.object({
      role: z.enum(['user', 'assistant']),
      content: z.string()
    })
  )
});

router.post('/chat-edit', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const parsed = chatEditSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid request' });
    }

    const result = await memoirService.chatEdit(
      req.user!.id,
      parsed.data.sectionId,
      parsed.data.focus,
      parsed.data.message,
      parsed.data.history
    );

    res.json(result);
  } catch (error) {
    logger.error({ err: error }, 'Failed to process chat edit');
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to process edit' });
  }
});

export const memoirRouter = router;
