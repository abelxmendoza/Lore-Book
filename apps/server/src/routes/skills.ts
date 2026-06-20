import { Router } from 'express';
import { z } from 'zod';

import { logger } from '../logger';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth';
import { skillExtractionService } from '../services/skills/skillExtractionService';
import { skillService } from '../services/skills/skillService';
import { skillSuggestionService } from '../services/skills/skillSuggestionService';
import { skillRelationshipService } from '../services/skills/skillRelationshipService';
import { supabaseAdmin } from '../services/supabaseClient';
import { buildBookIndexFromLabels, enrichNameWithBookMatch } from '../services/suggestionMatchEnricher';
import { resolveBookNameMatch } from '../utils/suggestionBookFilter';

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
 * Get detected skill SUGGESTIONS — pending rows from DB. Full story scan only when
 * ?rescan=true or on first visit (no suggestion rows yet).
 */
router.get('/suggestions', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;
    const rescan = req.query.rescan === 'true';

    const [existing, pending, everScanned] = await Promise.all([
      skillService.getSkills(userId, { active_only: false }),
      skillSuggestionService.getPendingSuggestions(userId),
      skillSuggestionService.hasAnySuggestions(userId),
    ]);

    const skillBookIndex = buildBookIndexFromLabels(
      existing.map((s) => ({ id: s.id, label: s.skill_name }))
    );

    const shouldScan = rescan || (!everScanned && pending.length === 0);

    if (shouldScan) {
      const [entriesRes, messagesRes] = await Promise.all([
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
      ]);

      const combined = [
        ...((messagesRes.data as Array<{ content: string }> | null) ?? []).map((m) => m.content),
        ...((entriesRes.data as Array<{ content: string }> | null) ?? []).map((e) => e.content),
      ]
        .filter((c) => c?.trim())
        .join('\n')
        .slice(0, 12000);

      if (combined.trim()) {
        const detected = await skillExtractionService.extractSkillsFromEntry(userId, 'suggestions-scan', combined);
        for (const s of detected) {
          if (!s.skill_name?.trim()) continue;
          if (resolveBookNameMatch(s.skill_name, skillBookIndex.exactKeys, skillBookIndex.entries).status === 'existing') {
            continue;
          }
          await skillSuggestionService.upsertFromExtraction(userId, s, { source: 'llm_scan' });
        }
        await skillRelationshipService.resolvePendingParentLinks(userId);
      }
    }

    const freshPending = shouldScan
      ? await skillSuggestionService.getPendingSuggestions(userId)
      : pending;

    const suggestions = freshPending
      .map((row) => {
        const match = enrichNameWithBookMatch(row.skill_name, skillBookIndex);
        return {
          id: row.id,
          skill_name: row.skill_name,
          skill_category: row.skill_category,
          skill_type: row.skill_type,
          monetization: row.monetization,
          proficiency: row.proficiency,
          confidence: row.confidence,
          enjoyment: row.enjoyment,
          usage_frequency: row.usage_frequency,
          trajectory: row.trajectory,
          description: row.description,
          origin_story: row.origin_story,
          first_learned_context: row.first_learned_context,
          related_jobs: row.related_jobs,
          related_projects: row.related_projects,
          parent_skill_name: row.parent_skill_name,
          related_skill_names: row.related_skill_names,
          evidence: row.evidence,
          source: row.source ?? 'chat',
          match_status: match.match_status,
          matched_book_id: match.matched_book_id,
          matched_book_name: match.matched_book_name,
        };
      })
      .filter((row) => row.match_status !== 'existing')
      .sort((a, b) => Number(b.confidence ?? 0) - Number(a.confidence ?? 0))
      .slice(0, 12);

    const { enrichSuggestionsWithParserAlternatives } = await import(
      '../services/lorebook/parser/loreBookSuggestionEnricher'
    );
    const enriched = await enrichSuggestionsWithParserAlternatives(
      userId,
      'skills',
      suggestions,
      (row) => row.skill_name,
      (row) => row.description ?? row.first_learned_context
    );

    res.json({ suggestions: enriched, count: enriched.length, scanned: shouldScan });
  } catch (error) {
    logger.error({ err: error }, 'Failed to get skill suggestions');
    res.status(500).json({ error: 'Failed to get skill suggestions' });
  }
});

