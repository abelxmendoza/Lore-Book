import { Router } from 'express';
import { z } from 'zod';

import { logger } from '../logger';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { ActionSpace } from '../services/personalStrategy/actionSpace';
import { DecisionRL } from '../services/personalStrategy/decisionRL';
import { RewardEngine } from '../services/personalStrategy/rewardEngine';
import { StateEncoder } from '../services/personalStrategy/stateEncoder';
import { AlignmentRegressorTrainer } from '../services/personalStrategy/supervised/trainers/trainAlignmentRegressor';
import { OutcomePredictorTrainer } from '../services/personalStrategy/supervised/trainers/trainOutcomePredictor';
import { PatternClassifierTrainer } from '../services/personalStrategy/supervised/trainers/trainPatternClassifier';

const router = Router();
const decisionRL = new DecisionRL();
const stateEncoder = new StateEncoder();
const rewardEngine = new RewardEngine();
const actionSpace = new ActionSpace();

// GET /api/strategy/state - Get current state
router.get('/state', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;
    const state = await stateEncoder.encodeCurrentState(userId);
    res.json({ state });
  } catch (error) {
    logger.error({ err: error }, 'Failed to get state');
    res.status(500).json({ error: 'Failed to get state' });
  }
});

// GET /api/strategy/recommendation - Get recommended action
router.get('/recommendation', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;
    const recommendation = await decisionRL.recommendAction(userId);
    res.json({ recommendation });
  } catch (error) {
    logger.error({ err: error }, 'Failed to get recommendation');
    res.status(500).json({ error: 'Failed to get recommendation' });
  }
});

// POST /api/strategy/action - Record action taken
const actionSchema = z.object({
  action_type: z.string(),
  outcome: z.enum(['positive', 'neutral', 'negative', 'unknown']).optional(),
  context: z.record(z.any()).optional(),
  duration_minutes: z.number().optional(),
  intensity: z.number().min(0).max(1).optional(),
});

router.post('/action', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const parsed = actionSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }

    const userId = req.user!.id;
    const { action_type, outcome = 'unknown', context, duration_minutes, intensity } = parsed.data;

    await decisionRL.recordActionOutcome(userId, {
      id: `action_${Date.now()}`,
      type: action_type as any,
      timestamp: new Date().toISOString(),
      context: context || {},
      duration_minutes,
      intensity,
      metadata: {},
    }, outcome);

    res.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, 'Failed to record action');
    res.status(500).json({ error: 'Failed to record action' });
  }
});

// PUT /api/strategy/reward-weights - Update reward weights
const weightsSchema = z.object({
  weights: z.object({
    consistency_weight: z.number().min(0).max(1).optional(),
    progress_weight: z.number().min(0).max(1).optional(),
    alignment_weight: z.number().min(0).max(1).optional(),
    anxiety_weight: z.number().min(0).max(1).optional(),
    avoidance_weight: z.number().min(0).max(1).optional(),
    growth_weight: z.number().min(0).max(1).optional(),
    relationship_weight: z.number().min(0).max(1).optional(),
  }),
});

router.put('/reward-weights', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const parsed = weightsSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }

    const userId = req.user!.id;
    await rewardEngine.updateWeights(userId, parsed.data.weights);

    res.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, 'Failed to update reward weights');
    res.status(500).json({ error: 'Failed to update reward weights' });
  }
});

// GET /api/strategy/recommendations - Get pending recommendations
router.get('/recommendations', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;
    const recommendations = await decisionRL.getPendingRecommendations(userId);
    res.json({ recommendations });
  } catch (error) {
    logger.error({ err: error }, 'Failed to get recommendations');
    res.status(500).json({ error: 'Failed to get recommendations' });
  }
});

// POST /api/strategy/recommendations/:id/act - Mark recommendation as acted upon
router.post('/recommendations/:id/act', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;
    const recommendationId = req.params.id;
    const { outcome } = req.body;

    if (!['positive', 'neutral', 'negative'].includes(outcome)) {
      return res.status(400).json({ error: 'Invalid outcome' });
    }

    await decisionRL.markRecommendationActed(userId, recommendationId, outcome);

    res.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, 'Failed to mark recommendation as acted');
    res.status(500).json({ error: 'Failed to mark recommendation as acted' });
  }
});

