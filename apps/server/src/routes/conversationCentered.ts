// =====================================================
// CONVERSATION-CENTERED API ROUTES
// Purpose: API endpoints for conversation-first architecture
// =====================================================

import { Router } from 'express';
import { z } from 'zod';
import { logger } from '../logger';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';
import { conversationIngestionPipeline } from '../services/conversationCentered/ingestionPipeline';
import { eventAssemblyService } from '../services/conversationCentered/eventAssemblyService';
import { correctionResolutionService } from '../services/conversationCentered/correctionResolutionService';
import { omegaChatService } from '../services/omegaChatService';
import { confidenceTrackingService } from '../services/confidenceTrackingService';
import { selfAwarenessService } from '../services/selfAwarenessService';
import { metaControlService } from '../services/metaControlService';
import { narrativeContinuityService } from '../services/narrativeContinuityService';
import { supabaseAdmin } from '../services/supabaseClient';

const router = Router();

/**
 * POST /api/conversation/ingest
 * Ingest a message through the full pipeline
 */
router.post(
  '/ingest',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const schema = z.object({
      thread_id: z.string().uuid(),
      sender: z.enum(['USER', 'AI']),
      raw_text: z.string().min(1),
      conversation_history: z
        .array(
          z.object({
            role: z.enum(['user', 'assistant']),
            content: z.string(),
          })
        )
        .optional(),
      event_context: z.string().uuid().optional(), // Event ID if scoped to an event
    });

    const body = schema.parse(req.body);
    const userId = req.user!.id;

    const result = await conversationIngestionPipeline.ingestMessage(
      userId,
      body.thread_id,
      body.sender,
      body.raw_text,
      body.conversation_history,
      body.event_context
    );

    res.json({
      success: true,
      message_id: result.messageId,
      utterance_ids: result.utteranceIds,
      unit_ids: result.unitIds,
    });
  })
);

/**
 * POST /api/conversation/assemble-events
 * Assemble events from extracted units
 */
router.post(
  '/assemble-events',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;

    const events = await eventAssemblyService.assembleEvents(userId);

    res.json({
      success: true,
      events,
    });
  })
);

/**
 * GET /api/conversation/threads
 * Get all conversation threads for user
 */
router.get(
  '/threads',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;

    const { data: threads, error } = await supabaseAdmin
      .from('conversation_sessions')
      .select('*')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false });

    if (error) {
      throw error;
    }

    res.json({
      success: true,
      threads: threads || [],
    });
  })
);

/**
 * GET /api/conversation/threads/:id/messages
 * Get all messages in a thread
 */
router.get(
  '/threads/:id/messages',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const { id } = req.params;
    const userId = req.user!.id;

    // Verify thread belongs to user
    const { data: thread } = await supabaseAdmin
      .from('conversation_sessions')
      .select('id')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (!thread) {
      return res.status(404).json({ error: 'Thread not found' });
    }

    const { data: messages, error } = await supabaseAdmin
      .from('conversation_messages')
      .select('*')
      .eq('session_id', id)
      .order('created_at', { ascending: true });

    if (error) {
      throw error;
    }

    res.json({
      success: true,
      messages: messages || [],
    });
  })
);

/**
 * GET /api/conversation/threads/:id/units
 * Get all extracted units from a thread
 */
router.get(
  '/threads/:id/units',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const { id } = req.params;
    const userId = req.user!.id;

    // Get all messages in thread
    const { data: messages } = await supabaseAdmin
      .from('conversation_messages')
      .select('id')
      .eq('session_id', id)
      .eq('user_id', userId);

    if (!messages || messages.length === 0) {
      return res.json({
        success: true,
        units: [],
      });
    }

    const messageIds = messages.map(m => m.id);

    // Get all utterances for these messages
    const { data: utterances } = await supabaseAdmin
      .from('utterances')
      .select('id')
      .in('message_id', messageIds)
      .eq('user_id', userId);

    if (!utterances || utterances.length === 0) {
      return res.json({
        success: true,
        units: [],
      });
    }

    const utteranceIds = utterances.map(u => u.id);

    // Get all extracted units
    const { data: units, error } = await supabaseAdmin
      .from('extracted_units')
      .select('*')
      .in('utterance_id', utteranceIds)
      .eq('user_id', userId)
      .order('created_at', { ascending: true });

    if (error) {
      throw error;
    }

    res.json({
      success: true,
      units: units || [],
    });
  })
);

/**
 * POST /api/conversation/resolve-contradiction
 * Manually resolve a contradiction between two units
 */
