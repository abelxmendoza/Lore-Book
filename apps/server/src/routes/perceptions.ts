import { Router } from 'express';
import { z } from 'zod';

import { logger } from '../logger';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth';
import { perceptionChatService } from '../services/perceptionChatService';
import { perceptionService, type CreatePerceptionEntryInput, type UpdatePerceptionEntryInput } from '../services/perceptionService';

const router = Router();

// HARD RULE: Content must be framed as YOUR belief, not objective fact
const createPerceptionSchema = z.object({
  subject_person_id: z.string().uuid().optional(),
  subject_alias: z.string().min(1), // REQUIRED - no nulls
  content: z.string().min(1).refine(
    (content) => {
      // Validation: Check for perception framing
      const lower = content.toLowerCase().trim();
      const framing = ['i believed', 'i heard', 'i thought', 'i assumed', 'people said', 'rumor', 'i was told'];
      return framing.some(f => lower.startsWith(f)) || lower.length < 20;
    },
    { message: 'Content must be framed as YOUR perception (e.g., "I believed...", "I heard that...")' }
  ),
  source: z.enum(['overheard', 'told_by', 'rumor', 'social_media', 'intuition', 'assumption']), // Strict enum
  source_detail: z.string().optional(), // e.g. "told by Alex"
  confidence_level: z.number().min(0).max(1).optional().default(0.3), // Default LOW
  sentiment: z.enum(['positive', 'negative', 'neutral', 'mixed']).optional(),
  timestamp_heard: z.string().datetime().optional(),
  related_memory_id: z.string().uuid().optional(), // Link to journal entry if related
  impact_on_me: z.string().min(1), // REQUIRED - Key Insight Lever
  created_in_high_emotion: z.boolean().optional().default(false),
  review_reminder_days: z.number().int().min(1).max(90).optional().default(7)
});

// HARD RULE: Updates track evolution, not overwrites
const updatePerceptionSchema = createPerceptionSchema.partial().extend({
  impact_on_me: z.string().min(1).optional(), // Can be updated but should always have a value
  status: z.enum(['unverified', 'confirmed', 'disproven', 'retracted']).optional(),
  retracted: z.boolean().optional(),
  resolution_note: z.string().optional(), // Notes on resolution/retraction (tracks evolution)
  evolution_note: z.string().optional() // Add a note to evolution_notes array (preserves history)
});

/**
 * Create a new perception entry
 */
router.post('/', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const parsed = createPerceptionSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid perception data', details: parsed.error.flatten() });
    }

    const userId = req.user!.id;
    const perception = await perceptionService.createPerceptionEntry(userId, parsed.data);

    res.status(201).json({ perception });
  } catch (error) {
    logger.error({ err: error }, 'Failed to create perception entry');
    res.status(500).json({ error: 'Failed to create perception entry' });
  }
});

/**
 * Get perception entries
 */
router.get('/', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;
    const {
      subject_person_id,
      subject_alias,
      source,
      retracted,
      status,
      limit,
      offset
    } = req.query;

    const filters: {
      subject_person_id?: string;
      subject_alias?: string;
      source?: any;
      retracted?: boolean;
      status?: any;
      limit?: number;
      offset?: number;
    } = {};

    if (subject_person_id && typeof subject_person_id === 'string') {
      filters.subject_person_id = subject_person_id;
    }
    if (subject_alias && typeof subject_alias === 'string') {
      filters.subject_alias = subject_alias;
    }
    if (source && typeof source === 'string') {
      filters.source = source as any;
    }
    if (retracted !== undefined) {
      filters.retracted = retracted === 'true';
    }
    if (status && typeof status === 'string') {
      filters.status = status as any;
    }
    if (limit) {
      filters.limit = parseInt(limit as string, 10);
    }
    if (offset) {
      filters.offset = parseInt(offset as string, 10);
    }

    const perceptions = await perceptionService.getPerceptionEntries(userId, filters);

    res.json({ perceptions });
  } catch (error) {
    logger.error({ err: error }, 'Failed to get perception entries');
    res.status(500).json({ error: 'Failed to get perception entries' });
  }
});

/**
 * Get perception entries for a specific person
 */
router.get('/about/:personId', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;
    const personId = req.params.personId as string;

    const perceptions = await perceptionService.getPerceptionsAboutPerson(userId, personId);

    res.json({ perceptions });
  } catch (error) {
    logger.error({ err: error }, 'Failed to get perceptions about person');
    res.status(500).json({ error: 'Failed to get perceptions about person' });
  }
});

/**
 * Get perception evolution for a person
 * HARD RULE: Shows versioned beliefs over time (not overwrites)
 */
router.get('/evolution/:personId', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;
    const personId = req.params.personId as string;

    const perceptions = await perceptionService.getPerceptionEvolution(userId, personId);

    res.json({ perceptions });
  } catch (error) {
    logger.error({ err: error }, 'Failed to get perception evolution');
    res.status(500).json({ error: 'Failed to get perception evolution' });
  }
});