// GET /api/strategy/actions - Get action history
router.get('/actions', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;
    const limit = parseInt(req.query.limit as string) || 50;
    const actions = await actionSpace.getActionHistory(userId, limit);
    res.json({ actions });
  } catch (error) {
    logger.error({ err: error }, 'Failed to get action history');
    res.status(500).json({ error: 'Failed to get action history' });
  }
});

// ============================================
// SUPERVISED LEARNING TRAINING ENDPOINTS
// ============================================

// POST /api/strategy/train/pattern - Train pattern classifier
router.post('/train/pattern', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;
    const trainer = new PatternClassifierTrainer();
    const result = await trainer.train(userId);

    if (!result.success) {
      return res.status(400).json({ error: result.error || 'Training failed' });
    }

    res.json({
      success: true,
      accuracy: result.accuracy,
      metadata: result.metadata,
    });
  } catch (error) {
    logger.error({ err: error }, 'Failed to train pattern classifier');
    res.status(500).json({ error: 'Failed to train pattern classifier' });
  }
});

// POST /api/strategy/train/outcome - Train outcome predictor
router.post('/train/outcome', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;
    const trainer = new OutcomePredictorTrainer();
    const result = await trainer.train(userId);

    if (!result.success) {
      return res.status(400).json({ error: result.error || 'Training failed' });
    }

    res.json({
      success: true,
      accuracy: result.accuracy,
      metadata: result.metadata,
    });
  } catch (error) {
    logger.error({ err: error }, 'Failed to train outcome predictor');
    res.status(500).json({ error: 'Failed to train outcome predictor' });
  }
});

// POST /api/strategy/train/alignment - Train alignment regressor
router.post('/train/alignment', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;
    const trainer = new AlignmentRegressorTrainer();
    const result = await trainer.train(userId);

    if (!result.success) {
      return res.status(400).json({ error: result.error || 'Training failed' });
    }

    res.json({
      success: true,
      mse: result.mse,
      metadata: result.metadata,
    });
  } catch (error) {
    logger.error({ err: error }, 'Failed to train alignment regressor');
    res.status(500).json({ error: 'Failed to train alignment regressor' });
  }
});

// POST /api/strategy/train/all - Train all models
router.post('/train/all', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;
    const results: any = {};

    // Train pattern classifier
    try {
      const patternTrainer = new PatternClassifierTrainer();
      results.pattern = await patternTrainer.train(userId);
    } catch (error) {
      logger.warn({ error }, 'Pattern classifier training failed');
      results.pattern = { success: false, error: 'Training failed' };
    }

    // Train outcome predictor
    try {
      const outcomeTrainer = new OutcomePredictorTrainer();
      results.outcome = await outcomeTrainer.train(userId);
    } catch (error) {
      logger.warn({ error }, 'Outcome predictor training failed');
      results.outcome = { success: false, error: 'Training failed' };
    }

    // Train alignment regressor
    try {
      const alignmentTrainer = new AlignmentRegressorTrainer();
      results.alignment = await alignmentTrainer.train(userId);
    } catch (error) {
      logger.warn({ error }, 'Alignment regressor training failed');
      results.alignment = { success: false, error: 'Training failed' };
    }

    res.json({ results });
  } catch (error) {
    logger.error({ err: error }, 'Failed to train all models');
    res.status(500).json({ error: 'Failed to train models' });
  }
});

// GET /api/strategy/models/status - Get training status for all models
router.get('/models/status', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;

    const patternTrainer = new PatternClassifierTrainer();
    const outcomeTrainer = new OutcomePredictorTrainer();
    const alignmentTrainer = new AlignmentRegressorTrainer();

    const [patternStatus, outcomeStatus, alignmentStatus] = await Promise.all([
      patternTrainer.getTrainingStatus(userId),
      outcomeTrainer.getTrainingStatus(userId),
      alignmentTrainer.getTrainingStatus(userId),
    ]);

    res.json({
      pattern: patternStatus,
      outcome: outcomeStatus,
      alignment: alignmentStatus,
    });
  } catch (error) {
    logger.error({ err: error }, 'Failed to get model status');
    res.status(500).json({ error: 'Failed to get model status' });
  }
});

export const personalStrategyRouter = router;
