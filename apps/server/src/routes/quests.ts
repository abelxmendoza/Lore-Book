import { Router } from 'express';
import { z } from 'zod';

import { logger } from '../logger';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { questService, questStorage, questLinker, questExtractor } from '../services/quests';
import { supabaseAdmin } from '../services/supabaseClient';

const router = Router();

/**
 * GET /api/quests
 * List quests with filters
 */
router.get('/', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { status, quest_type, category, tags, min_priority, min_importance, min_impact, search, limit, offset } = req.query;

    const filters: any = {};
    if (status) filters.status = status;
    if (quest_type) filters.quest_type = quest_type;
    if (category) filters.category = category;
    if (tags) filters.tags = Array.isArray(tags) ? tags : [tags];
    if (min_priority) filters.min_priority = parseInt(min_priority as string, 10);
    if (min_importance) filters.min_importance = parseInt(min_importance as string, 10);
    if (min_impact) filters.min_impact = parseInt(min_impact as string, 10);
    if (search) filters.search = search;
    if (limit) filters.limit = parseInt(limit as string, 10);
    if (offset) filters.offset = parseInt(offset as string, 10);

    const quests = await questStorage.getQuests(req.user!.id, filters);
    res.json({ quests, count: quests.length });
  } catch (error) {
    logger.error({ err: error }, 'Failed to get quests');
    res.status(500).json({ error: 'Failed to get quests' });
  }
});

/**
 * GET /api/quests/:id
 * Get quest details
 */
router.get('/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const quest = await questStorage.getQuest(req.user!.id, id);

    if (!quest) {
      return res.status(404).json({ error: 'Quest not found' });
    }

    // Get history
    const history = await questStorage.getQuestHistory(req.user!.id, id);

    // Get dependencies
    const dependencies = await questStorage.getDependencies(id);

    res.json({ quest, history, dependencies });
  } catch (error) {
    logger.error({ err: error }, 'Failed to get quest');
    res.status(500).json({ error: 'Failed to get quest' });
  }
});

/**
 * POST /api/quests
 * Create quest
 */
const createQuestSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  quest_type: z.enum(['main', 'side', 'daily', 'achievement']),
  priority: z.number().min(1).max(10).optional(),
  importance: z.number().min(1).max(10).optional(),
  impact: z.number().min(1).max(10).optional(),
  difficulty: z.number().min(1).max(10).optional(),
  effort_hours: z.number().optional(),
  related_goal_id: z.string().uuid().optional(),
  related_task_id: z.string().uuid().optional(),
  parent_quest_id: z.string().uuid().optional(),
  quest_chain_id: z.string().optional(),
  milestones: z.array(z.object({
    description: z.string(),
    target_date: z.string().optional(),
  })).optional(),
  reward_description: z.string().optional(),
  motivation_notes: z.string().optional(),
  estimated_completion_date: z.string().optional(),
  tags: z.array(z.string()).optional(),
  category: z.string().optional(),
  metadata: z.record(z.any()).optional(),
});

router.post('/', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const parsed = createQuestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid request', details: parsed.error });
    }

    const quest = await questService.createQuest(req.user!.id, parsed.data);
    res.json({ quest });
  } catch (error) {
    logger.error({ err: error }, 'Failed to create quest');
    res.status(500).json({ error: 'Failed to create quest' });
  }
});

/**
 * PUT /api/quests/:id
 * Update quest
 */
const updateQuestSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  quest_type: z.enum(['main', 'side', 'daily', 'achievement']).optional(),
  priority: z.number().min(1).max(10).optional(),
  importance: z.number().min(1).max(10).optional(),
  impact: z.number().min(1).max(10).optional(),
  difficulty: z.number().min(1).max(10).optional(),
  effort_hours: z.number().optional(),
  status: z.enum(['active', 'paused', 'completed', 'abandoned', 'archived']).optional(),
  progress_percentage: z.number().min(0).max(100).optional(),
  milestones: z.array(z.any()).optional(),
  reward_description: z.string().optional(),
  motivation_notes: z.string().optional(),
  estimated_completion_date: z.string().optional(),
  time_spent_hours: z.number().optional(),
  tags: z.array(z.string()).optional(),
  category: z.string().optional(),
  completion_notes: z.string().optional(),
  metadata: z.record(z.any()).optional(),
});

