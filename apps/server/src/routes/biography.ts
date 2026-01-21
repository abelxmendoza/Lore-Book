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
import { mainLifestoryService } from '../services/mainLifestoryService';
import { omegaChatService } from '../services/omegaChatService';
import { timeEngine } from '../services/timeEngine';

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
    const response = await omegaChatService.chat(req.user!.id, message, conversationHistory);
    
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
  includeIntrospection: z.boolean().optional() // Derived from version
});

router.post('/generate', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const parsed = generateBiographySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid request', details: parsed.error });
    }

    const spec: BiographySpec = parsed.data;
    const biography = await biographyGenerationEngine.generateBiography(req.user!.id, spec);

    res.json({ biography });
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
      throw error;
    }

    res.json({ biographies: data || [] });
  } catch (error) {
    logger.error({ error, userId: req.user!.id }, 'Failed to list biographies');
    res.status(500).json({ error: 'Failed to list biographies' });
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
 * GET /api/biography/:id
 * Get a specific biography
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
 * GET /api/biography/stats
 * Get comprehensive lore statistics
 */
router.get('/stats', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const stats = await contentAvailabilityService.getContentStats(req.user!.id);
    res.json({ stats });
  } catch (error) {
    logger.error({ error, userId: req.user!.id }, 'Failed to get content stats');
    res.status(500).json({ error: 'Failed to get content stats' });
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
});

router.post('/search', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const parsed = searchSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid request', details: parsed.error });
    }

    const { query } = parsed.data;
    const parsedQuery = await lorebookSearchParser.parseQuery(req.user!.id, query);

    // Generate biography from parsed query
    const biography = await biographyGenerationEngine.generateBiography(req.user!.id, parsedQuery as BiographySpec);

    res.json({ biography, parsedQuery });
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
    res.status(500).json({ error: 'Failed to get recommendations' });
  }
});

export const biographyRouter = router;

