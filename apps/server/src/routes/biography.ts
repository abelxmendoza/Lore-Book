import { Router } from 'express';
import { z } from 'zod';

import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { memoirService } from '../services/memoirService';
import { logger } from '../logger';
import { omegaChatService } from '../services/omegaChatService';
import { dateAssignmentService } from '../services/dateAssignmentService';
import { timeEngine } from '../services/timeEngine';
import { biographyGenerationEngine, biographyRecommendationEngine, BIOGRAPHY_VERSIONS } from '../services/biographyGeneration';
import type { BiographySpec } from '../services/biographyGeneration';

const router = Router();

// Get biography sections (maps to memoir outline)
router.get('/sections', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const outline = await memoirService.getOutline(req.user!.id);
    
    // Handle different possible outline formats
    let sections: any[] = [];
    
    if (outline && typeof outline === 'object') {
      if (Array.isArray(outline.sections)) {
        sections = outline.sections;
      } else if (Array.isArray(outline)) {
        sections = outline;
      }
    }
    
    // Transform memoir sections to biography sections format
    const biographySections = sections.map((section: any) => ({
      id: section.id || section.section_id || `section-${Date.now()}-${Math.random()}`,
      title: section.title || section.section_title || 'Untitled Section',
      content: section.content || section.section_content || '',
      order: section.order || section.section_order || 0,
      period: section.period || (section.period_from && section.period_to ? {
        from: section.period_from,
        to: section.period_to
      } : undefined),
      lastUpdated: section.lastUpdated || section.last_updated || section.updated_at || new Date().toISOString()
    }));
    
    res.json({ sections: biographySections });
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

router.post('/chat', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const parsed = chatSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid request' });
    }

    const { message, conversationHistory = [] } = parsed.data;
    
    // Extract dates from the message for biography sections
    const extractedDates = await omegaChatService.extractDatesAndTimes(message);
    
    // Use the chat service to generate a response
    // The chat service will handle biography-specific context
    const response = await omegaChatService.chat(req.user!.id, message, conversationHistory);
    
    // Get updated sections after chat
    const outline = await memoirService.getOutline(req.user!.id);
    
    // Enhance sections with extracted dates
    const sections = outline.sections?.map((section: any) => {
      // Try to extract dates from section content if not already present
      let period = section.period;
      let dateMetadata: any = section.dateMetadata || {};
      
      if (!period && extractedDates.length > 0) {
        // Use extracted dates to create period
        const dates = extractedDates
          .map(d => ({ date: new Date(d.date), confidence: d.confidence || 0 }))
          .sort((a, b) => a.date.getTime() - b.date.getTime());
        
        if (dates.length >= 2) {
          period = {
            from: dates[0].date.toISOString(),
            to: dates[dates.length - 1].date.toISOString()
          };
          dateMetadata = {
            precision: extractedDates[0]?.precision || 'day',
            confidence: dates[0].confidence,
            source: 'extracted',
            extractedAt: new Date().toISOString()
          };
        } else if (dates.length === 1) {
          period = {
            from: dates[0].date.toISOString(),
            to: dates[0].date.toISOString()
          };
          dateMetadata = {
            precision: extractedDates[0]?.precision || 'day',
            confidence: dates[0].confidence,
            source: 'extracted',
            extractedAt: new Date().toISOString()
          };
        }
      }
      
      return {
        id: section.id,
        title: section.title,
        content: section.content || '',
        order: section.order || 0,
        period: period || section.period,
        dateMetadata,
        lastUpdated: section.lastUpdated || section.last_updated || new Date().toISOString()
      };
    }) || [];
    
    // Update outline with enhanced sections if dates were extracted
    if (extractedDates.length > 0 && sections.length > 0) {
      const updatedOutline = {
        ...outline,
        sections: sections.map((s: any) => ({
          ...s,
          period: s.period,
          dateMetadata: s.dateMetadata
        }))
      };
      await memoirService.saveOutline(req.user!.id, updatedOutline as any);
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

export const biographyRouter = router;

