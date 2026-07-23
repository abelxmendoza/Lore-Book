import { Router } from 'express';
import { z } from 'zod';

import { config } from '../config';
import { openai } from '../lib/openai';
import { supabaseAdmin } from '../lib/supabase';
import { logger } from '../logger';
import { guardOpenAiRoute } from '../middleware/apiProtection';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { checkAiRequestLimit } from '../middleware/subscription';
import { chatGPTExportReminderService } from '../services/chatgptImport/chatGPTExportReminderService';
import {
  onboardingIntelligenceService,
  type IdentityProfileDraft,
} from '../services/onboardingIntelligenceService';
import { onboardingService } from '../services/onboardingService';
import { incrementAiRequestCount } from '../services/usageTracking';

const router = Router();

const chatGPTExportReminderSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('requested'), days: z.number().int().min(1).max(30).default(3) }),
  z.object({ action: z.literal('remind_later'), days: z.number().int().min(1).max(30).default(3) }),
  z.object({ action: z.literal('dismiss') }),
]);

router.get('/chatgpt-export-reminder', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    res.json(await chatGPTExportReminderService.get(req.user!.id));
  } catch (error) {
    logger.warn({ error, userId: req.user!.id }, 'Failed to read ChatGPT export reminder');
    res.status(500).json({ error: 'Failed to load export reminder.' });
  }
});

router.patch('/chatgpt-export-reminder', requireAuth, async (req: AuthenticatedRequest, res) => {
  const parsed = chatGPTExportReminderSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  try {
    const state =
      parsed.data.action === 'requested'
        ? await chatGPTExportReminderService.markRequested(req.user!.id, parsed.data.days)
        : parsed.data.action === 'remind_later'
          ? await chatGPTExportReminderService.remindLater(req.user!.id, parsed.data.days)
          : await chatGPTExportReminderService.dismiss(req.user!.id);
    res.json(state);
  } catch (error) {
    logger.warn({ error, userId: req.user!.id }, 'Failed to update ChatGPT export reminder');
    res.status(500).json({ error: 'Failed to update export reminder.' });
  }
});

const chipSchema = z.object({
  label: z.string(),
  confidence: z.number().optional(),
  evidence: z.string().optional(),
});
const draftSchema = z.object({
  identity: z
    .object({
      preferredName: z.string().optional(),
      occupation: z.string().optional(),
      lifePhase: z.string().optional(),
      summary: z.string().optional(),
    })
    .partial()
    .default({}),
  people: z.array(chipSchema).default([]),
  places: z.array(chipSchema).default([]),
  organizations: z.array(chipSchema).default([]),
  skills: z.array(chipSchema).default([]),
  interests: z.array(chipSchema).default([]),
  goals: z.array(chipSchema).default([]),
  projects: z.array(chipSchema).default([]),
  events: z.array(chipSchema).default([]),
  values: z.array(chipSchema).default([]),
});

const importSchema = z.object({
  files: z.array(z.object({ name: z.string(), content: z.string().optional() })).optional(),
  calendar: z.boolean().optional(),
  photos: z.boolean().optional()
});

router.post('/init', requireAuth, async (req: AuthenticatedRequest, res) => {
  const result = await onboardingService.initialize(req.user!.id);
  res.status(201).json(result);
});

router.post('/import', requireAuth, async (req: AuthenticatedRequest, res) => {
  const parsed = importSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json(parsed.error.flatten());
  }
  const result = await onboardingService.importMemories(req.user!.id, parsed.data);
  res.status(201).json(result);
});

router.get('/briefing', requireAuth, async (req: AuthenticatedRequest, res) => {
  const result = await onboardingService.generateBriefing(req.user!.id);
  res.json(result);
});

/**
 * GET /api/onboarding/status
 * Whether the user has completed the narrative onboarding (drives the re-prompt
 * for existing users).
 */
router.get('/status', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const status = await onboardingIntelligenceService.getOnboardingStatus(req.user!.id);
    res.json(status);
  } catch (err) {
    logger.warn({ err }, 'onboarding status failed');
    res.json({ completed: false, version: 0, hasSelfProfile: false, completedAt: null });
  }
});

const narrativeSchema = z.object({ narrative: z.string().min(1).max(20_000) });

/**
 * POST /api/onboarding/narrative
 * "Tell me about yourself" → structured identity draft (confirmation chips).
 */