router.post(
  '/resolve-contradiction',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const schema = z.object({
      unit1_id: z.string().uuid(),
      unit2_id: z.string().uuid(),
      resolution: z.enum(['NEW_WINS', 'OLD_WINS', 'BOTH_DEPRECATED', 'NEEDS_REVIEW']),
      reason: z.string().optional(),
    });

    const body = schema.parse(req.body);
    const userId = req.user!.id;

    // Verify both units belong to user
    const { data: units } = await supabaseAdmin
      .from('extracted_units')
      .select('id, user_id')
      .in('id', [body.unit1_id, body.unit2_id])
      .eq('user_id', userId);

    if (!units || units.length !== 2) {
      return res.status(404).json({ error: 'One or both units not found' });
    }

    const result = await correctionResolutionService.resolveContradiction(
      userId,
      body.unit1_id,
      body.unit2_id,
      body.resolution,
      body.reason
    );

    res.json({
      success: true,
      resolution: result,
    });
  })
);

/**
 * POST /api/conversation/correct-unit
 * Explicitly mark a unit as correcting another unit
 */
router.post(
  '/correct-unit',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const schema = z.object({
      correction_unit_id: z.string().uuid(),
      corrected_unit_id: z.string().uuid(),
      correction_type: z.enum(['EXPLICIT', 'IMPLICIT', 'CONTRADICTION']).optional(),
    });

    const body = schema.parse(req.body);
    const userId = req.user!.id;

    // Verify both units belong to user
    const { data: units } = await supabaseAdmin
      .from('extracted_units')
      .select('*')
      .in('id', [body.correction_unit_id, body.corrected_unit_id])
      .eq('user_id', userId);

    if (!units || units.length !== 2) {
      return res.status(404).json({ error: 'One or both units not found' });
    }

    const correctionUnit = units.find(u => u.id === body.correction_unit_id);
    const correctedUnit = units.find(u => u.id === body.corrected_unit_id);

    if (!correctionUnit || !correctedUnit) {
      return res.status(404).json({ error: 'Units not found' });
    }

    await correctionResolutionService.processCorrection(
      userId,
      correctionUnit,
      [body.corrected_unit_id],
      body.correction_type || 'EXPLICIT'
    );

    res.json({
      success: true,
      message: 'Correction processed successfully',
    });
  })
);

/**
 * POST /api/conversation/prune-deprecated
 * Prune deprecated units older than specified days
 */
router.post(
  '/prune-deprecated',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const schema = z.object({
      older_than_days: z.number().int().min(1).max(365).optional().default(30),
    });

    const body = schema.parse(req.body);
    const userId = req.user!.id;

    const prunedCount = await correctionResolutionService.pruneDeprecatedUnits(
      userId,
      body.older_than_days
    );

    res.json({
      success: true,
      pruned_count: prunedCount,
      message: `Pruned ${prunedCount} deprecated units`,
    });
  })
);

/**
 * GET /api/conversation/contradictions
 * Get all contradictions that need review
 */
router.get(
  '/contradictions',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;

    // Get units marked for review
    const { data: reviewUnits, error: reviewError } = await supabaseAdmin
      .from('extracted_units')
      .select('*')
      .eq('user_id', userId)
      .eq('metadata->>needs_review', 'true')
      .order('created_at', { ascending: false });

    if (reviewError) {
      throw reviewError;
    }

    // Get deprecated units with contradictions
    const { data: deprecatedUnits, error: depError } = await supabaseAdmin
      .from('extracted_units')
      .select('*')
      .eq('user_id', userId)
      .eq('metadata->>deprecated', 'true')
      .not('metadata->>deprecation_reason', 'is', null)
      .order('created_at', { ascending: false })
      .limit(50);

    if (depError) {
      throw depError;
    }

    res.json({
      success: true,
      needs_review: reviewUnits || [],
      deprecated: deprecatedUnits || [],
    });
  })
);

/**
 * GET /api/conversation/events
 * Get all events for user, sorted by time
 */
router.get(
  '/events',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;

    // Get all events, then filter by overrides
    const { data: events, error } = await supabaseAdmin
      .from('resolved_events')
      .select('*')
      .eq('user_id', userId)
      .order('start_time', { ascending: false });

    if (error) {
      throw error;
    }

    // Filter out archived and not-important events
    const filteredEvents = [];
    for (const event of events || []) {
      const isArchived = await metaControlService.hasOverride(
        userId,
        event.id,
        'EVENT',
        'ARCHIVE'
      );
      if (isArchived) continue;

      const isNotImportant = await metaControlService.hasOverride(
        userId,
        event.id,
        'EVENT',
        'NOT_IMPORTANT'
      );
      if (isNotImportant) continue;

      filteredEvents.push(event);
    }

    if (error) {
      throw error;
    }

    // Get source unit counts for each event
    const eventsWithCounts = await Promise.all(
      filteredEvents.map(async event => {
        const { count } = await supabaseAdmin
          .from('event_unit_links')
          .select('*', { count: 'exact', head: true })
          .eq('event_id', event.id);

        return {
          ...event,
          source_count: count || 0,
        };
      })
    );

    res.json({
      success: true,
      events: eventsWithCounts,
    });
  })
);

