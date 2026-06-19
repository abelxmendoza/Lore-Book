import { Router } from 'express';
import { z } from 'zod';

import { logger } from '../logger';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { biographyGenerationEngine, biographyRecommendationEngine, BIOGRAPHY_VERSIONS, type BiographySpec } from '../services/biographyGeneration';
import { bookCapacityCalculator } from '../services/biographyGeneration/bookCapacityCalculator';
import { contentAvailabilityService } from '../services/biographyGeneration/contentAvailabilityService';
import { bookVersionManager } from '../services/biographyGeneration/bookVersionManager';
import { autoCompilationService } from '../services/biographyGeneration/autoCompilationService';
import { dateAssignmentService } from '../services/dateAssignmentService';
import { lorebookRecommendationEngine } from '../services/lorebook/lorebookRecommendationEngine';
import { lorebookSearchParser } from '../services/lorebook/lorebookSearchParser';
import { chatEditBiographySection, updateBiographySection } from '../services/biographySectionService';
import { mainLifestoryService } from '../services/mainLifestoryService';
import { getLivingBiographyCard, getBiographyChanges } from '../services/livingBiographyService';
import { recompileCoreLorebook } from '../services/biographyGeneration/recompileCoreLorebook';
import { omegaChatService } from '../services/omegaChatService';
import { loreReadinessService, checkCompileGate, getQuestPrompts } from '../services/loreReadiness';
import type { LoreTopicId } from '../services/loreReadiness';

const router = Router();

/**
 * GET /api/biography/main-lifestory
 * Get the main lifestory biography (always available)
 */
router.get('/main-lifestory', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const lifestory = await mainLifestoryService.getMainLifestory(req.user!.id);
    if (!lifestory) {
      return res.status(404).json({ error: 'Main lifestory not found' });
    }
    res.json({ biography: lifestory });
  } catch (error) {
    logger.error({ error, userId: req.user!.id }, 'Failed to get main lifestory');
    res.status(500).json({ error: 'Failed to get main lifestory' });
  }
});

/**
 * POST /api/biography/main-lifestory/regenerate
 * Force regenerate the main lifestory
 */
router.post('/main-lifestory/regenerate', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    await mainLifestoryService.ensureMainLifestory(req.user!.id, true);
    const lifestory = await mainLifestoryService.getMainLifestory(req.user!.id);
    if (!lifestory) {
      return res.status(404).json({ error: 'Main lifestory not found' });
    }
    res.json({ biography: lifestory, message: 'Main lifestory regenerated' });
  } catch (error) {
    logger.error({ error, userId: req.user!.id }, 'Failed to regenerate main lifestory');
    res.status(500).json({ error: 'Failed to regenerate main lifestory' });
  }
});

/**
 * POST /api/biography/main-lifestory/alternative
 * Generate alternative version from main lifestory
 */
const alternativeVersionSchema = z.object({
  version: z.enum(['safe', 'explicit', 'private']),
  tone: z.enum(['neutral', 'dramatic', 'reflective', 'mythic', 'professional']).optional(),
  depth: z.enum(['summary', 'detailed', 'epic']).optional(),
  audience: z.enum(['self', 'public', 'professional']).optional()
});

router.post('/main-lifestory/alternative', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const parsed = alternativeVersionSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid request', details: parsed.error });
    }

    const { version, tone, depth, audience } = parsed.data;
    const alternative = await mainLifestoryService.generateAlternativeVersion(
      req.user!.id,
      version,
      { tone, depth, audience }
    );

    res.json({ biography: alternative });
  } catch (error) {
    logger.error({ error, userId: req.user!.id }, 'Failed to generate alternative version');
    res.status(500).json({ error: 'Failed to generate alternative version' });
  }
});

/**
 * GET /api/biography/sections
 * Get biography sections (chapters from main lifestory)
 * NOTE: This replaces the old memoir sections endpoint
 */
