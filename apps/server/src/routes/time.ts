import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { timeEngine } from '../services/timeEngine';
import { logger } from '../logger';

const router = Router();

const parseTimestampSchema = z.object({
  input: z.string(),
  precision: z.enum(['year', 'month', 'day', 'hour', 'minute', 'second']).optional(),
  timezone: z.string().optional()
});

const timeRangeSchema = z.object({
  start: z.string(),
  end: z.string(),
  precision: z.enum(['year', 'month', 'day', 'hour', 'minute', 'second']).optional()
});

const sortChronologicallySchema = z.object({
  items: z.array(z.object({
    timestamp: z.union([z.string(), z.string().datetime()]),
    [z.string()]: z.any()
  }))
});

router.post('/parse', requireAuth, (req: AuthenticatedRequest, res) => {
  try {
    const parsed = parseTimestampSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid input' });
    }

    const { input, precision, timezone } = parsed.data;
    const result = timeEngine.parseTimestamp(input, precision);
    
    if (timezone) {
      result.timestamp = timeEngine.normalizeTimestamp(result.timestamp, result.precision, timezone);
    }

    res.json({
      timestamp: result.timestamp.toISOString(),
      precision: result.precision,
      type: result.type,
      confidence: result.confidence,
      formatted: timeEngine.formatTimestamp(result.timestamp, result.precision, timezone)
    });
  } catch (error) {
    logger.error({ error }, 'Failed to parse timestamp');
    res.status(500).json({ error: 'Failed to parse timestamp' });
  }
});

router.post('/range', requireAuth, (req: AuthenticatedRequest, res) => {
  try {
    const parsed = timeRangeSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid input' });
    }

    const { start, end, precision } = parsed.data;
    const range = timeEngine.createTimeRange(start, end, precision);

    res.json({
      start: range.start.toISOString(),
      end: range.end.toISOString(),
      precision: range.precision
    });
  } catch (error) {
    logger.error({ error }, 'Failed to create time range');
    res.status(500).json({ error: 'Failed to create time range' });
  }
});

router.post('/sort', requireAuth, (req: AuthenticatedRequest, res) => {
  try {
    const parsed = sortChronologicallySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid input' });
    }

    const sorted = timeEngine.sortChronologically(parsed.data.items);

    res.json({
      sorted: sorted.map(item => ({
        item: item.item,
        timestamp: item.timestamp.toISOString(),
        normalizedTimestamp: item.normalizedTimestamp.toISOString(),
        precision: item.precision
      }))
    });
  } catch (error) {
    logger.error({ error }, 'Failed to sort chronologically');
    res.status(500).json({ error: 'Failed to sort chronologically' });
  }
});

router.post('/difference', requireAuth, (req: AuthenticatedRequest, res) => {
  try {
    const { from, to } = req.body;
    if (!from) {
      return res.status(400).json({ error: 'Missing "from" timestamp' });
    }

    const difference = timeEngine.getTimeDifference(from, to);
    res.json(difference);
  } catch (error) {
    logger.error({ error }, 'Failed to calculate time difference');
    res.status(500).json({ error: 'Failed to calculate time difference' });
  }
});

router.post('/conflicts', requireAuth, (req: AuthenticatedRequest, res) => {
  try {
    const { timestamps, thresholdMinutes } = req.body;
    if (!Array.isArray(timestamps)) {
      return res.status(400).json({ error: 'timestamps must be an array' });
    }

    const conflicts = timeEngine.detectTemporalConflicts(timestamps, thresholdMinutes || 60);
    res.json({ conflicts });
  } catch (error) {
    logger.error({ error }, 'Failed to detect conflicts');
    res.status(500).json({ error: 'Failed to detect conflicts' });
  }
});

router.post('/timezone', requireAuth, (req: AuthenticatedRequest, res) => {
  try {
    const { timezone } = req.body;
    if (!timezone) {
      return res.status(400).json({ error: 'Missing timezone' });
    }

    timeEngine.setUserTimezone(timezone);
    res.json({ success: true, timezone });
  } catch (error) {
    logger.error({ error }, 'Failed to set timezone');
    res.status(500).json({ error: 'Failed to set timezone' });
  }
});

export const timeRouter = router;

