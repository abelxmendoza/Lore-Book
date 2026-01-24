/**
 * Bias Detection and Ethics Review API Routes
 */

import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { biasDetectionService } from '../services/biasDetection/biasDetectionService';
import { ethicsReviewService } from '../services/ethicsReview/ethicsReviewService';
import { consentTrackingService } from '../services/consentTracking/consentTrackingService';
import { memoryReliabilityService } from '../services/memoryReliability/memoryReliabilityService';
import { contextPromptingService } from '../services/contextPrompting/contextPromptingService';
import { meaningEmergenceService } from '../services/meaningEmergence/meaningEmergenceService';
import { moodBiasCorrectionService } from '../services/moodBiasCorrection/moodBiasCorrectionService';
import { signalNoiseAnalysisService } from '../services/signalNoiseAnalysis/signalNoiseAnalysisService';
import { supabaseAdmin } from '../services/supabaseClient';
import { logger } from '../logger';

const router = Router();

// ============================================================================
// Bias Detection
// ============================================================================

/**
 * GET /api/bias-ethics/bias/:entryId
 * Get bias detections for an entry
 */
router.get('/bias/:entryId', authenticate, async (req, res) => {
  try {
    const { entryId } = req.params;
    const userId = req.user!.id;

    const biases = await biasDetectionService.getBiasesForEntry(userId, entryId);

    res.json({ biases });
  } catch (error) {
    logger.error({ err: error }, 'Failed to get bias detections');
    res.status(500).json({ error: 'Failed to get bias detections' });
  }
});

/**
 * POST /api/bias-ethics/bias/detect/:entryId
 * Detect biases in an entry
 */
router.post('/bias/detect/:entryId', authenticate, async (req, res) => {
  try {
    const { entryId } = req.params;
    const userId = req.user!.id;

    // Get entry
    const { data: entry, error: entryError } = await supabaseAdmin
      .from('journal_entries')
      .select('*')
      .eq('id', entryId)
      .eq('user_id', userId)
      .single();

    if (entryError || !entry) {
      return res.status(404).json({ error: 'Entry not found' });
    }

    const result = await biasDetectionService.detectBiases(userId, entry);

    res.json(result);
  } catch (error) {
    logger.error({ err: error }, 'Failed to detect biases');
    res.status(500).json({ error: 'Failed to detect biases' });
  }
});

/**
 * GET /api/bias-ethics/bias
 * Get all bias detections for user
 */
router.get('/bias', authenticate, async (req, res) => {
  try {
    const userId = req.user!.id;
    const limit = parseInt(req.query.limit as string) || 50;

    const biases = await biasDetectionService.getUserBiases(userId, limit);

    res.json({ biases });
  } catch (error) {
    logger.error({ err: error }, 'Failed to get user biases');
    res.status(500).json({ error: 'Failed to get user biases' });
  }
});

// ============================================================================
// Ethics Review
// ============================================================================

/**
 * GET /api/bias-ethics/ethics/:entryId
 * Get ethics review for an entry
 */
router.get('/ethics/:entryId', authenticate, async (req, res) => {
  try {
    const { entryId } = req.params;
    const userId = req.user!.id;

    const review = await ethicsReviewService.getReviewForEntry(userId, entryId);

    if (!review) {
      return res.status(404).json({ error: 'Review not found' });
    }

    res.json({ review });
  } catch (error) {
    logger.error({ err: error }, 'Failed to get ethics review');
    res.status(500).json({ error: 'Failed to get ethics review' });
  }
});

/**
 * POST /api/bias-ethics/ethics/review/:entryId
 * Review an entry for ethics
 */
router.post('/ethics/review/:entryId', authenticate, async (req, res) => {
  try {
    const { entryId } = req.params;
    const userId = req.user!.id;

    // Get entry
    const { data: entry, error: entryError } = await supabaseAdmin
      .from('journal_entries')
      .select('*')
      .eq('id', entryId)
      .eq('user_id', userId)
      .single();

    if (entryError || !entry) {
      return res.status(404).json({ error: 'Entry not found' });
    }

    const review = await ethicsReviewService.reviewEntry(userId, entry);

    res.json({ review });
  } catch (error) {
    logger.error({ err: error }, 'Failed to review entry');
    res.status(500).json({ error: 'Failed to review entry' });
  }
});

