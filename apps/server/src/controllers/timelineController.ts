import type { Response } from 'express';

import { logger } from '../logger';
import type { AuthenticatedRequest } from '../middleware/auth';
import { memoryService } from '../services/memoryService';

export const getTimeline = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { timeline, timing } = await memoryService.getTimeline(req.user!.id);

    if (process.env.NODE_ENV !== 'production') {
      res.setHeader('X-Timeline-Timing-Ms', String(timing.totalMs));
      res.setHeader('X-Timeline-Db-Ms', String(timing.dbMs));
      res.setHeader('X-Timeline-Stitch-Ms', String(timing.stitchMs));
      res.setHeader('X-Timeline-Serialize-Ms', String(timing.serializeMs));
      res.setHeader('X-Timeline-Chapter-Load-Ms', String(timing.chapterLoadMs));
      res.setHeader('X-Timeline-Entry-Cache-Hit', timing.entryCacheHit ? '1' : '0');
      res.setHeader('X-Timeline-Openai-Ms', String(timing.openaiMs));
    }

    if (timing.totalMs > 2000) {
      logger.info({ userId: req.user!.id, timing }, 'Slow timeline fetch');
    }

    res.json({ timeline });
  } catch (error) {
    logger.error({ error }, 'Error fetching timeline');
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to fetch timeline' });
  }
};
