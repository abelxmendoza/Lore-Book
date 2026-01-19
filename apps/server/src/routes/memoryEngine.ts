import { Router } from 'express';
import { z } from 'zod';

import { memoryExtractionWorker } from '../jobs/memoryExtractionWorker';
import { logger } from '../logger';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { conversationService } from '../services/conversationService';
import { memoryExtractionService } from '../services/memoryExtractionService';
import { ruleBasedMemoryDetectionService } from '../services/ruleBasedMemoryDetection';
import { timelineAssignmentService } from '../services/timelineAssignmentService';

const router = Router();

// Schema definitions
const createSessionSchema = z.object({
  title: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

const saveMessageSchema = z.object({
  sessionId: z.string().uuid(),
  role: z.enum(['user', 'assistant']),
  content: z.string().min(1).max(10000),
  metadata: z.record(z.unknown()).optional(),
});

const extractMemorySchema = z.object({
  sessionId: z.string().uuid(),
  immediate: z.boolean().optional().default(false),
});

/**
 * POST /api/memory-engine/session/start
 * Start a new conversation session
 */
router.post('/session/start', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const parsed = createSessionSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }

    const session = await conversationService.createSession({
      userId: req.user!.id,
      title: parsed.data.title,
      metadata: parsed.data.metadata,
    });

    res.status(201).json({ session });
  } catch (error) {
    logger.error({ error }, 'Failed to create session');
    res.status(500).json({
      error: 'Failed to create session',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/memory-engine/session/end
 * End a conversation session
 */
router.post('/session/end', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { sessionId, summary } = req.body;

    if (!sessionId || typeof sessionId !== 'string') {
      return res.status(400).json({ error: 'sessionId is required' });
    }

    const session = await conversationService.endSession(
      sessionId,
      req.user!.id,
      summary
    );

    res.json({ session });
  } catch (error) {
    logger.error({ error }, 'Failed to end session');
    res.status(500).json({
      error: 'Failed to end session',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/memory-engine/message
 * Save a conversation message
 */
router.post('/message', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const parsed = saveMessageSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }

    // Get or create active session if sessionId not provided
    let sessionId = parsed.data.sessionId;
    if (!sessionId) {
      const activeSession = await conversationService.getOrCreateActiveSession(req.user!.id);
      sessionId = activeSession.id;
    }

    const message = await conversationService.saveMessage({
      sessionId,
      userId: req.user!.id,
      role: parsed.data.role,
      content: parsed.data.content,
      metadata: parsed.data.metadata,
    });

    res.status(201).json({ message, sessionId });
  } catch (error) {
    logger.error({ error }, 'Failed to save message');
    res.status(500).json({
      error: 'Failed to save message',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/memory-engine/extract
 * Extract memory from conversation session
 */
router.post('/extract', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const parsed = extractMemorySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }

    // If immediate extraction requested, process now
    // Otherwise, queue for background processing
    if (parsed.data.immediate) {
      const result = await memoryExtractionService.extractMemory({
        sessionId: parsed.data.sessionId,
        userId: req.user!.id,
        immediate: true,
      });

      res.json({
        success: true,
        journalEntry: result.journalEntry,
        components: result.components,
        timelineLinks: result.timelineLinks,
        extractionConfidence: result.extractionConfidence,
      });
    } else {
      // Queue for background processing
      await memoryExtractionWorker.queueSession(parsed.data.sessionId);

      res.json({
        success: true,
        message: 'Memory extraction queued for background processing',
        sessionId: parsed.data.sessionId,
      });
    }
  } catch (error) {
    logger.error({ error }, 'Failed to extract memory');
    res.status(500).json({
      error: 'Failed to extract memory',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/memory-engine/session/:id
 * Get session details with messages
 */
router.get('/session/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;

    const sessionData = await conversationService.getSessionWithMessages(id, req.user!.id);

    if (!sessionData) {
      return res.status(404).json({ error: 'Session not found' });
    }

    res.json(sessionData);
  } catch (error) {
    logger.error({ error }, 'Failed to get session');
    res.status(500).json({
      error: 'Failed to get session',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/memory-engine/sessions
 * Get recent sessions for user
 */
router.get('/sessions', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 10;
    const sessions = await conversationService.getRecentSessions(req.user!.id, limit);

    res.json({ sessions });
  } catch (error) {
    logger.error({ error }, 'Failed to get sessions');
    res.status(500).json({
      error: 'Failed to get sessions',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/memory-engine/session/:id/messages
 * Get messages for a session
 */
router.get('/session/:id/messages', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;

    const messages = await conversationService.getSessionMessages(id, req.user!.id, limit);

    res.json({ messages });
  } catch (error) {
    logger.error({ error }, 'Failed to get messages');
    res.status(500).json({
      error: 'Failed to get messages',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/memory-engine/entry/:entryId/components
 * Get memory components for a journal entry
 */
router.get('/entry/:entryId/components', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { entryId } = req.params;

    const { data, error } = await supabaseAdmin
      .from('memory_components')
      .select('*')
      .eq('journal_entry_id', entryId)
      .order('importance_score', { ascending: false });

    if (error) {
      logger.error({ error, entryId }, 'Failed to get components');
      return res.status(500).json({
        error: 'Failed to get components',
        message: error.message,
      });
    }

    // Verify entry belongs to user
    const { data: entry } = await supabaseAdmin
      .from('journal_entries')
      .select('user_id')
      .eq('id', entryId)
      .single();

    if (!entry || entry.user_id !== req.user!.id) {
      return res.status(404).json({ error: 'Entry not found' });
    }

    res.json({ components: data || [] });
  } catch (error) {
    logger.error({ error }, 'Failed to get components');
    res.status(500).json({
      error: 'Failed to get components',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/memory-engine/component/:componentId/timeline
 * Get timeline links for a component
 */
router.get('/component/:componentId/timeline', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { componentId } = req.params;

    const links = await timelineAssignmentService.getTimelineLinks(componentId);

    res.json({ links });
  } catch (error) {
    logger.error({ error }, 'Failed to get timeline links');
    res.status(500).json({
      error: 'Failed to get timeline links',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/memory-engine/timeline/:level/:levelId/components
 * Get components for a timeline level
 */
router.get('/timeline/:level/:levelId/components', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { level, levelId } = req.params;

    const validLevels = ['mythos', 'epoch', 'era', 'saga', 'arc', 'chapter', 'scene', 'action', 'micro_action'];
    if (!validLevels.includes(level)) {
      return res.status(400).json({ error: `Invalid timeline level. Must be one of: ${validLevels.join(', ')}` });
    }

    const components = await timelineAssignmentService.getComponentsForTimelineLevel(
      level as any,
      levelId
    );

    res.json({ components });
  } catch (error) {
    logger.error({ error }, 'Failed to get timeline components');
    res.status(500).json({
      error: 'Failed to get timeline components',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/memory-engine/detect
 * Detect if content is memory-worthy (for testing/debugging)
 */
router.post('/detect', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { content, conversationContext } = req.body;

    if (!content || typeof content !== 'string') {
      return res.status(400).json({ error: 'content is required' });
    }

    const detection = await ruleBasedMemoryDetectionService.detectMemoryWorthy(
      content,
      conversationContext
    );

    res.json(detection);
  } catch (error) {
    logger.error({ error }, 'Failed to detect memory');
    res.status(500).json({
      error: 'Failed to detect memory',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export const memoryEngineRouter = router;