router.put('/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const parsed = updateQuestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid request', details: parsed.error });
    }

    const quest = await questService.updateQuest(req.user!.id, id, parsed.data);
    res.json({ quest });
  } catch (error) {
    logger.error({ err: error }, 'Failed to update quest');
    res.status(500).json({ error: 'Failed to update quest' });
  }
});

/**
 * DELETE /api/quests/:id
 * Delete quest
 */
router.delete('/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    await questStorage.deleteQuest(req.user!.id, id);
    res.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, 'Failed to delete quest');
    res.status(500).json({ error: 'Failed to delete quest' });
  }
});

/**
 * POST /api/quests/:id/start
 * Start a quest
 */
router.post('/:id/start', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const quest = await questService.startQuest(req.user!.id, id);
    res.json({ quest });
  } catch (error) {
    logger.error({ err: error }, 'Failed to start quest');
    res.status(500).json({ error: 'Failed to start quest' });
  }
});

/**
 * POST /api/quests/:id/complete
 * Complete a quest
 */
router.post('/:id/complete', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const { notes } = req.body;
    const quest = await questService.completeQuest(req.user!.id, id, notes);
    res.json({ quest });
  } catch (error) {
    logger.error({ err: error }, 'Failed to complete quest');
    res.status(500).json({ error: 'Failed to complete quest' });
  }
});

/**
 * POST /api/quests/:id/abandon
 * Abandon a quest
 */
router.post('/:id/abandon', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const quest = await questService.abandonQuest(req.user!.id, id, reason);
    res.json({ quest });
  } catch (error) {
    logger.error({ err: error }, 'Failed to abandon quest');
    res.status(500).json({ error: 'Failed to abandon quest' });
  }
});

/**
 * POST /api/quests/:id/pause
 * Pause a quest
 */
router.post('/:id/pause', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const quest = await questService.pauseQuest(req.user!.id, id);
    res.json({ quest });
  } catch (error) {
    logger.error({ err: error }, 'Failed to pause quest');
    res.status(500).json({ error: 'Failed to pause quest' });
  }
});

/**
 * POST /api/quests/:id/progress
 * Update progress
 */
router.post('/:id/progress', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const { progress } = req.body;

    if (typeof progress !== 'number' || progress < 0 || progress > 100) {
      return res.status(400).json({ error: 'Progress must be a number between 0 and 100' });
    }

    const quest = await questService.updateProgress(req.user!.id, id, progress);
    res.json({ quest });
  } catch (error) {
    logger.error({ err: error }, 'Failed to update progress');
    res.status(500).json({ error: 'Failed to update progress' });
  }
});

/**
 * POST /api/quests/:id/reflect
 * Add reflection
 */
router.post('/:id/reflect', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const { reflection } = req.body;

    if (!reflection || typeof reflection !== 'string') {
      return res.status(400).json({ error: 'Reflection text is required' });
    }

    const historyEvent = await questService.addReflection(req.user!.id, id, reflection);
    res.json({ history: historyEvent });
  } catch (error) {
    logger.error({ err: error }, 'Failed to add reflection');
    res.status(500).json({ error: 'Failed to add reflection' });
  }
});

/**
 * POST /api/quests/:id/dependencies
 * Add dependency
 */
router.post('/:id/dependencies', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const { depends_on_quest_id, dependency_type } = req.body;

    if (!depends_on_quest_id) {
      return res.status(400).json({ error: 'depends_on_quest_id is required' });
    }

    await questStorage.addDependency(id, depends_on_quest_id, dependency_type || 'blocks');
    res.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, 'Failed to add dependency');
    res.status(500).json({ error: 'Failed to add dependency' });
  }
});

/**
 * GET /api/quests/:id/chain
 * Get quest chain
 */
