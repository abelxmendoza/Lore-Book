import { Router } from 'express';

import { logger } from '../logger';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { emotionalIntelligenceEngine } from '../services/emotionalIntelligence/emotionalEngine';
import { getAllEvents } from '../services/emotionalIntelligence/storeEvent';
import { supabaseAdmin } from '../services/supabaseClient';

const router = Router();

/**
 * POST /api/emotions/analyze
 * Analyze emotional intelligence from a journal entry
 */
router.post('/analyze', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;
    const { entry } = req.body;

    if (!entry || !entry.id) {
      return res.status(400).json({ error: 'Missing entry' });
    }

    const result = await emotionalIntelligenceEngine(entry, userId);

    res.json(result);
  } catch (error) {
    logger.error({ error }, 'Error analyzing emotional intelligence');
    res.status(500).json({ error: 'Failed to analyze emotional intelligence' });
  }
});

/**
 * GET /api/emotions/events
 * Get emotional events for user
 */
router.get('/events', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;

    const limit = parseInt(req.query.limit as string) || 100;
    const events = await getAllEvents(userId);

    res.json({ events: events.slice(0, limit) });
  } catch (error) {
    logger.error({ error }, 'Error fetching emotional events');
    res.status(500).json({ error: 'Failed to fetch emotional events' });
  }
});

/**
 * GET /api/emotions/patterns
 * Get emotional patterns for user
 */
router.get('/patterns', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;

    const { data, error } = await supabaseAdmin
      .from('emotional_patterns')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // No pattern found
        return res.json({
          dominantEmotions: [],
          recurringTriggers: [],
          reactionLoops: {},
          recoverySpeed: 0,
          volatilityScore: 0,
          emotionalBiases: {},
        });
      }
      logger.error({ error }, 'Error fetching emotional patterns');
      return res.status(500).json({ error: 'Failed to fetch emotional patterns' });
    }

    res.json({
      dominantEmotions: data.dominant_emotions || [],
      recurringTriggers: data.recurring_triggers || [],
      reactionLoops: data.reaction_loops || {},
      recoverySpeed: data.recovery_speed || 0,
      volatilityScore: data.volatility_score || 0,
      emotionalBiases: data.emotional_biases || {},
    });
  } catch (error) {
    logger.error({ error }, 'Error fetching emotional patterns');
    res.status(500).json({ error: 'Failed to fetch emotional patterns' });
  }
});

export default router;