router.get('/sections', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    // Get main lifestory biography
    const lifestory = await mainLifestoryService.getMainLifestory(req.user!.id);
    
    if (!lifestory || !lifestory.biography_data) {
      return res.json({ sections: [] });
    }

    const biography = lifestory.biography_data as any;
    
    // Transform biography chapters to sections format (for backward compatibility)
    const sections = (biography.chapters || []).map((chapter: any, index: number) => ({
      id: chapter.id || `chapter-${index}`,
      title: chapter.title || `Chapter ${index + 1}`,
      content: chapter.text || '',
      order: index,
      period: chapter.timeSpan ? {
        from: chapter.timeSpan.start,
        to: chapter.timeSpan.end || new Date().toISOString()
      } : undefined,
      themes: chapter.themes || [],
      lastUpdated: lifestory.updated_at || lifestory.created_at || new Date().toISOString()
    }));
    
    res.json({ sections });
  } catch (error) {
    logger.error({ err: error }, 'Failed to get biography sections');
    // Return empty sections instead of error - allows the UI to work
    res.json({ sections: [] });
  }
});

// Chat endpoint for biography editing
const chatSchema = z.object({
  message: z.string(),
  conversationHistory: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string()
  })).optional()
});

/**
 * POST /api/biography/chat
 * Chat endpoint for biography editing
 * NOTE: This replaces the old memoir chat endpoint
 * After chat, the biography will be regenerated automatically
 */
router.post('/chat', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const parsed = chatSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid request' });
    }

    const { message, conversationHistory = [] } = parsed.data;
    
    // Extract dates from the message
    const extractedDates = await omegaChatService.extractDatesAndTimes(message);
    
    // Use the chat service to generate a response
    const userName = req.user?.fullName ?? undefined;
    const response = await omegaChatService.chat(req.user!.id, message, conversationHistory, undefined, undefined, undefined, userName);
    
    // Trigger biography regeneration in background (non-blocking)
    // The ingestion pipeline will handle updating the narrative graph
    mainLifestoryService.updateAfterChatEntry(req.user!.id).catch(err => {
      logger.warn({ err, userId: req.user!.id }, 'Background biography update failed');
    });
    
    // Get current sections (chapters) from main lifestory
    const lifestory = await mainLifestoryService.getMainLifestory(req.user!.id);
    let sections: any[] = [];
    
    if (lifestory && lifestory.biography_data) {
      const biography = lifestory.biography_data as any;
      sections = (biography.chapters || []).map((chapter: any, index: number) => ({
        id: chapter.id || `chapter-${index}`,
        title: chapter.title || `Chapter ${index + 1}`,
        content: chapter.text || '',
        order: index,
        period: chapter.timeSpan ? {
          from: chapter.timeSpan.start,
          to: chapter.timeSpan.end || new Date().toISOString()
        } : undefined,
        themes: chapter.themes || [],
        lastUpdated: lifestory.updated_at || lifestory.created_at || new Date().toISOString()
      }));
    }
    
    res.json({
      answer: response.answer,
      sections,
      extractedDates: extractedDates.map(d => ({
        date: d.date,
        precision: d.precision,
        confidence: d.confidence,
        context: d.context
      }))
    });
  } catch (error) {
    logger.error({ err: error }, 'Failed to process biography chat');
    res.status(500).json({ 
      error: 'Failed to process request',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

const updateSectionSchema = z.object({
  sectionId: z.string().min(1),
  title: z.string().optional(),
  content: z.string().optional(),
  biographyId: z.string().uuid().optional(),
});

/**
 * PATCH /api/biography/section
 * Manually update a biography section (chapter) in main lifestory or a saved lorebook.
 */
router.patch('/section', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const parsed = updateSectionSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid request', details: parsed.error });
    }

    const { sectionId, title, content, biographyId } = parsed.data;
    await updateBiographySection(req.user!.id, sectionId, { title, content }, biographyId);
    res.json({ ok: true });
  } catch (error) {
    logger.error({ err: error, userId: req.user!.id }, 'Failed to update biography section');
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to update section',
    });
  }
});

