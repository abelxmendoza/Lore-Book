import type { Response } from 'express';

import { logger } from '../logger';
import type { AuthenticatedRequest } from '../middleware/auth';
import { memoryService } from '../services/memoryService';

export const getTimeline = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const timeline = await memoryService.getTimeline(req.user!.id);
    res.json({ timeline });
  } catch (error) {
    logger.error({ error }, 'Error fetching timeline');
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to fetch timeline' });
  }
};
