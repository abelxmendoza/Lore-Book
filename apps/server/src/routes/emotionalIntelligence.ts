import { Router } from 'express';
import { logger } from '../logger';
import { emotionalIntelligenceEngine } from '../services/emotionalIntelligence/emotionalEngine';
import { getAllEvents } from '../services/emotionalIntelligence/storeEvent';
import { supabaseAdmin } from '../supabaseClient';

const router = Router();

/**
 * POST /api/emotions/analyze
 * Analyze emotional intelligence from a journal entry
 */
router.post('/analyze', async (req, res) => {
  try {
    const { entry, user } = req.body;

    if (!entry || !entry.id || !user || !user.id) {
      return res.status(400).json({ error: 'Missing entry or user' });
    }

    const result = await emotionalIntelligenceEngine(entry, user.id);

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
router.get('/events', async (req, res) => {
  try {
    const userId = (req as any).user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

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
router.get('/patterns', async (req, res) => {
  try {
    const userId = (req as any).user?.id;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

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

