/**
 * LORE-KEEPER GOAL TRACKING & VALUE ALIGNMENT ENGINE (GVAE)
 * API Routes
 */

import { Router } from 'express';

import { logger } from '../logger';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { goalValueAlignmentService } from '../services/goalValueAlignmentService';

const router = Router();

/**
 * POST /api/values
 * Declare a value
 */
router.post('/values', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { name, description, priority } = req.body;

    if (!name || !description) {
      return res.status(400).json({ error: 'name and description are required' });
    }

    const value = await goalValueAlignmentService.declareValue(req.user!.id, {
      name,
      description,
      priority,
    });

    res.json({ value });
  } catch (error) {
    logger.error({ err: error }, 'Failed to declare value');
    res.status(500).json({ error: 'Failed to declare value' });
  }
});

/**
 * GET /api/values
 * Get values for user
 */
router.get('/values', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { active_only } = req.query;
    const activeOnly = active_only !== 'false';

    const values = await goalValueAlignmentService.getValues(req.user!.id, activeOnly);

    res.json({ values, count: values.length });
  } catch (error) {
    logger.error({ err: error }, 'Failed to get values');
    res.status(500).json({ error: 'Failed to get values' });
  }
});

/**
 * POST /api/goals/values/extract
 * Extract values from user conversations
 */
router.post('/values/extract', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const values = await goalValueAlignmentService.extractValuesFromConversations(req.user!.id);
    res.json({ values, count: values.length });
  } catch (error) {
    logger.error({ err: error }, 'Failed to extract values');
    res.status(500).json({ error: 'Failed to extract values' });
  }
});

/**
 * PATCH /api/values/:id/priority
 * Update value priority
 */
router.patch('/values/:id/priority', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const { priority } = req.body;

    if (priority === undefined || priority < 0 || priority > 1) {
      return res.status(400).json({ error: 'priority must be between 0.0 and 1.0' });
    }

    const value = await goalValueAlignmentService.updateValuePriority(
      req.user!.id,
      id,
      priority
    );

    res.json({ value });
  } catch (error) {
    logger.error({ err: error }, 'Failed to update value priority');
    res.status(500).json({ error: 'Failed to update value priority' });
  }
});

/**
 * POST /api/goals
 * Declare a goal
 */
router.post('/goals', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { title, description, goal_type, related_value_ids, target_timeframe, confidence } = req.body;

    if (!title || !description || !goal_type || !target_timeframe) {
      return res.status(400).json({ error: 'title, description, goal_type, and target_timeframe are required' });
    }

    const goal = await goalValueAlignmentService.declareGoal(req.user!.id, {
      title,
      description,
      goal_type,
      related_value_ids,
      target_timeframe,
      confidence,
    });

    res.json({ goal });
  } catch (error) {
    logger.error({ err: error }, 'Failed to declare goal');
    res.status(500).json({ error: 'Failed to declare goal' });
  }
});

/**
 * GET /api/goals
 * Get goals for user
 */
router.get('/goals', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { status, goal_type, limit } = req.query;

    const filters: any = {};
    if (status) filters.status = status;
    if (goal_type) filters.goal_type = goal_type;
    if (limit) filters.limit = parseInt(limit as string, 10);

    const goals = await goalValueAlignmentService.getGoals(req.user!.id, filters);

    res.json({ goals, count: goals.length });
  } catch (error) {
    logger.error({ err: error }, 'Failed to get goals');
    res.status(500).json({ error: 'Failed to get goals' });
  }
});

/**
 * GET /api/goals/:id
 * Get goal with alignment data
 */
router.get('/goals/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const goalWithAlignment = await goalValueAlignmentService.getGoalWithAlignment(
      req.user!.id,
      id
    );

    if (!goalWithAlignment) {
      return res.status(404).json({ error: 'Goal not found' });
    }

    res.json(goalWithAlignment);
  } catch (error) {
    logger.error({ err: error }, 'Failed to get goal with alignment');
    res.status(500).json({ error: 'Failed to get goal with alignment' });
  }
});

/**
 * PATCH /api/goals/:id/status
 * Update goal status
 */
router.patch('/goals/:id/status', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!status || !['ACTIVE', 'PAUSED', 'COMPLETED', 'ABANDONED'].includes(status)) {
      return res.status(400).json({ error: 'status must be ACTIVE, PAUSED, COMPLETED, or ABANDONED' });
    }

    const goal = await goalValueAlignmentService.updateGoalStatus(
      req.user!.id,
      id,
      status
    );

    res.json({ goal });
  } catch (error) {
    logger.error({ err: error }, 'Failed to update goal status');
    res.status(500).json({ error: 'Failed to update goal status' });
  }
});

/**
 * POST /api/goals/:id/evaluate
 * Evaluate goal signals
 */
router.post('/goals/:id/evaluate', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const signals = await goalValueAlignmentService.evaluateGoalSignals(req.user!.id, id);

    res.json({ signals, count: signals.length });
  } catch (error) {
    logger.error({ err: error }, 'Failed to evaluate goal signals');
    res.status(500).json({ error: 'Failed to evaluate goal signals' });
  }
});

/**
 * POST /api/goals/:id/alignment
 * Compute alignment for a goal
 */
router.post('/goals/:id/alignment', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const snapshot = await goalValueAlignmentService.computeAlignment(req.user!.id, id);

    res.json({ snapshot });
  } catch (error) {
    logger.error({ err: error }, 'Failed to compute alignment');
    res.status(500).json({ error: 'Failed to compute alignment' });
  }
});

/**
 * GET /api/goals/:id/drift
 * Detect goal drift
 */
router.get('/goals/:id/drift', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const drift = await goalValueAlignmentService.detectGoalDrift(req.user!.id, id);

    if (!drift) {
      return res.json({ drift: null, message: 'No drift detected' });
    }

    res.json({ drift });
  } catch (error) {
    logger.error({ err: error }, 'Failed to detect goal drift');
    res.status(500).json({ error: 'Failed to detect goal drift' });
  }
});

/**
 * POST /api/goals/values/evolve
 * Evolve values based on conversations (re-rank, update priorities, detect new values)
 */
router.post('/values/evolve', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const result = await goalValueAlignmentService.evolveValues(req.user!.id);
    res.json(result);
  } catch (error) {
    logger.error({ err: error }, 'Failed to evolve values');
    res.status(500).json({ error: 'Failed to evolve values' });
  }
});

/**
 * GET /api/goals/values/:id/evolution
 * Get evolution history for a value
 */
router.get('/values/:id/evolution', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const { limit } = req.query;

    const history = await goalValueAlignmentService.getValueEvolutionHistory(
      req.user!.id,
      id,
      limit ? parseInt(limit as string, 10) : 50
    );

    res.json({ history });
  } catch (error) {
    logger.error({ err: error }, 'Failed to get value evolution history');
    res.status(500).json({ error: 'Failed to get value evolution history' });
  }
});

/**
 * GET /api/goals/values/:id/priority-history
 * Get priority history for a value
 */
router.get('/values/:id/priority-history', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const { limit } = req.query;

    const history = await goalValueAlignmentService.getValuePriorityHistory(
      req.user!.id,
      id,
      limit ? parseInt(limit as string, 10) : 100
    );

    res.json({ history });
  } catch (error) {
    logger.error({ err: error }, 'Failed to get value priority history');
    res.status(500).json({ error: 'Failed to get value priority history' });
  }
});

export const goalsRouter = router;