/**
 * GET /api/conversation/events/:id
 * Get a specific event with source messages, linked decisions, and insights
 */
router.get(
  '/events/:id',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const { id } = req.params;
    const userId = req.user!.id;

    // Get event
    const { data: event, error: eventError } = await supabaseAdmin
      .from('resolved_events')
      .select('*')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (eventError || !event) {
      return res.status(404).json({ error: 'Event not found' });
    }

    // Get linked units
    const { data: unitLinks, error: linksError } = await supabaseAdmin
      .from('event_unit_links')
      .select('unit_id')
      .eq('event_id', id);

    if (linksError) {
      throw linksError;
    }

    const unitIds = (unitLinks || []).map(link => link.unit_id);

    // Get source messages from units
    const sourceMessages: any[] = [];
    if (unitIds.length > 0) {
      // Get utterances for these units
      const { data: units } = await supabaseAdmin
        .from('extracted_units')
        .select('utterance_id')
        .in('id', unitIds);

      const utteranceIds = (units || []).map(u => u.utterance_id);

      if (utteranceIds.length > 0) {
        // Get messages for these utterances
        const { data: utterances } = await supabaseAdmin
          .from('utterances')
          .select('message_id, original_text, created_at')
          .in('id', utteranceIds);

        const messageIds = (utterances || []).map(u => u.message_id);

        if (messageIds.length > 0) {
          const { data: messages } = await supabaseAdmin
            .from('conversation_messages')
            .select('id, role, content, created_at, session_id')
            .in('id', messageIds)
            .order('created_at', { ascending: true });

          // Combine with utterance info
          sourceMessages.push(
            ...(messages || []).map(msg => {
              const utterance = utterances?.find(u => u.message_id === msg.id);
              return {
                ...msg,
                original_text: utterance?.original_text || msg.content,
                utterance_created_at: utterance?.created_at,
              };
            })
          );
        }
      }
    }

    // Get linked decisions (from memory_review_queue or decisions table if exists)
    const linkedDecisions: any[] = [];
    try {
      // Check if decisions table exists and has event links
      const { data: decisions } = await supabaseAdmin
        .from('decisions')
        .select('*')
        .eq('user_id', userId)
        .contains('linked_event_ids', [id])
        .limit(10);

      if (decisions) {
        linkedDecisions.push(...decisions);
      }
    } catch (error) {
      // Decisions table might not exist, that's okay
      logger.debug({ error, eventId: id }, 'Could not fetch linked decisions');
    }

    // Get linked insights (from insights table if exists)
    const linkedInsights: any[] = [];
    try {
      const { data: insights } = await supabaseAdmin
        .from('insights')
        .select('*')
        .eq('user_id', userId)
        .contains('linked_event_ids', [id])
        .limit(10);

      if (insights) {
        linkedInsights.push(...insights);
      }
    } catch (error) {
      // Insights table might not exist, that's okay
      logger.debug({ error, eventId: id }, 'Could not fetch linked insights');
    }

    // Get confidence history
    const confidenceHistory = await confidenceTrackingService.getConfidenceHistory(id, userId);

    // Get continuity links
    const continuityLinks = await narrativeContinuityService.getContinuityLinksForEvent(
      id,
      userId
    );
    const continuityNotes = continuityLinks.map(link =>
      narrativeContinuityService.generateContinuityLanguage(link)
    );

    res.json({
      success: true,
      event: {
        ...event,
        source_messages: sourceMessages,
        source_unit_ids: unitIds,
        linked_decisions: linkedDecisions,
        linked_insights: linkedInsights,
        confidence_history: confidenceHistory,
        continuity_notes: continuityNotes,
      },
    });
  })
);

/**
 * GET /api/conversation/events/:id/sources
 * Get source messages for an event (dedicated endpoint)
 */
router.get(
  '/events/:id/sources',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const { id } = req.params;
    const userId = req.user!.id;

    // Verify event exists and belongs to user
    const { data: event } = await supabaseAdmin
      .from('resolved_events')
      .select('id')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }

    // Get linked units
    const { data: unitLinks } = await supabaseAdmin
      .from('event_unit_links')
      .select('unit_id')
      .eq('event_id', id);

    const unitIds = (unitLinks || []).map(link => link.unit_id);

    // Get source messages from units
    const sourceMessages: any[] = [];
    if (unitIds.length > 0) {
      const { data: units } = await supabaseAdmin
        .from('extracted_units')
        .select('utterance_id')
        .in('id', unitIds);

      const utteranceIds = (units || []).map(u => u.utterance_id);

      if (utteranceIds.length > 0) {
        const { data: utterances } = await supabaseAdmin
          .from('utterances')
          .select('message_id, original_text, created_at')
          .in('id', utteranceIds);

        const messageIds = (utterances || []).map(u => u.message_id);

        if (messageIds.length > 0) {
          const { data: messages } = await supabaseAdmin
            .from('conversation_messages')
            .select('id, role, content, created_at, session_id')
            .in('id', messageIds)
            .order('created_at', { ascending: true });

          sourceMessages.push(
            ...(messages || []).map(msg => {
              const utterance = utterances?.find(u => u.message_id === msg.id);
              return {
                ...msg,
                original_text: utterance?.original_text || msg.content,
                utterance_created_at: utterance?.created_at,
              };
            })
          );
        }
      }
    }

    res.json({
      success: true,
      sources: sourceMessages,
    });
  })
);