router.post('/suggestions/materialize', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;
    const schema = z.object({
      skill_name: z.string().min(1).max(100),
      skill_category: z.preprocess(
        (v) => {
          const n = String(v ?? 'other').toLowerCase().trim();
          const valid = ['professional', 'creative', 'physical', 'social', 'intellectual', 'emotional', 'practical', 'artistic', 'technical', 'other'];
          return valid.includes(n) ? n : 'other';
        },
        z.enum(['professional', 'creative', 'physical', 'social', 'intellectual', 'emotional', 'practical', 'artistic', 'technical', 'other'])
      ),
      skill_type: z.string().optional(),
      monetization: z.string().optional(),
      proficiency: z.number().optional(),
      confidence: z.number().min(0).max(1).optional(),
      enjoyment: z.number().optional(),
      usage_frequency: z.string().optional(),
      trajectory: z.string().optional(),
      description: z.string().optional(),
      origin_story: z.string().optional(),
      first_learned_context: z.string().optional(),
      related_jobs: z.array(z.string()).optional(),
      related_projects: z.array(z.string()).optional(),
      parent_skill_name: z.string().optional(),
      related_skill_names: z.array(z.string()).optional(),
      evidence: z.array(z.union([z.string(), z.object({ text: z.string() })])).optional(),
      suggestion_id: z.string().uuid().optional(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid suggestion data', details: parsed.error.flatten() });
    }
    const d = parsed.data;
    const skill = await skillSuggestionService.materializeSkill(userId, {
      skill_name: d.skill_name,
      skill_category: d.skill_category,
      skill_type: d.skill_type,
      monetization: d.monetization,
      proficiency: d.proficiency,
      confidence: d.confidence,
      enjoyment: d.enjoyment,
      usage_frequency: d.usage_frequency,
      trajectory: d.trajectory,
      description: d.description,
      origin_story: d.origin_story,
      first_learned_context: d.first_learned_context,
      related_jobs: d.related_jobs,
      related_projects: d.related_projects,
      parent_skill_name: d.parent_skill_name,
      related_skill_names: d.related_skill_names,
      evidence: d.evidence,
      suggestionId: d.suggestion_id,
      source: 'suggestion',
    });
    res.json({ skill });
  } catch (error) {
    logger.error({ err: error }, 'Failed to materialize skill');
    res.status(400).json({ error: 'Failed to add skill' });
  }
});

router.post('/suggestions/reject-by-name', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;
    const { skill_name } = req.body as { skill_name?: string };
    if (!skill_name?.trim()) {
      return res.status(400).json({ error: 'skill_name is required' });
    }
    await skillSuggestionService.rejectByName(userId, skill_name);
    res.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, 'Failed to reject skill by name');
    res.status(400).json({ error: 'Failed to dismiss suggestion' });
  }
});

router.post('/suggestions/:id/confirm', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;
    const skill = await skillSuggestionService.confirmSuggestion(userId, req.params.id as string);
    res.json({ skill });
  } catch (error) {
    logger.error({ err: error }, 'Failed to confirm skill suggestion');
    res.status(400).json({ error: 'Failed to confirm skill suggestion' });
  }
});

router.post('/suggestions/:id/reject', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;
    await skillSuggestionService.rejectSuggestion(userId, req.params.id as string);
    res.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, 'Failed to reject skill suggestion');
    res.status(400).json({ error: 'Failed to reject skill suggestion' });
  }
});

/**
 * Get a single skill
 */
router.get('/:skillId', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;
    const skillId = req.params.skillId as string;

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
      confidence_score: z.number().min(0).max(1).optional(),
      metadata: z.record(z.string(), z.unknown()).optional(),
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
    const skillId = req.params.skillId as string;
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
    const skillId = req.params.skillId as string;
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
    const skillId = req.params.skillId as string;
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
    const skillId = req.params.skillId as string;

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
    const skillId = req.params.skillId as string;

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
    const skillId = req.params.skillId as string;

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
    const skillId = req.params.skillId as string;
    const updates = req.body;

    const skill = await skillService.updateSkillDetails(userId, skillId, updates);
    res.json({ skill });
  } catch (error) {
    logger.error({ err: error }, 'Failed to update skill details');
    res.status(500).json({ error: 'Failed to update skill details' });
  }
});

export default router;
