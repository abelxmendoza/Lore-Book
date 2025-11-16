import type { Response } from 'express';
import { z } from 'zod';

import type { AuthenticatedRequest } from '../middleware/auth';
import { chapterService } from '../services/chapterService';
import { chatService } from '../services/chatService';
import { memoryService } from '../services/memoryService';

const chapterSchema = z.object({
  title: z.string().min(2),
  startDate: z.string(),
  endDate: z.string().nullable().optional(),
  description: z.string().nullable().optional()
}).refine((data) => {
  if (!data.endDate) return true;
  return new Date(data.endDate) >= new Date(data.startDate);
}, ({ endDate }) => ({
  message: 'End date must be after start date',
  path: endDate ? ['endDate'] : []
}));

export const createChapter = async (req: AuthenticatedRequest, res: Response) => {
  const parsed = chapterSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json(parsed.error.flatten());
  }

  const chapter = await chapterService.createChapter(req.user!.id, parsed.data);
  return res.status(201).json({ chapter });
};

export const listChapters = async (req: AuthenticatedRequest, res: Response) => {
  const chapters = await chapterService.listChapters(req.user!.id);
  return res.json({ chapters });
};

export const summarizeChapter = async (req: AuthenticatedRequest, res: Response) => {
  const chapterId = req.params.chapterId;
  const chapter = await chapterService.getChapter(req.user!.id, chapterId);

  if (!chapter) {
    return res.status(404).json({ error: 'Chapter not found' });
  }

  const entries = await memoryService.searchEntries(req.user!.id, { chapterId, limit: 100 });
  const summary = await chatService.summarizeEntries(req.user!.id, entries, {
    title: chapter.title,
    description: chapter.description ?? undefined
  });

  const updated = await chapterService.saveSummary(req.user!.id, chapterId, summary);

  return res.json({ summary, chapter: updated ?? chapter });
};