const sectionChatSchema = z.object({
  sectionId: z.string().min(1),
  focus: z.string().optional(),
  message: z.string().min(1),
  history: z
    .array(z.object({ role: z.enum(['user', 'assistant']), content: z.string() }))
    .optional(),
  biographyId: z.string().uuid().optional(),
});

/**
 * POST /api/biography/section/chat
 * AI-assisted editing for a single biography section.
 */
router.post('/section/chat', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const parsed = sectionChatSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid request', details: parsed.error });
    }

    const { sectionId, focus = '', message, history = [], biographyId } = parsed.data;
    const result = await chatEditBiographySection(
      req.user!.id,
      sectionId,
      focus,
      message,
      history,
      biographyId
    );
    res.json(result);
  } catch (error) {
    logger.error({ err: error, userId: req.user!.id }, 'Failed to process section chat edit');
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to process section edit',
    });
  }
});

/**
 * POST /api/biography/generate
 * Generate a new biography from NarrativeAtoms
 */
const generateBiographySchema = z.object({
  scope: z.enum(['full_life', 'domain', 'time_range', 'thematic']),
  domain: z.enum(['fighting', 'robotics', 'relationships', 'creative', 'professional', 'personal', 'health', 'education', 'family', 'friendship', 'romance']).optional(),
  timeRange: z.object({
    start: z.string(),
    end: z.string()
  }).optional(),
  themes: z.array(z.string()).optional(),
  tone: z.enum(['neutral', 'dramatic', 'reflective', 'mythic', 'professional']).default('neutral'),
  depth: z.enum(['summary', 'detailed', 'epic']).default('detailed'),
  audience: z.enum(['self', 'public', 'professional']).default('self'),
  version: z.enum(['main', 'safe', 'explicit', 'private']).default('main'), // Build flag
  includeIntrospection: z.boolean().optional(), // Derived from version
  force: z.boolean().optional(),
  characterIds: z.array(z.string().uuid()).optional(),
  locationIds: z.array(z.string().uuid()).optional(),
});

