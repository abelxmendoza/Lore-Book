import { Router } from 'express';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth';
import { reactionService, type CreateReactionInput, type UpdateReactionInput } from '../services/reactionService';
import { logger } from '../logger';
import { z } from 'zod';

const router = Router();

const createReactionSchema = z.object({
  trigger_type: z.enum(['memory', 'perception']),
  trigger_id: z.string().uuid(),
  reaction_type: z.enum(['emotional', 'behavioral', 'cognitive', 'physical']),
  reaction_label: z.string().min(1),
  intensity: z.number().min(0).max(1).optional(),
  duration: z.string().optional(),
  description: z.string().optional(),
  automatic: z.boolean().optional().default(true),
  coping_response: z.string().optional(),
  timestamp_started: z.string().datetime().optional(),
  timestamp_resolved: z.string().datetime().optional().nullable()
});

const updateReactionSchema = createReactionSchema.partial().extend({
  trigger_type: z.enum(['memory', 'perception']).optional(),
  trigger_id: z.string().uuid().optional(),
  timestamp_resolved: z.string().datetime().nullable().optional()
});

/**
 * Create a new reaction entry
 */
router.post('/', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const parsed = createReactionSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid reaction data', details: parsed.error.flatten() });
    }

    const userId = req.user!.id;
    const reaction = await reactionService.createReaction(userId, parsed.data);

    res.status(201).json({ reaction });
  } catch (error) {
    logger.error({ err: error }, 'Failed to create reaction entry');
    res.status(500).json({ error: 'Failed to create reaction entry' });
  }
});

/**
 * Get reaction entries
 */
router.get('/', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;
    const {
      trigger_type,
      trigger_id,
      reaction_type,
      reaction_label,
      limit,
      offset
    } = req.query;

    const filters: {
      trigger_type?: any;
      trigger_id?: string;
      reaction_type?: any;
      reaction_label?: string;
      limit?: number;
      offset?: number;
    } = {};

    if (trigger_type && typeof trigger_type === 'string') {
      filters.trigger_type = trigger_type as any;
    }
    if (trigger_id && typeof trigger_id === 'string') {
      filters.trigger_id = trigger_id;
    }
    if (reaction_type && typeof reaction_type === 'string') {
      filters.reaction_type = reaction_type as any;
    }
    if (reaction_label && typeof reaction_label === 'string') {
      filters.reaction_label = reaction_label;
    }
    if (limit) {
      filters.limit = parseInt(limit as string, 10);
    }
    if (offset) {
      filters.offset = parseInt(offset as string, 10);
    }

    const reactions = await reactionService.getReactions(userId, filters);

    res.json({ reactions });
  } catch (error) {
    logger.error({ err: error }, 'Failed to get reaction entries');
    res.status(500).json({ error: 'Failed to get reaction entries' });
  }
});

/**
 * Get reactions for a specific trigger
 */
router.get('/trigger/:triggerType/:triggerId', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;
    const { triggerType, triggerId } = req.params;

    if (triggerType !== 'memory' && triggerType !== 'perception') {
      return res.status(400).json({ error: 'Invalid trigger type' });
    }

    const reactions = await reactionService.getReactionsForTrigger(
      userId,
      triggerType as any,
      triggerId
    );

    res.json({ reactions });
  } catch (error) {
    logger.error({ err: error }, 'Failed to get reactions for trigger');
    res.status(500).json({ error: 'Failed to get reactions for trigger' });
  }
});

/**
 * Get reaction patterns (for therapist mode)
 */
router.get('/patterns', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;
    const patterns = await reactionService.getReactionPatterns(userId);
    res.json({ patterns });
  } catch (error) {
    logger.error({ err: error }, 'Failed to get reaction patterns');
    res.status(500).json({ error: 'Failed to get reaction patterns' });
  }
});

/**
 * Update a reaction entry
 */
router.patch('/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const parsed = updateReactionSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid reaction data', details: parsed.error.flatten() });
    }

    const userId = req.user!.id;
    const { id } = req.params;

    const reaction = await reactionService.updateReaction(userId, id, parsed.data);

    res.json({ reaction });
  } catch (error) {
    logger.error({ err: error }, 'Failed to update reaction entry');
    res.status(500).json({ error: 'Failed to update reaction entry' });
  }
});

/**
 * Delete a reaction entry
 */
router.delete('/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;

    await reactionService.deleteReaction(userId, id);

    res.status(204).send();
  } catch (error) {
    logger.error({ err: error }, 'Failed to delete reaction entry');
    res.status(500).json({ error: 'Failed to delete reaction entry' });
  }
});

export default router;