/**
 * Get perception lens view
 * HARD RULE: This is a view mode, not a data structure
 * Filters by time bucket + subject for "What I believed during X period"
 */
router.get('/lens', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;
    const { timeStart, timeEnd, subject_alias, source, confidence_min, confidence_max, status } = req.query;

    const perceptions = await perceptionService.getPerceptionLens(userId, {
      timeStart: timeStart as string | undefined,
      timeEnd: timeEnd as string | undefined,
      subject_alias: subject_alias as string | undefined,
      source: source as any,
      confidence_min: confidence_min ? parseFloat(confidence_min as string) : undefined,
      confidence_max: confidence_max ? parseFloat(confidence_max as string) : undefined,
      status: status as any
    });

    res.json({ perceptions });
  } catch (error) {
    logger.error({ err: error }, 'Failed to get perception lens');
    res.status(500).json({ error: 'Failed to get perception lens' });
  }
});

/**
 * Get entries that need cool-down review (high-emotion entries past reminder date)
 */
router.get('/review-needed', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;
    const entries = await perceptionService.getEntriesNeedingReview(userId);
    res.json({ entries });
  } catch (error) {
    logger.error({ err: error }, 'Failed to get entries needing review');
    res.status(500).json({ error: 'Failed to get entries needing review' });
  }
});

/**
 * Update a perception entry
 */
router.patch('/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const parsed = updatePerceptionSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid perception data', details: parsed.error.flatten() });
    }

    const userId = req.user!.id;
    const id = req.params.id as string;

    const perception = await perceptionService.updatePerceptionEntry(userId, id, parsed.data);

    res.json({ perception });
  } catch (error) {
    logger.error({ err: error }, 'Failed to update perception entry');
    res.status(500).json({ error: 'Failed to update perception entry' });
  }
});

/**
 * Delete a perception entry
 */
router.delete('/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;
    const id = req.params.id as string;

    await perceptionService.deletePerceptionEntry(userId, id);

    res.status(204).send();
  } catch (error) {
    logger.error({ err: error }, 'Failed to delete perception entry');
    res.status(500).json({ error: 'Failed to delete perception entry' });
  }
});

/**
 * Detect whether a message contains a perception-worthy statement.
 * Lightweight heuristic — no AI call. Used by the chat composer to
 * decide whether to surface the "Save as perception?" chip.
 */
router.post('/detect', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const schema = z.object({ text: z.string().min(1) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'text is required' });
    }

    const { text } = parsed.data;
    const lower = text.toLowerCase();

    // Perception signal phrases — someone is forming a belief about another person
    const perceptionSignals = [
      'i think', 'i believe', 'i heard', 'i feel like', 'i assumed',
      'i thought', 'i perceived', 'i got the sense', 'i got the impression',
      'people say', 'rumor', 'i was told', 'someone told me', 'i overheard',
      'i read that', 'i noticed', 'it seemed like', 'i suspect',
    ];

    // Third-person subject indicators — must be about someone else
    const thirdPersonSignals = [
      ' he ', ' she ', ' they ', ' him ', ' her ', ' them ',
      ' his ', ' her ', ' their ', "'s ", ' is ', ' was ', ' has ',
    ];

    const hasPerceptionSignal = perceptionSignals.some(p => lower.includes(p));
    const hasThirdPerson = thirdPersonSignals.some(p => lower.includes(p));
    const isPerception = hasPerceptionSignal && hasThirdPerson && text.length > 15;

    // Extract a rough subject hint (the first capitalized name-like word after a signal)
    const nameMatch = text.match(/\b([A-Z][a-z]{2,})\b/);
    const subjectHint = nameMatch ? nameMatch[1] : null;

    res.json({
      isPerception,
      confidence: isPerception ? (hasPerceptionSignal && hasThirdPerson ? 0.7 : 0.4) : 0.1,
      subjectHint,
    });
  } catch (error) {
    logger.error({ err: error }, 'Failed to detect perception');
    res.status(500).json({ error: 'Failed to detect perception' });
  }
});

/**
 * Extract and auto-create perceptions from chat/gossip
 * This is the endpoint for the gossip chat bot
 */
router.post('/extract-from-chat', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.id;
    const { message, conversationHistory = [] } = req.body;

    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'Message is required' });
    }

    // Extract perceptions from chat
    const extraction = await perceptionChatService.extractPerceptionsFromChat(
      userId,
      message,
      conversationHistory
    );

    // Auto-create perception entries
    const created = await perceptionChatService.createPerceptionsFromExtraction(userId, extraction);

    res.json({
      extraction,
      created,
      summary: {
        perceptionsFound: extraction.perceptions.length,
        perceptionsCreated: created.length,
        charactersCreated: extraction.charactersCreated.length,
        charactersLinked: extraction.charactersLinked.length,
        needsFraming: extraction.needsFraming
      }
    });
  } catch (error) {
    logger.error({ err: error }, 'Failed to extract perceptions from chat');
    res.status(500).json({ error: 'Failed to extract perceptions from chat' });
  }
});

export default router;