router.post('/generate', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const parsed = generateBiographySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid request', details: parsed.error });
    }

    const { force, characterIds, locationIds, ...specFields } = parsed.data;
    const spec: BiographySpec & { characterIds?: string[]; locationIds?: string[] } = {
      ...specFields,
      characterIds,
      locationIds,
    };

    const gate = await checkCompileGate(req.user!.id, { spec, depth: spec.depth }, { force });
    if (!gate.allowed) {
      return res.status(409).json({
        error: 'Not ready to compile',
        message: gate.message,
        canForce: gate.canForce,
        mode: gate.mode,
        evaluation: gate.evaluation,
      });
    }

    const biography = await biographyGenerationEngine.generateBiography(req.user!.id, spec);

    res.json({
      biography,
      readiness: {
        mode: gate.mode,
        warning: gate.warning,
        progress: gate.evaluation.progress,
      },
    });
  } catch (error) {
    logger.error({ error, userId: req.user!.id }, 'Failed to generate biography');
    res.status(500).json({ 
      error: 'Failed to generate biography',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/biography/list
 * Get all generated biographies
 * Query params: ?coreOnly=true to get only Core Lorebooks
 */
router.get('/list', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { supabaseAdmin } = await import('../services/supabaseClient');
    const coreOnly = req.query.coreOnly === 'true';
    
    let query = supabaseAdmin
      .from('biographies')
      .select('*')
      .eq('user_id', req.user!.id);
    
    if (coreOnly) {
      query = query.eq('is_core_lorebook', true);
    }
    
    const { data, error } = await query.order('created_at', { ascending: false });

    if (error) {
      logger.warn({ err: error, userId: req.user!.id }, 'Biographies list query failed, returning empty');
      return res.json({ biographies: [] });
    }

    res.json({ biographies: data || [] });
  } catch (error) {
    logger.error({ error, userId: req.user!.id }, 'Failed to list biographies');
    res.json({ biographies: [] });
  }
});

/**
 * POST /api/biography/:id/save-as-core
 * Save a generated biography as a Core Lorebook (named, versioned)
 */
const saveCoreLorebookSchema = z.object({
  lorebookName: z.string().min(1),
  version: z.number().int().positive().optional()
});

router.post('/:id/save-as-core', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const parsed = saveCoreLorebookSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid request', details: parsed.error });
    }

    const { supabaseAdmin } = await import('../services/supabaseClient');
    const { lorebookName, version = 1 } = parsed.data;

    // Get existing biography
    const { data: existing, error: fetchError } = await supabaseAdmin
      .from('biographies')
      .select('*')
      .eq('user_id', req.user!.id)
      .eq('id', req.params.id)
      .single();

    if (fetchError || !existing) {
      return res.status(404).json({ error: 'Biography not found' });
    }

    // Check if name already exists (for versioning)
    const { data: existingName } = await supabaseAdmin
      .from('biographies')
      .select('lorebook_version')
      .eq('user_id', req.user!.id)
      .eq('lorebook_name', lorebookName)
      .eq('is_core_lorebook', true)
      .order('lorebook_version', { ascending: false })
      .limit(1)
      .single();

    const nextVersion = existingName?.lorebook_version 
      ? existingName.lorebook_version + 1 
      : version;

    // Update biography to be Core Lorebook
    const biographyData = existing.biography_data as any;
    biographyData.metadata.isCoreLorebook = true;
    biographyData.metadata.lorebookName = lorebookName;
    biographyData.metadata.lorebookVersion = nextVersion;

    const { data: updated, error: updateError } = await supabaseAdmin
      .from('biographies')
      .update({
        is_core_lorebook: true,
        lorebook_name: lorebookName,
        lorebook_version: nextVersion,
        biography_data: biographyData
      })
      .eq('user_id', req.user!.id)
      .eq('id', req.params.id)
      .select()
      .single();

    if (updateError) {
      throw updateError;
    }

    res.json({ biography: updated });
  } catch (error) {
    logger.error({ error, userId: req.user!.id }, 'Failed to save as Core Lorebook');
    res.status(500).json({ error: 'Failed to save as Core Lorebook' });
  }
});

/**
 * POST /api/biography/recompile-core
 * Re-compile a named Core Lorebook from current memory (increments lorebook_version).
 */
const recompileCoreSchema = z.object({
  lorebookName: z.string().min(1),
});

router.post('/recompile-core', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const parsed = recompileCoreSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid request', details: parsed.error });
    }

    const result = await recompileCoreLorebook(req.user!.id, parsed.data.lorebookName);
    res.json(result);
  } catch (error) {
    logger.error({ error, userId: req.user!.id }, 'Failed to recompile core lorebook');
    res.status(500).json({
      error: 'Failed to recompile core lorebook',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/biography/recommendations
 * Get top 4 recommended biographies
 */
router.get('/recommendations', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const recommendations = await biographyRecommendationEngine.getRecommendations(req.user!.id);
    res.json({ recommendations, versions: BIOGRAPHY_VERSIONS });
  } catch (error) {
    logger.error({ error, userId: req.user!.id }, 'Failed to get recommendations');
    res.status(500).json({ error: 'Failed to get recommendations' });
  }
});

/**
 * GET /api/biography/readiness
 * Server-owned lore readiness summary (topics, gaps, knowledge score)
 */
router.get('/readiness', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const readiness = await loreReadinessService.getSummary(req.user!.id);
    res.json({ readiness });
  } catch (error) {
    logger.error({ error, userId: req.user!.id }, 'Failed to get lore readiness');
    res.status(500).json({ error: 'Failed to get lore readiness' });
  }
});

