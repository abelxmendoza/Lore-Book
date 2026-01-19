import { Router } from 'express';
import OpenAI from 'openai';
import { z } from 'zod';

import { config } from '../config';
import { supabaseAdmin } from '../lib/supabase';
import { logger } from '../logger';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { onboardingService } from '../services/onboardingService';

const router = Router();

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

const analyzeUserSchema = z.object({
  description: z.string().min(1),
});

const detectPersonasSchema = z.object({
  content: z.string().min(1),
});

const completeSchema = z.object({
  personas: z.array(z.enum(['journaler', 'developer', 'writer', 'explorer'])).optional(),
  completedAt: z.string().optional(),
});

const openai = new OpenAI({ apiKey: config.openAiKey });

/**
 * POST /api/onboarding/analyze-user
 * Generate a personalized response and detect personas based on user's description of why they're using the app
 */
router.post('/analyze-user', requireAuth, async (req: AuthenticatedRequest, res) => {
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
          content: `You are LoreKeeper, an AI-powered memory and journaling companion. A user has just described why they're using the app. 

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

    res.json({
      personalizedResponse: result.personalizedResponse || 'Welcome to LoreKeeper! We\'re excited to help you on your journey.',
      personas: finalPersonas,
      confidence: result.confidence || {},
      reasoning: result.reasoning || 'Default persona assigned',
    });
  } catch (error) {
    logger.error({ error }, 'Failed to analyze user');
    // Default response if analysis fails
    res.json({
      personalizedResponse: 'Welcome to LoreKeeper! We\'re excited to help you capture and understand your life\'s story.',
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
router.post('/detect-personas', requireAuth, async (req: AuthenticatedRequest, res) => {
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