router.post(
  '/narrative',
  ...guardOpenAiRoute(),
  requireAuth,
  checkAiRequestLimit,
  async (req: AuthenticatedRequest, res) => {
    const parsed = narrativeSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json(parsed.error.flatten());
    try {
      const draft = await onboardingIntelligenceService.extractIdentityProfile(
        req.user!.id,
        parsed.data.narrative,
      );
      incrementAiRequestCount(req.user!.id).catch(() => {});
      res.json({ draft });
    } catch (err) {
      logger.error({ err }, 'onboarding narrative extraction failed');
      res.status(500).json({ error: 'Failed to analyze your story. Please try again.' });
    }
  },
);

const confirmSchema = z.object({
  draft: draftSchema,
  narrative: z.string().max(20_000).optional(),
});

/**
 * POST /api/onboarding/confirm
 * Persist a confirmed draft into the user's Main Character knowledge base + link
 * their self-facts, and mark onboarding complete.
 */
router.post('/confirm', requireAuth, async (req: AuthenticatedRequest, res) => {
  const parsed = confirmSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error.flatten());
  try {
    const result = await onboardingIntelligenceService.confirmIdentityProfile(
      req.user!.id,
      parsed.data.draft as IdentityProfileDraft,
      parsed.data.narrative,
    );
    res.json(result);
  } catch (err) {
    logger.error({ err }, 'onboarding confirm failed');
    res.status(500).json({ error: 'Failed to save your profile. Please try again.' });
  }
});

const analyzeUserSchema = z.object({
  description: z.string().min(1).max(10_000),
});

const detectPersonasSchema = z.object({
  content: z.string().min(1).max(50_000),
});

const completeSchema = z.object({
  personas: z.array(z.enum(['journaler', 'developer', 'writer', 'explorer'])).optional(),
  completedAt: z.string().optional(),
});

/**
 * POST /api/onboarding/analyze-user
 * Generate a personalized response and detect personas based on user's description of why they're using the app
 */
router.post('/analyze-user', ...guardOpenAiRoute(), requireAuth, checkAiRequestLimit, async (req: AuthenticatedRequest, res) => {
  const parsed = analyzeUserSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const { description } = parsed.data;

  try {
    // Use OpenAI to generate personalized response and detect personas
    const completion = await openai.chat.completions.create({
      model: config.defaultModel,
      temperature: 0.7, // Higher temperature for more creative/engaging responses
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `You are Lore Book, an AI-powered memory and journaling companion. A user has just described why they're using the app. 

Your task:
1. Generate a warm, personalized, and engaging response that acknowledges their goals and gets them excited about their journey
2. Detect which personas apply to them based on their description

Available personas:
1. **journaler**: User wants to capture daily thoughts, memories, and moments. Shows interest in regular journaling, reflection, or memory-keeping.
2. **developer**: User builds things, tracks projects, writes code, or shows technical/engineering interests.
3. **writer**: User creates stories, writes creatively, needs inspiration, or shows narrative/creative writing patterns.
4. **explorer**: User wants to discover patterns, analyze life, explore connections, or shows analytical/curious behavior.

Return JSON with:
{
  "personalizedResponse": "A warm, engaging 2-3 sentence response that acknowledges their goals and gets them excited. Be specific to what they mentioned. Make it feel personal and inspiring.",
  "personas": ["journaler", "developer", "writer", "explorer"], // Array of all applicable personas (can be multiple)
  "confidence": {
    "journaler": 0.0-1.0,
    "developer": 0.0-1.0,
    "writer": 0.0-1.0,
    "explorer": 0.0-1.0
  },
  "reasoning": "Brief explanation of why these personas were detected"
}

Be generous with personas - if the description suggests multiple personas, include all of them. The personalized response should feel genuine, warm, and tailored to their specific goals.`
        },
        {
          role: 'user',
          content: description.substring(0, 2000) // Limit length
        }
      ]
    });

    const result = JSON.parse(completion.choices[0]?.message?.content || '{}');
    
    // Validate and filter personas
    const validPersonas = ['journaler', 'developer', 'writer', 'explorer'];
    const detectedPersonas = (result.personas || []).filter((p: string) => 
      validPersonas.includes(p)
    );

    // If no personas detected, default to journaler
    const finalPersonas = detectedPersonas.length > 0 ? detectedPersonas : ['journaler'];

    incrementAiRequestCount(req.user!.id).catch((err) =>
      logger.warn({ err, userId: req.user!.id }, 'Failed to increment AI usage')
    );

    res.json({
      personalizedResponse: result.personalizedResponse || 'Welcome to Lore Book! We\'re excited to help you on your journey.',
      personas: finalPersonas,
      confidence: result.confidence || {},
      reasoning: result.reasoning || 'Default persona assigned',
    });
  } catch (error) {
    logger.error({ error }, 'Failed to analyze user');
    // Default response if analysis fails
    res.json({
      personalizedResponse: 'Welcome to Lore Book! We\'re excited to help you capture and understand your life\'s story.',
      personas: ['journaler'],
      confidence: { journaler: 0.5 },
      reasoning: 'Default persona due to analysis error',
    });
  }
});

