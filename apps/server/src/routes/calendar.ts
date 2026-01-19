import { Router } from 'express';
import { z } from 'zod';

import { logger } from '../logger';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { calendarService } from '../services/calendarService';

const router = Router();

const calendarEventSchema = z.object({
  id: z.string(),
  title: z.string(),
  startDate: z.string(),
  endDate: z.string().optional(),
  location: z.string().optional(),
  notes: z.string().optional(),
  attendees: z.array(z.string()).optional(),
  isAllDay: z.boolean().optional(),
  calendarName: z.string().optional(),
  timeZone: z.string().optional()
});

const syncSchema = z.object({
  events: z.array(calendarEventSchema)
});

/**
 * Sync calendar events from device (mobile apps)
 * Creates journal entries automatically from calendar events
 */
router.post('/sync', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const parsed = syncSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json(parsed.error.flatten());
    }

    const result = await calendarService.syncEvents(
      req.user!.id,
      parsed.data.events
    );

    res.status(201).json({ 
      success: true,
      ...result
    });
  } catch (error: any) {
    logger.error({ error }, 'Failed to sync calendar events');
    res.status(500).json({ error: error.message || 'Failed to sync calendar events' });
  }
});

export const calendarRouter = router;

