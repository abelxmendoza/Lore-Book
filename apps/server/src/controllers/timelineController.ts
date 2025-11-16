import type { Response } from 'express';

import type { AuthenticatedRequest } from '../middleware/auth';
import { memoryService } from '../services/memoryService';

export const getTimeline = async (req: AuthenticatedRequest, res: Response) => {
  const timeline = await memoryService.getTimeline(req.user!.id);
  res.json({ timeline });
};