const evaluateReadinessSchema = z.object({
  query: z.string().optional(),
  topicId: z.string().optional(),
  characterId: z.string().uuid().optional(),
  locationId: z.string().uuid().optional(),
  depth: z.enum(['summary', 'detailed', 'epic']).optional(),
  spec: z.record(z.string(), z.unknown()).optional(),
});

/**
 * POST /api/biography/readiness/evaluate
 * Evaluate readiness for a dynamic query, entity, or custom spec
 */
router.post('/readiness/evaluate', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const parsed = evaluateReadinessSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid request', details: parsed.error });
    }

    const body = parsed.data;
    if (!body.query && !body.topicId && !body.characterId && !body.locationId && !body.spec) {
      return res.status(400).json({ error: 'Provide query, topicId, characterId, locationId, or spec' });
    }

    const evaluation = await loreReadinessService.evaluate(req.user!.id, {
      query: body.query,
      topicId: body.topicId as LoreTopicId | undefined,
      characterId: body.characterId,
      locationId: body.locationId,
      depth: body.depth,
      spec: body.spec as any,
    });

    res.json({ evaluation });
  } catch (error) {
    logger.error({ error, userId: req.user!.id }, 'Failed to evaluate lore readiness');
    res.status(500).json({ error: 'Failed to evaluate lore readiness' });
  }
});

/**
 * GET /api/biography/readiness/quests
 * Chat quest prompts derived from readiness gaps
 */
router.get('/readiness/quests', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const quests = await getQuestPrompts(req.user!.id);
    res.json({ quests });
  } catch (error) {
    logger.error({ error, userId: req.user!.id }, 'Failed to get lore readiness quests');
    res.status(500).json({ error: 'Failed to get lore readiness quests' });
  }
});

/**
 * GET /api/biography/readiness/:templateId
 * Single topic template readiness
 */
router.get('/readiness/:templateId', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const topic = await loreReadinessService.getTopicReadiness(
      req.user!.id,
      req.params.templateId as LoreTopicId
    );
    if (!topic) {
      return res.status(404).json({ error: 'Unknown readiness template' });
    }
    res.json({ topic });
  } catch (error) {
    logger.error({ error, userId: req.user!.id, templateId: req.params.templateId }, 'Failed to get topic readiness');
    res.status(500).json({ error: 'Failed to get topic readiness' });
  }
});

/**
 * GET /api/biography/stats
 * Get comprehensive lore statistics
 */
router.get('/stats', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const stats = await contentAvailabilityService.getContentStats(req.user!.id);
    res.json({ stats });
  } catch (error) {
    logger.warn({ error, userId: req.user!.id }, 'Content stats unavailable, returning empty snapshot');
    res.json({
      stats: {
        totalJournalEntries: 0,
        totalChatMessages: 0,
        totalNarrativeAtoms: 0,
        totalWordCount: 0,
        totalCharacterCount: 0,
        timelineSpan: { start: '', end: '', days: 0, months: 0, years: 0 },
        domainCoverage: [],
        entityCounts: { characters: 0, locations: 0, events: 0, skills: 0 },
        contentDensity: { entriesPerMonth: 0, entriesPerYear: 0, averageWordsPerEntry: 0 },
        mostActivePeriods: [],
      },
    });
  }
});

/**
 * GET /api/biography/capacity
 * Get book generation capacity for a spec
 * Query params: scope, domain, depth, targetPages
 */
router.get('/capacity', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { scope, domain, depth, targetPages } = req.query;

    const spec: BiographySpec = {
      scope: (scope as any) || 'full_life',
      domain: domain as any,
      tone: 'neutral',
      depth: (depth as any) || 'detailed',
      audience: 'self',
      includeIntrospection: true
    };

    const targetPagesNum = targetPages ? parseInt(targetPages as string) : undefined;

    const capacity = await bookCapacityCalculator.calculateBookCapacity(
      req.user!.id,
      spec,
      targetPagesNum
    );

    res.json({ capacity, spec });
  } catch (error) {
    logger.error({ error, userId: req.user!.id }, 'Failed to get book capacity');
    res.status(500).json({ error: 'Failed to get book capacity' });
  }
});

