import { Router } from 'express';
import { z } from 'zod';

import { logger } from '../logger';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth';
import { skillExtractionService } from '../services/skills/skillExtractionService';
import { skillService } from '../services/skills/skillService';
import { supabaseAdmin } from '../services/supabaseClient';

const router = Router();

/**
 * Get all skills
 */
router.get('/', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;
    const activeOnly = req.query.active_only === 'true';
    const category = req.query.category as string | undefined;

    const skills = await skillService.getSkills(userId, {
      active_only: activeOnly,
      category: category as any
    });

    res.json({ skills });
  } catch (error) {
    logger.error({ err: error }, 'Failed to get skills');
    res.status(500).json({ error: 'Failed to get skills' });
  }
});

/**
 * Get detected skill SUGGESTIONS — skills found in recent chats + journal that
 * the user does NOT already track. Detection only (nothing is created); the user
 * chooses which to add. Must be registered before /:skillId.
 */
router.get('/suggestions', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;

    const [entriesRes, messagesRes, existing] = await Promise.all([
      supabaseAdmin
        .from('journal_entries')
        .select('content, date')
        .eq('user_id', userId)
        .order('date', { ascending: false })
        .limit(30),
      supabaseAdmin
        .from('chat_messages')
        .select('content, created_at')
        .eq('user_id', userId)
        .eq('role', 'user')
        .order('created_at', { ascending: false })
        .limit(50),
      skillService.getSkills(userId, { active_only: false }),
    ]);

    const haveNames = new Set(existing.map(s => s.skill_name.toLowerCase()));

    // Combine recent chat + journal into one bounded blob for extraction.
    const combined = [
      ...((messagesRes.data as Array<{ content: string }> | null) ?? []).map(m => m.content),
      ...((entriesRes.data as Array<{ content: string }> | null) ?? []).map(e => e.content),
    ]
      .filter(c => c?.trim())
      .join('\n')
      .slice(0, 9000);

    if (!combined.trim()) {
      res.json({ suggestions: [], count: 0 });
      return;
    }

    const detected = await skillExtractionService.extractSkillsFromEntry(userId, 'suggestions', combined);

    // Only suggest skills the user doesn't already have; de-dupe + rank by confidence.
    const seen = new Set<string>();
    const suggestions = detected
      .filter(s => s.skill_name?.trim() && !haveNames.has(s.skill_name.toLowerCase()))
      .filter(s => {
        const k = s.skill_name.toLowerCase();
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      })
      .sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))
      .slice(0, 12);

    res.json({ suggestions, count: suggestions.length });
  } catch (error) {
    logger.error({ err: error }, 'Failed to get skill suggestions');
    res.status(500).json({ error: 'Failed to get skill suggestions' });
  }
});

/**
 * Get a single skill
 */
router.get('/:skillId', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;
    const { skillId } = req.params;

    const skill = await skillService.getSkill(userId, skillId);
    if (!skill) {
      return res.status(404).json({ error: 'Skill not found' });
    }

    res.json({ skill });
  } catch (error) {
    logger.error({ err: error }, 'Failed to get skill');
    res.status(500).json({ error: 'Failed to get skill' });
  }
});

/**
 * Create a new skill
 */
router.post('/', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;
    const schema = z.object({
      skill_name: z.string().min(1).max(100),
      skill_category: z.enum(['professional', 'creative', 'physical', 'social', 'intellectual', 'emotional', 'practical', 'artistic', 'technical', 'other']),
      description: z.string().optional(),
      auto_detected: z.boolean().optional(),
      confidence_score: z.number().min(0).max(1).optional()
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid skill data', details: parsed.error.flatten() });
    }

    const skill = await skillService.createSkill(userId, parsed.data);
    res.json({ skill });
  } catch (error) {
    logger.error({ err: error }, 'Failed to create skill');
    res.status(500).json({ error: 'Failed to create skill' });
  }
});

/**
 * Update a skill
 */
router.patch('/:skillId', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;
    const { skillId } = req.params;
    const schema = z.object({
      skill_name: z.string().min(1).max(100).optional(),
      skill_category: z.enum(['professional', 'creative', 'physical', 'social', 'intellectual', 'emotional', 'practical', 'artistic', 'technical', 'other']).optional(),
      description: z.string().optional(),
      is_active: z.boolean().optional()
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid skill data', details: parsed.error.flatten() });
    }

    const skill = await skillService.updateSkill(userId, skillId, parsed.data);
    res.json({ skill });
  } catch (error) {
    logger.error({ err: error }, 'Failed to update skill');
    res.status(500).json({ error: 'Failed to update skill' });
  }
});

/**
 * Add XP to a skill
 */
router.post('/:skillId/xp', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;
    const { skillId } = req.params;
    const schema = z.object({
      xp_amount: z.number().int().positive(),
      source_type: z.enum(['memory', 'achievement', 'manual']),
      source_id: z.string().uuid().optional(),
      notes: z.string().optional()
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid XP data', details: parsed.error.flatten() });
    }

    const result = await skillService.addXP(
      userId,
      skillId,
      parsed.data.xp_amount,
      parsed.data.source_type,
      parsed.data.source_id,
      parsed.data.notes
    );

    res.json(result);
  } catch (error) {
    logger.error({ err: error }, 'Failed to add XP to skill');
    res.status(500).json({ error: 'Failed to add XP to skill' });
  }
});

/**
 * Get skill progress history
 */
router.get('/:skillId/progress', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;
    const { skillId } = req.params;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;

    const progress = await skillService.getSkillProgress(userId, skillId, limit);
    res.json({ progress });
  } catch (error) {
    logger.error({ err: error }, 'Failed to get skill progress');
    res.status(500).json({ error: 'Failed to get skill progress' });
  }
});

/**
 * Extract skills from journal entry
 */
router.post('/extract', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;
    const { entry_id, content } = req.body;

    if (!entry_id || !content) {
      return res.status(400).json({ error: 'entry_id and content are required' });
    }

    const results = await skillExtractionService.processEntryForSkills(userId, entry_id, content);
    res.json({ results });
  } catch (error) {
    logger.error({ err: error }, 'Failed to extract skills');
    res.status(500).json({ error: 'Failed to extract skills' });
  }
});

/**
 * Delete a skill
 */
router.delete('/:skillId', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;
    const { skillId } = req.params;

    await skillService.deleteSkill(userId, skillId);
    res.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, 'Failed to delete skill');
    res.status(500).json({ error: 'Failed to delete skill' });
  }
});

/**
 * Get skill with enriched details
 */
router.get('/:skillId/details', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;
    const { skillId } = req.params;

    const skill = await skillService.getSkillDetails(userId, skillId);
    res.json({ skill });
  } catch (error) {
    logger.error({ err: error }, 'Failed to get skill details');
    res.status(500).json({ error: 'Failed to get skill details' });
  }
});

/**
 * Extract skill details from journal entries
 */
router.post('/:skillId/details/extract', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;
    const { skillId } = req.params;

    const details = await skillService.extractSkillDetails(userId, skillId);
    res.json({ details });
  } catch (error) {
    logger.error({ err: error }, 'Failed to extract skill details');
    res.status(500).json({ error: 'Failed to extract skill details' });
  }
});

/**
 * Update skill details
 */
router.patch('/:skillId/details', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;
    const { skillId } = req.params;
    const updates = req.body;

    const skill = await skillService.updateSkillDetails(userId, skillId, updates);
    res.json({ skill });
  } catch (error) {
    logger.error({ err: error }, 'Failed to update skill details');
    res.status(500).json({ error: 'Failed to update skill details' });
  }
});

export default router;