/**
 * POST /api/onboarding/detect-personas
 * Automatically detect which personas apply to the user based on their first memory
 */
router.post('/detect-personas', ...guardOpenAiRoute(), requireAuth, checkAiRequestLimit, async (req: AuthenticatedRequest, res) => {
  const parsed = detectPersonasSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const { content } = parsed.data;

  try {
    // Use OpenAI to analyze the content and detect applicable personas
    const completion = await openai.chat.completions.create({
      model: config.defaultModel,
      temperature: 0.3,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `Analyze the following journal entry or memory content and determine which personas apply to the user.

Available personas:
1. **journaler**: User wants to capture daily thoughts, memories, and moments. Content shows regular journaling, reflection, or memory-keeping behavior.
2. **developer**: User builds things, tracks projects, writes code, or shows technical/engineering interests.
3. **writer**: User creates stories, writes creatively, needs inspiration, or shows narrative/creative writing patterns.
4. **explorer**: User wants to discover patterns, analyze life, explore connections, or shows analytical/curious behavior.

Return JSON with:
{
  "personas": ["journaler", "developer", "writer", "explorer"], // Array of all applicable personas (can be multiple)
  "confidence": {
    "journaler": 0.0-1.0,
    "developer": 0.0-1.0,
    "writer": 0.0-1.0,
    "explorer": 0.0-1.0
  },
  "reasoning": "Brief explanation of why these personas were detected"
}

Be generous - if content suggests multiple personas, include all of them. Only exclude personas if there's clear evidence they don't apply.`
        },
        {
          role: 'user',
          content: content.substring(0, 2000) // Limit length
        }
      ]
    });

    const result = JSON.parse(completion.choices[0]?.message?.content || '{}');
    
    // Validate and filter personas
    const validPersonas = ['journaler', 'developer', 'writer', 'explorer'];
    const detectedPersonas = (result.personas || []).filter((p: string) => 
      validPersonas.includes(p)
    );

    // If no personas detected, default to journaler
    const finalPersonas = detectedPersonas.length > 0 ? detectedPersonas : ['journaler'];

    incrementAiRequestCount(req.user!.id).catch((err) =>
      logger.warn({ err, userId: req.user!.id }, 'Failed to increment AI usage')
    );

    res.json({
      personas: finalPersonas,
      confidence: result.confidence || {},
      reasoning: result.reasoning || 'Default persona assigned',
    });
  } catch (error) {
    logger.error({ error }, 'Failed to detect personas');
    // Default to journaler if detection fails
    res.json({
      personas: ['journaler'],
      confidence: { journaler: 0.5 },
      reasoning: 'Default persona due to detection error',
    });
  }
});

router.post('/complete', requireAuth, async (req: AuthenticatedRequest, res) => {
  const parsed = completeSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const userId = req.user!.id;
  const { personas, completedAt } = parsed.data;

  try {
    // Get current user metadata
    const { data: { user: currentUser }, error: fetchError } = await supabaseAdmin.auth.admin.getUserById(userId);
    
    if (fetchError) {
      throw fetchError;
    }

    // Update user metadata to mark onboarding as complete
    const { data: { user }, error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
      userId,
      {
        user_metadata: {
          ...(currentUser?.user_metadata || {}),
          onboarding_completed: true,
          onboarding_completed_at: completedAt || new Date().toISOString(),
          ...(personas && personas.length > 0 && { personas }), // Save all detected personas
        },
      }
    );

    if (updateError) {
      throw updateError;
    }

    res.json({
      success: true,
      message: 'Onboarding marked as complete',
      personas: personas || [],
    });
  } catch (error) {
    logger.error({ error, userId }, 'Failed to complete onboarding');
    res.status(500).json({ error: 'Failed to complete onboarding' });
  }
});

export const onboardingRouter = router;