/**
 * GET /api/biography/capacity/:targetPages
 * Check capacity for specific page target
 */
router.get('/capacity/:targetPages', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const targetPages = parseInt(req.params.targetPages);
    if (isNaN(targetPages) || targetPages < 1) {
      return res.status(400).json({ error: 'Invalid target pages' });
    }

    const { scope, domain, depth } = req.query;

    const spec: BiographySpec = {
      scope: (scope as any) || 'full_life',
      domain: domain as any,
      tone: 'neutral',
      depth: (depth as any) || 'detailed',
      audience: 'self',
      includeIntrospection: true
    };

    const capacity = await bookCapacityCalculator.calculateBookCapacity(
      req.user!.id,
      spec,
      targetPages
    );

    res.json({ capacity, targetPages, spec });
  } catch (error) {
    logger.error({ error, userId: req.user!.id }, 'Failed to check capacity for target');
    res.status(500).json({ error: 'Failed to check capacity' });
  }
});

/**
 * POST /api/biography/search
 * Intelligent search for lorebooks - parses natural language query
 */
const searchSchema = z.object({
  query: z.string().min(1),
  force: z.boolean().optional(),
});

router.post('/search', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const parsed = searchSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid request', details: parsed.error });
    }

    const { query, force } = parsed.data;

    const gate = await checkCompileGate(req.user!.id, { query, depth: 'detailed' }, { force });
    if (!gate.allowed) {
      return res.status(409).json({
        error: 'Not ready to compile',
        message: gate.message,
        canForce: gate.canForce,
        mode: gate.mode,
        evaluation: gate.evaluation,
      });
    }

    const parsedQuery = await lorebookSearchParser.parseQuery(req.user!.id, query);
    const biography = await biographyGenerationEngine.generateBiography(req.user!.id, parsedQuery as BiographySpec);

    res.json({
      biography,
      parsedQuery,
      readiness: {
        mode: gate.mode,
        warning: gate.warning,
        progress: gate.evaluation.progress,
      },
    });
  } catch (error) {
    logger.error({ error, userId: req.user!.id }, 'Failed to search lorebooks');
    res.status(500).json({ 
      error: 'Failed to search lorebooks',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/biography/versions/:lorebookName
 * Get version history for a lorebook
 */
router.get('/versions/:lorebookName', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { lorebookName } = req.params;
    const versions = await bookVersionManager.getVersionHistory(lorebookName, req.user!.id);
    res.json({ versions });
  } catch (error) {
    logger.error({ error, userId: req.user!.id, lorebookName: req.params.lorebookName }, 'Failed to get version history');
    res.status(500).json({ error: 'Failed to get version history' });
  }
});

/**
 * POST /api/biography/versions/generate
 * Generate a new version from base biography
 */
const generateVersionSchema = z.object({
  baseBiographyId: z.string().uuid(),
  versionType: z.enum(['safe', 'explicit', 'private'])
});

router.post('/versions/generate', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const parsed = generateVersionSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid request', details: parsed.error });
    }

    const { baseBiographyId, versionType } = parsed.data;
    const version = await bookVersionManager.generateVersion(req.user!.id, baseBiographyId, versionType);

    res.json({ biography: version });
  } catch (error) {
    logger.error({ error, userId: req.user!.id }, 'Failed to generate version');
    res.status(500).json({ 
      error: 'Failed to generate version',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /api/biography/versions/compare
 * Compare two versions
 */
const compareVersionsSchema = z.object({
  biographyId1: z.string().uuid(),
  biographyId2: z.string().uuid()
});

router.post('/versions/compare', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const parsed = compareVersionsSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid request', details: parsed.error });
    }

    const { biographyId1, biographyId2 } = parsed.data;
    const comparison = await bookVersionManager.compareVersions(
      biographyId1,
      biographyId2,
      req.user!.id
    );

    res.json({ comparison });
  } catch (error) {
    logger.error({ error, userId: req.user!.id }, 'Failed to compare versions');
    res.status(500).json({ 
      error: 'Failed to compare versions',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /api/biography/versions/auto-compile
 * Auto-compile all versions at once
 */
router.post('/versions/auto-compile', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const parsed = generateBiographySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid request', details: parsed.error });
    }

    const spec: BiographySpec = parsed.data;
    const versions = await autoCompilationService.autoCompileVersions(req.user!.id, spec);

    res.json({ versions });
  } catch (error) {
    logger.error({ error, userId: req.user!.id }, 'Failed to auto-compile versions');
    res.status(500).json({ 
      error: 'Failed to auto-compile versions',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/biography/lorebook-recommendations
 * Get recommended lorebooks based on user's data (characters, locations, events, skills, timelines)
 */
router.get('/lorebook-recommendations', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 10;
    const recommendations = await lorebookRecommendationEngine.getRecommendations(req.user!.id, limit);
    res.json({ recommendations });
  } catch (error) {
    logger.error({ error, userId: req.user!.id }, 'Failed to get lorebook recommendations');
    res.json({ recommendations: [] });
  }
});

/**
 * GET /api/biography/living
 *
 * The Living Biography Card (Sprint I) — a product-facing identity surface
 * built entirely by reshaping the existing biography snapshot. Answers
 * "who am I / what's happening / who matters / what am I focused on"
 * without the user reading timelines, memories, or raw data.
 *
 * Pure projection: no new tables, no new extraction. Triggers a quiet
 * background refresh when enough new evidence has accumulated.
 */
router.get('/living', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const card = await getLivingBiographyCard(req.user!.id);
    res.json({ success: true, card });
  } catch (error) {
    logger.warn({ error, userId: req.user!.id }, 'Living biography card unavailable');
    res.json({ success: false, card: null, error: 'Living biography not available yet' });
  }
});

/**
 * GET /api/biography/living/changes?since=<ISO timestamp>
 *
 * "What's changed in your biography recently?" — derived on read from
 * existing row timestamps (new chapters, new people, new milestones,
 * emerging themes). No new storage.
 */
router.get('/living/changes', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const since = req.query.since as string;
    if (!since || isNaN(new Date(since).getTime())) {
      return res.status(400).json({ success: false, error: 'since (ISO timestamp) is required' });
    }

    const changes = await getBiographyChanges(req.user!.id, since);
    res.json({ success: true, changes });
  } catch (error) {
    logger.error({ error, userId: req.user!.id }, 'Failed to compute biography changes');
    res.status(500).json({ success: false, error: 'Failed to compute biography changes' });
  }
});

/**
 * GET /api/biography/:id
 * Get a specific biography (must stay after all static GET paths)
 */
router.get('/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { supabaseAdmin } = await import('../services/supabaseClient');
    const { data, error } = await supabaseAdmin
      .from('biographies')
      .select('*')
      .eq('user_id', req.user!.id)
      .eq('id', req.params.id)
      .single();

    if (error || !data) {
      return res.status(404).json({ error: 'Biography not found' });
    }

    res.json({ biography: data.biography_data });
  } catch (error) {
    logger.error({ error, userId: req.user!.id }, 'Failed to get biography');
    res.status(500).json({ error: 'Failed to get biography' });
  }
});

/**
 * DELETE /api/biography/:id
 * Delete a specific biography
 */
router.delete('/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { supabaseAdmin } = await import('../services/supabaseClient');
    const { error } = await supabaseAdmin
      .from('biographies')
      .delete()
      .eq('user_id', req.user!.id)
      .eq('id', req.params.id);

    if (error) {
      return res.status(500).json({ error: 'Failed to delete biography' });
    }

    res.json({ success: true });
  } catch (error) {
    logger.error({ error, userId: req.user!.id }, 'Failed to delete biography');
    res.status(500).json({ error: 'Failed to delete biography' });
  }
});

export const biographyRouter = router;

