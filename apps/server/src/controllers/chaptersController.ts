import type { Response } from 'express';
import { z } from 'zod';

import type { AuthenticatedRequest } from '../middleware/auth';
import { chapterService } from '../services/chapterService';
import { chatService } from '../services/chatService';
import { chapterInsightsService } from '../services/chapterInsightsService';
import { correctionService } from '../services/correctionService';
import { memoryService } from '../services/memoryService';
import { namingService } from '../services/namingService';
import { supabaseAdmin } from '../services/supabaseClient';

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
  
  // Auto-generate chapter name if title is generic
  if (!parsed.data.title || parsed.data.title === 'Untitled Chapter' || parsed.data.title.length < 3) {
    try {
      const { data: entriesData } = await supabaseAdmin
        .from('journal_entries')
        .select('content, date')
        .eq('user_id', req.user!.id)
        .eq('chapter_id', chapter.id)
        .order('date', { ascending: false })
        .limit(50);

      const entries = (entriesData || []).map((e: any) => ({
        content: e.content,
        date: e.date
      }));

      if (entries.length > 0) {
        const generatedTitle = await namingService.generateChapterName(req.user!.id, chapter.id, entries);
        await supabaseAdmin
          .from('chapters')
          .update({ title: generatedTitle })
          .eq('id', chapter.id)
          .eq('user_id', req.user!.id);
        chapter.title = generatedTitle;
      }
    } catch (error) {
      console.error('Failed to auto-generate chapter name:', error);
      // Continue without failing the request
    }
  }

  return res.status(201).json({ chapter });
};

export const listChapters = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const [chapters, candidates] = await Promise.all([
      chapterInsightsService.buildProfiles(req.user!.id),
      chapterInsightsService.detectCandidates(req.user!.id)
    ]);

    return res.json({ chapters, candidates });
  } catch (error) {
    console.error('Error listing chapters:', error);
    return res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to list chapters' });
  }
};

export const getChapterEntries = async (req: AuthenticatedRequest, res: Response) => {
  const chapterId = req.params.chapterId;
  const chapter = await chapterService.getChapter(req.user!.id, chapterId);
  if (!chapter) {
    return res.status(404).json({ error: 'Chapter not found' });
  }

  const entries = await memoryService.searchEntries(req.user!.id, { chapterId, limit: 200 });
  const resolved = correctionService.applyCorrectionsToEntries(entries);

  return res.json({ chapter, entries: resolved });
};

export const detectChapterCandidates = async (req: AuthenticatedRequest, res: Response) => {
  const candidates = await chapterInsightsService.detectCandidates(req.user!.id);
  return res.json({ candidates });
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