/**
 * PUT /api/bias-ethics/ethics/:reviewId/status
 * Update review status
 */
router.put('/ethics/:reviewId/status', authenticate, async (req, res) => {
  try {
    const { reviewId } = req.params;
    const { status, notes } = req.body;
    const userId = req.user!.id;

    if (!['pending', 'reviewed', 'action_taken', 'approved'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const review = await ethicsReviewService.updateReviewStatus(
      userId,
      reviewId,
      status,
      notes
    );

    res.json({ review });
  } catch (error) {
    logger.error({ err: error }, 'Failed to update review status');
    res.status(500).json({ error: 'Failed to update review status' });
  }
});

/**
 * GET /api/bias-ethics/ethics/pending
 * Get pending reviews
 */
router.get('/ethics/pending', authenticate, async (req, res) => {
  try {
    const userId = req.user!.id;

    const reviews = await ethicsReviewService.getPendingReviews(userId);

    res.json({ reviews });
  } catch (error) {
    logger.error({ err: error }, 'Failed to get pending reviews');
    res.status(500).json({ error: 'Failed to get pending reviews' });
  }
});

// ============================================================================
// Consent Tracking
// ============================================================================

/**
 * POST /api/bias-ethics/consent
 * Record consent
 */
router.post('/consent', authenticate, async (req, res) => {
  try {
    const {
      subjectName,
      consentType,
      status,
      subjectEntityId,
      consentDate,
      expirationDate,
      conditions,
      metadata,
    } = req.body;

    const userId = req.user!.id;

    if (!subjectName || !consentType || !status) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const consent = await consentTrackingService.recordConsent(
      userId,
      subjectName,
      consentType,
      status,
      {
        subjectEntityId,
        consentDate,
        expirationDate,
        conditions,
        metadata,
      }
    );

    res.json({ consent });
  } catch (error) {
    logger.error({ err: error }, 'Failed to record consent');
    res.status(500).json({ error: 'Failed to record consent' });
  }
});

/**
 * GET /api/bias-ethics/consent
 * Get consent records
 */
router.get('/consent', authenticate, async (req, res) => {
  try {
    const userId = req.user!.id;
    const status = req.query.status as string | undefined;

    const consents = await consentTrackingService.getUserConsents(userId, status as any);

    res.json({ consents });
  } catch (error) {
    logger.error({ err: error }, 'Failed to get consents');
    res.status(500).json({ error: 'Failed to get consents' });
  }
});

/**
 * GET /api/bias-ethics/consent/check/:entryId
 * Check if entry can be published
 */
router.get('/consent/check/:entryId', authenticate, async (req, res) => {
  try {
    const { entryId } = req.params;
    const userId = req.user!.id;

    const result = await consentTrackingService.canPublishEntry(userId, entryId);

    res.json(result);
  } catch (error) {
    logger.error({ err: error }, 'Failed to check publication consent');
    res.status(500).json({ error: 'Failed to check publication consent' });
  }
});

/**
 * PUT /api/bias-ethics/consent/:consentId/revoke
 * Revoke consent
 */
router.put('/consent/:consentId/revoke', authenticate, async (req, res) => {
  try {
    const { consentId } = req.params;
    const userId = req.user!.id;

    const consent = await consentTrackingService.revokeConsent(userId, consentId);

    res.json({ consent });
  } catch (error) {
    logger.error({ err: error }, 'Failed to revoke consent');
    res.status(500).json({ error: 'Failed to revoke consent' });
  }
});

// ============================================================================
// Memory Reliability
// ============================================================================

/**
 * GET /api/bias-ethics/reliability/:entryId
 * Get reliability score for an entry
 */
router.get('/reliability/:entryId', authenticate, async (req, res) => {
  try {
    const { entryId } = req.params;
    const userId = req.user!.id;

    const score = await memoryReliabilityService.getReliabilityScore(userId, entryId);

    if (!score) {
      return res.status(404).json({ error: 'Reliability score not found' });
    }

    res.json({ score });
  } catch (error) {
    logger.error({ err: error }, 'Failed to get reliability score');
    res.status(500).json({ error: 'Failed to get reliability score' });
  }
});

/**
 * POST /api/bias-ethics/reliability/calculate/:entryId
 * Calculate reliability score for an entry
 */
router.post('/reliability/calculate/:entryId', authenticate, async (req, res) => {
  try {
    const { entryId } = req.params;
    const userId = req.user!.id;

    // Get entry
    const { data: entry, error: entryError } = await supabaseAdmin
      .from('journal_entries')
      .select('*')
      .eq('id', entryId)
      .eq('user_id', userId)
      .single();

    if (entryError || !entry) {
      return res.status(404).json({ error: 'Entry not found' });
    }

    const score = await memoryReliabilityService.calculateReliability(userId, entry);

    res.json({ score });
  } catch (error) {
    logger.error({ err: error }, 'Failed to calculate reliability');
    res.status(500).json({ error: 'Failed to calculate reliability' });
  }
});

// ============================================================================
// Context Prompting
// ============================================================================

/**
 * GET /api/bias-ethics/context/:entryId
 * Get context prompt for an entry
 */
router.get('/context/:entryId', authenticate, async (req, res) => {
  try {
    const { entryId } = req.params;
    const userId = req.user!.id;

    const prompt = await contextPromptingService.getPromptForEntry(userId, entryId);

    if (!prompt) {
      return res.status(404).json({ error: 'Context prompt not found' });
    }

    res.json({ prompt });
  } catch (error) {
    logger.error({ err: error }, 'Failed to get context prompt');
    res.status(500).json({ error: 'Failed to get context prompt' });
  }
});

/**
 * POST /api/bias-ethics/context/analyze/:entryId
 * Analyze entry for missing context
 */
router.post('/context/analyze/:entryId', authenticate, async (req, res) => {
  try {
    const { entryId } = req.params;
    const userId = req.user!.id;

    // Get entry
    const { data: entry, error: entryError } = await supabaseAdmin
      .from('journal_entries')
      .select('*')
      .eq('id', entryId)
      .eq('user_id', userId)
      .single();

    if (entryError || !entry) {
      return res.status(404).json({ error: 'Entry not found' });
    }

    const prompt = await contextPromptingService.analyzeEntry(userId, entry);

    if (!prompt) {
      return res.json({ prompt: null, message: 'No missing context detected' });
    }

    res.json({ prompt });
  } catch (error) {
    logger.error({ err: error }, 'Failed to analyze context');
    res.status(500).json({ error: 'Failed to analyze context' });
  }
});

/**
 * PUT /api/bias-ethics/context/:promptId/answered
 * Mark context prompt as answered
 */
router.put('/context/:promptId/answered', authenticate, async (req, res) => {
  try {
    const { promptId } = req.params;
    const userId = req.user!.id;

    const prompt = await contextPromptingService.markAnswered(userId, promptId);

    res.json({ prompt });
  } catch (error) {
    logger.error({ err: error }, 'Failed to mark prompt as answered');
    res.status(500).json({ error: 'Failed to mark prompt as answered' });
  }
});

/**
 * GET /api/bias-ethics/context/pending
 * Get pending context prompts
 */
router.get('/context/pending', authenticate, async (req, res) => {
  try {
    const userId = req.user!.id;

    const prompts = await contextPromptingService.getPendingPrompts(userId);

    res.json({ prompts });
  } catch (error) {
    logger.error({ err: error }, 'Failed to get pending prompts');
    res.status(500).json({ error: 'Failed to get pending prompts' });
  }
});

// ============================================================================
// Meaning Emergence
// ============================================================================

/**
 * GET /api/bias-ethics/meaning/:entryId
 * Get meaning emergence tracking for an entry
 */
router.get('/meaning/:entryId', authenticate, async (req, res) => {
  try {
    const { entryId } = req.params;
    const userId = req.user!.id;

    const meaning = await meaningEmergenceService.getMeaningForEntry(userId, entryId);

    if (!meaning) {
      return res.status(404).json({ error: 'Meaning tracking not found' });
    }

    const timeToMeaning = await meaningEmergenceService.calculateTimeToMeaning(userId, entryId);

    res.json({ meaning, time_to_meaning_days: timeToMeaning });
  } catch (error) {
    logger.error({ err: error }, 'Failed to get meaning');
    res.status(500).json({ error: 'Failed to get meaning' });
  }
});

/**
 * POST /api/bias-ethics/meaning/track/:entryId
 * Track meaning emergence for an entry
 */
router.post('/meaning/track/:entryId', authenticate, async (req, res) => {
  try {
    const { entryId } = req.params;
    const userId = req.user!.id;

    // Get entry
    const { data: entry, error: entryError } = await supabaseAdmin
      .from('journal_entries')
      .select('*')
      .eq('id', entryId)
      .eq('user_id', userId)
      .single();

    if (entryError || !entry) {
      return res.status(404).json({ error: 'Entry not found' });
    }

    const meaning = await meaningEmergenceService.trackMeaning(userId, entry);

    res.json({ meaning });
  } catch (error) {
    logger.error({ err: error }, 'Failed to track meaning');
    res.status(500).json({ error: 'Failed to track meaning' });
  }
});

/**
 * POST /api/bias-ethics/meaning/recognize/:entryId
 * Record when meaning was recognized
 */
router.post('/meaning/recognize/:entryId', authenticate, async (req, res) => {
  try {
    const { entryId } = req.params;
    const { interpretation, significance } = req.body;
    const userId = req.user!.id;

    if (!interpretation || significance === undefined) {
      return res.status(400).json({ error: 'Missing interpretation or significance' });
    }

    const meaning = await meaningEmergenceService.recordMeaningRecognition(
      userId,
      entryId,
      interpretation,
      significance
    );

    res.json({ meaning });
  } catch (error) {
    logger.error({ err: error }, 'Failed to record meaning recognition');
    res.status(500).json({ error: 'Failed to record meaning recognition' });
  }
});

/**
 * GET /api/bias-ethics/meaning/significant
 * Get entries with high significance
 */
router.get('/meaning/significant', authenticate, async (req, res) => {
  try {
    const userId = req.user!.id;
    const threshold = parseFloat(req.query.threshold as string) || 0.7;
    const limit = parseInt(req.query.limit as string) || 20;

    const meanings = await meaningEmergenceService.getHighSignificanceEntries(
      userId,
      threshold,
      limit
    );

    res.json({ meanings });
  } catch (error) {
    logger.error({ err: error }, 'Failed to get significant entries');
    res.status(500).json({ error: 'Failed to get significant entries' });
  }
});

// ============================================================================
// Mood Bias Correction
// ============================================================================

/**
 * GET /api/bias-ethics/mood-bias
 * Analyze mood bias in recent entries
 */
router.get('/mood-bias', authenticate, async (req, res) => {
  try {
    const userId = req.user!.id;
    const days = parseInt(req.query.days as string) || 30;

    const analysis = await moodBiasCorrectionService.analyzeMoodBias(userId, days);

    res.json({ analysis });
  } catch (error) {
    logger.error({ err: error }, 'Failed to analyze mood bias');
    res.status(500).json({ error: 'Failed to analyze mood bias' });
  }
});

/**
 * GET /api/bias-ethics/mood-bias/distribution
 * Get mood distribution over time
 */
router.get('/mood-bias/distribution', authenticate, async (req, res) => {
  try {
    const userId = req.user!.id;
    const days = parseInt(req.query.days as string) || 30;

    const distribution = await moodBiasCorrectionService.getMoodDistribution(userId, days);

    res.json({ distribution });
  } catch (error) {
    logger.error({ err: error }, 'Failed to get mood distribution');
    res.status(500).json({ error: 'Failed to get mood distribution' });
  }
});

// ============================================================================
// Signal-to-Noise Analysis
// ============================================================================

/**
 * GET /api/bias-ethics/signal-noise
 * Analyze signal-to-noise ratio
 */
router.get('/signal-noise', authenticate, async (req, res) => {
  try {
    const userId = req.user!.id;
    const days = parseInt(req.query.days as string) || 90;

    const analysis = await signalNoiseAnalysisService.analyzeSignalNoise(userId, days);

    res.json({ analysis });
  } catch (error) {
    logger.error({ err: error }, 'Failed to analyze signal-to-noise');
    res.status(500).json({ error: 'Failed to analyze signal-to-noise' });
  }
});

/**
 * GET /api/bias-ethics/themes
 * Extract themes from entries
 */
router.get('/themes', authenticate, async (req, res) => {
  try {
    const userId = req.user!.id;
    const days = parseInt(req.query.days as string) || 90;

    const themes = await signalNoiseAnalysisService.extractThemesWithTimeSpan(userId, days);

    res.json({ themes });
  } catch (error) {
    logger.error({ err: error }, 'Failed to extract themes');
    res.status(500).json({ error: 'Failed to extract themes' });
  }
});

export default router;
