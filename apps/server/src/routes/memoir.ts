import { Router } from 'express';
import { z } from 'zod';

import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { memoirService } from '../services/memoirService';
import { logger } from '../logger';

const router = Router();

router.get('/outline', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const outline = await memoirService.getOutline(req.user!.id);
    res.json(outline);
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
