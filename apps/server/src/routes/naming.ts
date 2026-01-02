import { Router } from 'express';
import { z } from 'zod';

import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { namingService } from '../services/namingService';
import { supabaseAdmin } from '../services/supabaseClient';
import { logger } from '../logger';

const router = Router();

const generateChapterNameSchema = z.object({
  chapterId: z.string().uuid()
});

router.post('/chapter-name', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const parsed = generateChapterNameSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid request' });
    }

    const { chapterId } = parsed.data;
    const userId = req.user!.id;

    // Get chapter entries
    const { data: chapter } = await supabaseAdmin
      .from('chapters')
      .select('*')
      .eq('id', chapterId)
      .eq('user_id', userId)
      .single();

    if (!chapter) {
      return res.status(404).json({ error: 'Chapter not found' });
    }

    // Get entries for this chapter
    const { data: entriesData } = await supabaseAdmin
      .from('journal_entries')
      .select('content, date')
      .eq('user_id', userId)
      .eq('chapter_id', chapterId)
      .order('date', { ascending: false })
      .limit(50);

    const entries = (entriesData || []).map((e: any) => ({
      content: e.content,
      date: e.date
    }));

    const title = await namingService.generateChapterName(userId, chapterId, entries);

    // Update chapter title
    await supabaseAdmin
      .from('chapters')
      .update({ title, updated_at: new Date().toISOString() })
      .eq('id', chapterId)
      .eq('user_id', userId);

    res.json({ title });
  } catch (error) {
    logger.error({ err: error }, 'Failed to generate chapter name');
    res.status(500).json({ error: 'Failed to generate chapter name' });
  }
});

const updateChapterNameSchema = z.object({
  chapterId: z.string().uuid(),
  title: z.string().min(1).max(200)
});

router.patch('/chapter-name', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const parsed = updateChapterNameSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid request' });
    }

    const { chapterId, title } = parsed.data;
    const userId = req.user!.id;

    const { error } = await supabaseAdmin
      .from('chapters')
      .update({ title, updated_at: new Date().toISOString() })
      .eq('id', chapterId)
      .eq('user_id', userId);

    if (error) {
      return res.status(500).json({ error: 'Failed to update chapter name' });
    }

    res.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, 'Failed to update chapter name');
    res.status(500).json({ error: 'Failed to update chapter name' });
  }
});

const generateMemoirSchema = z.object({
  focus: z.string().optional(),
  period: z
    .object({
      from: z.string().optional(),
      to: z.string().optional()
    })
    .optional()
});

router.post('/memoir', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const parsed = generateMemoirSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid request' });
    }

    const memoir = await namingService.generateMemoir(req.user!.id, parsed.data);

    res.json({ memoir });
  } catch (error) {
    logger.error({ err: error }, 'Failed to generate memoir');
    res.status(500).json({ error: 'Failed to generate memoir' });
  }
});

export const namingRouter = router;