/**
 * POST /api/conversation/events/:id/chat
 * Send a message scoped to a specific event
 */
router.post(
  '/events/:id/chat',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const { id: eventId } = req.params;
    const userId = req.user!.id;

    const schema = z.object({
      message: z.string().min(1),
    });

    const body = schema.parse(req.body);

    // Verify event exists and belongs to user, get full event data for context
    const { data: event } = await supabaseAdmin
      .from('resolved_events')
      .select('*')
      .eq('id', eventId)
      .eq('user_id', userId)
      .single();

    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }

    // Get source count for self-awareness
    const { count: sourceCount } = await supabaseAdmin
      .from('event_unit_links')
      .select('*', { count: 'exact', head: true })
      .eq('event_id', eventId);

    // Get or create event-scoped conversation thread
    // Use metadata to mark this as an event-scoped thread
    const { data: existingThread } = await supabaseAdmin
      .from('conversation_sessions')
      .select('id')
      .eq('user_id', userId)
      .eq('metadata->>event_id', eventId)
      .single();

    let threadId: string;
    if (existingThread) {
      threadId = existingThread.id;
    } else {
      const { data: newThread, error: threadError } = await supabaseAdmin
        .from('conversation_sessions')
        .insert({
          user_id: userId,
          scope: 'PRIVATE',
          metadata: {
            event_id: eventId,
            is_event_scoped: true,
          },
        })
        .select('id')
        .single();

      if (threadError || !newThread) {
        throw threadError || new Error('Failed to create event thread');
      }

      threadId = newThread.id;
    }

    // Get conversation history for context
    const { data: recentMessages } = await supabaseAdmin
      .from('conversation_messages')
      .select('role, content')
      .eq('session_id', threadId)
      .order('created_at', { ascending: false })
      .limit(10);

    const conversationHistory = (recentMessages || [])
      .reverse()
      .map(msg => ({
        role: msg.role === 'user' ? 'user' as const : 'assistant' as const,
        content: msg.content,
      }));

    // Fire-and-forget: Ingest message with event context (async, non-blocking)
    conversationIngestionPipeline
      .ingestMessage(
        userId,
        threadId,
        'USER',
        body.message,
        conversationHistory,
        eventId // event context
      )
      .then(async () => {
        // After ingestion, reconcile the event to update it with new information
        await eventAssemblyService.reconcileEvent(eventId, userId);
      })
      .catch(err => {
        logger.warn({ error: err, eventId, userId }, 'Event-scoped ingestion failed (non-blocking)');
      });

    // Generate AI response with event context
    const chatResponse = await omegaChatService.chat(
      userId,
      body.message,
      conversationHistory,
      undefined // No entity context, but event context is handled via ingestion
    );

    // Apply self-awareness modifiers
    const selfAwarenessContext = {
      event: {
        confidence: event.confidence || 0.5,
        source_count: sourceCount || 0,
      },
      scope: 'EVENT' as const,
    };

    const uncertainty = selfAwarenessService.detectUncertainty(selfAwarenessContext);
    const confidence = selfAwarenessService.detectConfidence(selfAwarenessContext);
    const toneModifiers = selfAwarenessService.buildSelfAwarenessTone(uncertainty, confidence);
    const whyStatement = selfAwarenessService.buildWhyStatement(selfAwarenessContext);

    // Apply tone to response
    const enhancedResponse = selfAwarenessService.applyTone(chatResponse.response, toneModifiers);

    // Save AI response
    await supabaseAdmin.from('conversation_messages').insert({
      user_id: userId,
      session_id: threadId,
      role: 'assistant',
      content: enhancedResponse,
    });

    res.json({
      success: true,
      response: enhancedResponse,
      meta: {
        uncertainty_level: uncertainty.level,
        confidence_level: confidence.level,
        why: whyStatement,
        confidence_humanized: selfAwarenessService.humanizeConfidence(event.confidence || 0.5),
      },
      thread_id: threadId,
      event_id: eventId,
    });
  })
);

export default router;