router.get('/:id/chain', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const quest = await questStorage.getQuest(req.user!.id, id);

    if (!quest) {
      return res.status(404).json({ error: 'Quest not found' });
    }

    // Get all quests in the chain
    const chainQuests = quest.quest_chain_id
      ? await questStorage.getQuests(req.user!.id, {})
          .then(quests => quests.filter(q => q.quest_chain_id === quest.quest_chain_id))
      : [quest];

    // Get dependencies
    const dependencies = await questStorage.getDependencies(id);
    const dependentQuests = await questStorage.getDependentQuests(id);

    res.json({ quest, chain: chainQuests, dependencies, dependent_quests: dependentQuests });
  } catch (error) {
    logger.error({ err: error }, 'Failed to get quest chain');
    res.status(500).json({ error: 'Failed to get quest chain' });
  }
});

/**
 * POST /api/quests/:id/link-goal
 * Link to goal
 */
router.post('/:id/link-goal', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const { goal_id } = req.body;

    if (!goal_id) {
      return res.status(400).json({ error: 'goal_id is required' });
    }

    await questLinker.linkQuestToGoal(req.user!.id, id, goal_id);
    res.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, 'Failed to link quest to goal');
    res.status(500).json({ error: 'Failed to link quest to goal' });
  }
});

/**
 * POST /api/quests/:id/link-task
 * Link to task
 */
router.post('/:id/link-task', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const { task_id } = req.body;

    if (!task_id) {
      return res.status(400).json({ error: 'task_id is required' });
    }

    await questLinker.linkQuestToTask(req.user!.id, id, task_id);
    res.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, 'Failed to link quest to task');
    res.status(500).json({ error: 'Failed to link quest to task' });
  }
});

/**
 * GET /api/quests/completed
 * Get completed quests
 */
router.get('/completed', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { limit, offset } = req.query;
    const quests = await questStorage.getQuests(req.user!.id, {
      status: 'completed',
      limit: limit ? parseInt(limit as string, 10) : undefined,
      offset: offset ? parseInt(offset as string, 10) : undefined,
    });
    res.json({ quests, count: quests.length });
  } catch (error) {
    logger.error({ err: error }, 'Failed to get completed quests');
    res.status(500).json({ error: 'Failed to get completed quests' });
  }
});

/**
 * GET /api/quests/:id/history
 * Get quest history
 */
router.get('/:id/history', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const history = await questStorage.getQuestHistory(req.user!.id, id);
    res.json({ history, count: history.length });
  } catch (error) {
    logger.error({ err: error }, 'Failed to get quest history');
    res.status(500).json({ error: 'Failed to get quest history' });
  }
});

/**
 * GET /api/quests/board
 * Get quest board (organized view)
 */
router.get('/board', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const board = await questService.getQuestBoard(req.user!.id);
    res.json(board);
  } catch (error) {
    logger.error({ err: error }, 'Failed to get quest board');
    res.status(500).json({ error: 'Failed to get quest board' });
  }
});

/**
 * GET /api/quests/analytics
 * Get quest analytics
 */
router.get('/analytics', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const analytics = await questService.getQuestAnalytics(req.user!.id);
    res.json(analytics);
  } catch (error) {
    logger.error({ err: error }, 'Failed to get quest analytics');
    res.status(500).json({ error: 'Failed to get quest analytics' });
  }
});

/**
 * GET /api/quests/suggestions
 * Get AI suggestions
 */
router.get('/suggestions', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    // Get recent journal entries
    const { data: entries } = await supabaseAdmin
      .from('journal_entries')
      .select('*')
      .eq('user_id', req.user!.id)
      .order('date', { ascending: false })
      .limit(50);

    const suggestions = await questExtractor.extractQuests(req.user!.id, entries || []);
    res.json({ suggestions, count: suggestions.length });
  } catch (error) {
    logger.error({ err: error }, 'Failed to get quest suggestions');
    res.status(500).json({ error: 'Failed to get quest suggestions' });
  }
});

export const questRouter = router;
