import type { Response } from 'express';
import { z } from 'zod';

import { logger } from '../logger';
import type { AuthenticatedRequest } from '../middleware/auth';
import { chapterInsightsService } from '../services/chapterInsightsService';
import { chapterService } from '../services/chapterService';
import { chatService } from '../services/chatService';
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
  try {
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
        logger.warn({ error, chapterId: chapter.id }, 'Failed to auto-generate chapter name, continuing');
        // Continue without failing the request
      }
    }

    return res.status(201).json({ chapter });
  } catch (error) {
    logger.error({ error }, 'Error creating chapter');
    return res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to create chapter' });
  }
};

export const listChapters = async (req: AuthenticatedRequest, res: Response) => {
  const started = Date.now();
  try {
    const userId = req.user!.id;
    const { chapterInsightsCacheService } = await import('../services/chapterInsightsCacheService');
    const cachedProfiles = await chapterInsightsCacheService.getCachedInsights(userId);
    const cacheHit = Boolean(cachedProfiles);

    const [entryResult, chapterResult] = await Promise.all([
      (async () => {
        const start = Date.now();
        const entries = await memoryService.searchEntries(userId, { limit: 400 });
        return { entries, ms: Date.now() - start };
      })(),
      (async () => {
        const start = Date.now();
        const chapters = await chapterService.listChapters(userId);
        return { chapters, ms: Date.now() - start };
      })(),
    ]);
    const sharedEntries = entryResult.entries;
    const chapterRows = chapterResult.chapters;
    const entryFetchMs = entryResult.ms;
    const chapterLoadMs = chapterResult.ms;

    const profileStart = Date.now();
    const candidateStart = Date.now();
    const [chapters, candidates] = await Promise.all([
      chapterInsightsService
        .buildProfiles(userId, { entries: sharedEntries, chapters: chapterRows })
        .then((result) => {
          const profileComputeMs = Date.now() - profileStart;
          return { result, profileComputeMs };
        }),
      chapterInsightsService
        .detectCandidates(userId, { entries: sharedEntries })
        .then((result) => {
          const candidateComputeMs = Date.now() - candidateStart;
          return { result, candidateComputeMs };
        }),
    ]);

    const payload = { chapters: chapters.result, candidates: candidates.result };
    const serializeStart = Date.now();
    JSON.stringify(payload);
    const serializeMs = Date.now() - serializeStart;

    const timing = {
      totalMs: Date.now() - started,
      dbMs: Math.max(entryFetchMs, chapterLoadMs),
      entryFetchMs,
      chapterLoadMs,
      profileComputeMs: chapters.profileComputeMs,
      candidateComputeMs: candidates.candidateComputeMs,
      serializeMs,
      cacheHit,
      openaiMs: 0,
    };

    if (process.env.NODE_ENV !== 'production') {
      res.setHeader('X-Chapters-Timing-Ms', String(timing.totalMs));
      res.setHeader('X-Chapters-Db-Ms', String(timing.dbMs));
      res.setHeader('X-Chapters-Entry-Fetch-Ms', String(timing.entryFetchMs));
      res.setHeader('X-Chapters-Chapter-Load-Ms', String(timing.chapterLoadMs));
      res.setHeader('X-Chapters-Profile-Compute-Ms', String(timing.profileComputeMs));
      res.setHeader('X-Chapters-Candidate-Compute-Ms', String(timing.candidateComputeMs));
      res.setHeader('X-Chapters-Serialize-Ms', String(timing.serializeMs));
      res.setHeader('X-Chapters-Cache-Hit', cacheHit ? '1' : '0');
    }

    if (timing.totalMs > 2500) {
      logger.info({ userId, timing }, 'Slow chapters fetch');
    }

    return res.json(payload);
  } catch (error) {
    logger.error({ error }, 'Error listing chapters');
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
