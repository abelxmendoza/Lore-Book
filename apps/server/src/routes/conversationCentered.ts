// =====================================================
// CONVERSATION-CENTERED API ROUTES
// Purpose: API endpoints for conversation-first architecture
// =====================================================

import { Router } from 'express';
import { z } from 'zod';

import { logger } from '../logger';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';
import { confidenceTrackingService } from '../services/confidenceTrackingService';
import { narrativeContinuityService } from '../services/narrativeContinuityService';
import { omegaChatService } from '../services/omegaChatService';
import { supabaseAdmin } from '../services/supabaseClient';
import { asyncHandler } from '../utils/asyncHandler';
import { affectionCalculator } from '../services/conversationCentered/affectionCalculator';
import { breakupDetector } from '../services/conversationCentered/breakupDetector';
import { characterTimelineBuilder } from '../services/conversationCentered/characterTimelineBuilder';
import { correctionResolutionService } from '../services/conversationCentered/correctionResolutionService';
import { conversationIngestionPipeline } from '../services/conversationCentered/ingestionPipeline';
import { entityAttributeDetector } from '../services/conversationCentered/entityAttributeDetector';
import { entityRelationshipDetector } from '../services/conversationCentered/entityRelationshipDetector';
import { entityScopeService } from '../services/conversationCentered/entityScopeService';
import { eventAssemblyService } from '../services/conversationCentered/eventAssemblyService';
import { eventCausalDetector } from '../services/conversationCentered/eventCausalDetector';
import { eventImpactDetector } from '../services/conversationCentered/eventImpactDetector';
import { groupNetworkBuilder } from '../services/conversationCentered/groupNetworkBuilder';
import { memoryTraceService } from '../services/conversationCentered/memoryTraceService';
import { relationshipCycleDetector } from '../services/conversationCentered/relationshipCycleDetector';
import { relationshipDriftDetector } from '../services/conversationCentered/relationshipDriftDetector';
import { relationshipTreeBuilder, type RelationshipCategory } from '../services/conversationCentered/relationshipTreeBuilder';
import { romanticRelationshipAnalytics } from '../services/conversationCentered/romanticRelationshipAnalytics';
import { romanticRelationshipDetector } from '../services/conversationCentered/romanticRelationshipDetector';
import { skillNetworkBuilder } from '../services/conversationCentered/skillNetworkBuilder';

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

    // Get source unit counts and impacts for each event
    const eventsWithCounts = await Promise.all(
      filteredEvents.map(async event => {
        const { count } = await supabaseAdmin
          .from('event_unit_links')
          .select('*', { count: 'exact', head: true })
          .eq('event_id', event.id);

        // Get impacts for this event
        const impacts = await eventImpactDetector.getEventImpacts(userId, event.id);
        const primaryImpact = impacts[0]; // Get the primary impact

        // Get connection character name if exists
        let connectionCharacterName: string | undefined;
        if (primaryImpact?.connectionCharacterId) {
          const { data: character } = await supabaseAdmin
            .from('characters')
            .select('name')
            .eq('id', primaryImpact.connectionCharacterId)
            .single();
          connectionCharacterName = character?.name;
        }

        return {
          ...event,
          source_count: count || 0,
          impact: primaryImpact
            ? {
                type: primaryImpact.impactType,
                connectionCharacter: connectionCharacterName,
                connectionType: primaryImpact.connectionType,
                emotionalImpact: primaryImpact.emotionalImpact,
                impactIntensity: primaryImpact.impactIntensity,
                impactDescription: primaryImpact.impactDescription,
              }
            : undefined,
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
 * GET /api/conversation/events/:id/causal-links
 * Get causal relationships for an event (both causes and effects)
 */
router.get(
  '/events/:id/causal-links',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const { id: eventId } = req.params;
    const userId = req.user!.id;

    // Verify event exists and belongs to user
    const { data: event } = await supabaseAdmin
      .from('resolved_events')
      .select('id')
      .eq('id', eventId)
      .eq('user_id', userId)
      .single();

    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }

    // Get causal links
    const causalLinks = await eventCausalDetector.getEventCausalLinks(userId, eventId);

    res.json({
      success: true,
      eventId,
      causes: causalLinks.causes,
      effects: causalLinks.effects,
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

/**
 * GET /api/conversation/trace/chat/:chatMessageId
 * Trace full lineage from a chat message
 * Shows: chat → conversation → utterance → unit → memory → event
 */
router.get(
  '/trace/chat/:chatMessageId',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const { chatMessageId } = req.params;
    const userId = req.user!.id;

    const trace = await memoryTraceService.traceFromChatMessage(userId, chatMessageId);

    if (!trace) {
      return res.status(404).json({
        error: 'Trace not found',
        message: 'Chat message not found or not yet processed',
      });
    }

    res.json({
      success: true,
      trace,
    });
  })
);

/**
 * GET /api/conversation/trace/memory/:artifactType/:artifactId
 * Reverse trace from a memory artifact
 * Shows: memory → unit → utterance → conversation → chat
 */
router.get(
  '/trace/memory/:artifactType/:artifactId',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const { artifactType, artifactId } = req.params;
    const userId = req.user!.id;

    if (!['perception_entry', 'journal_entry', 'insight'].includes(artifactType)) {
      return res.status(400).json({
        error: 'Invalid artifact type',
        message: 'Must be one of: perception_entry, journal_entry, insight',
      });
    }

    const trace = await memoryTraceService.traceFromMemoryArtifact(
      userId,
      artifactType as 'perception_entry' | 'journal_entry' | 'insight',
      artifactId
    );

    if (!trace) {
      return res.status(404).json({
        error: 'Trace not found',
        message: 'Memory artifact not found or has no trace',
      });
    }

    res.json({
      success: true,
      trace,
    });
  })
);

/**
 * GET /api/conversation/trace/unit/:unitId
 * Trace from an extracted unit
 * Shows: unit → memory artifacts + backward to utterance/conversation
 */
router.get(
  '/trace/unit/:unitId',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const { unitId } = req.params;
    const userId = req.user!.id;

    const trace = await memoryTraceService.traceFromExtractedUnit(userId, unitId);

    if (!trace) {
      return res.status(404).json({
        error: 'Trace not found',
        message: 'Extracted unit not found',
      });
    }

    res.json({
      success: true,
      trace,
    });
  })
);

/**
 * GET /api/conversation/entities/:entityId/relationships
 * Get all relationships for an entity
 */
router.get(
  '/entities/:entityId/relationships',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const { entityId } = req.params;
    const { entityType } = req.query;
    const userId = req.user!.id;

    if (!entityType || (entityType !== 'omega_entity' && entityType !== 'character')) {
      return res.status(400).json({ error: 'entityType must be omega_entity or character' });
    }

    const relationships = await entityRelationshipDetector.getEntityRelationships(
      userId,
      entityId,
      entityType as 'omega_entity' | 'character'
    );

    // Enrich with entity names
    const enriched = await Promise.all(
      relationships.map(async (rel) => {
        let fromName = '';
        let toName = '';

        if (rel.fromEntityType === 'character') {
          const { data: char } = await supabaseAdmin
            .from('characters')
            .select('name')
            .eq('id', rel.fromEntityId)
            .single();
          fromName = char?.name || '';
        } else {
          const { data: entity } = await supabaseAdmin
            .from('omega_entities')
            .select('primary_name')
            .eq('id', rel.fromEntityId)
            .single();
          fromName = entity?.primary_name || '';
        }

        if (rel.toEntityType === 'character') {
          const { data: char } = await supabaseAdmin
            .from('characters')
            .select('name')
            .eq('id', rel.toEntityId)
            .single();
          toName = char?.name || '';
        } else {
          const { data: entity } = await supabaseAdmin
            .from('omega_entities')
            .select('primary_name')
            .eq('id', rel.toEntityId)
            .single();
          toName = entity?.primary_name || '';
        }

        return {
          ...rel,
          fromEntityName: fromName,
          toEntityName: toName,
        };
      })
    );

    res.json({
      success: true,
      relationships: enriched,
    });
  })
);

/**
 * GET /api/conversation/entities/:entityId/scopes
 * Get all scopes for an entity
 */
router.get(
  '/entities/:entityId/scopes',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const { entityId } = req.params;
    const { entityType } = req.query;
    const userId = req.user!.id;

    if (!entityType || (entityType !== 'omega_entity' && entityType !== 'character')) {
      return res.status(400).json({ error: 'entityType must be omega_entity or character' });
    }

    const scopes = await entityRelationshipDetector.getEntityScopes(
      userId,
      entityId,
      entityType as 'omega_entity' | 'character'
    );

    res.json({
      success: true,
      scopes,
    });
  })
);

/**
 * GET /api/conversation/scopes/:scope/entities
 * Get all entities in a scope
 */
router.get(
  '/scopes/:scope/entities',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const { scope } = req.params;
    const { scopeContext } = req.query;
    const userId = req.user!.id;

    const entities = await entityScopeService.getEntitiesInScope(
      userId,
      scope,
      scopeContext as string | undefined
    );

    // Enrich with entity names
    const enriched = await Promise.all(
      entities.map(async (e) => {
        let name = '';
        if (e.type === 'character') {
          const { data: char } = await supabaseAdmin
            .from('characters')
            .select('name')
            .eq('id', e.id)
            .single();
          name = char?.name || '';
        } else {
          const { data: entity } = await supabaseAdmin
            .from('omega_entities')
            .select('primary_name')
            .eq('id', e.id)
            .single();
          name = entity?.primary_name || '';
        }

        return {
          ...e,
          name,
        };
      })
    );

    res.json({
      success: true,
      entities: enriched,
    });
  })
);

/**
 * GET /api/conversation/entities/:entityId/relationship-chain
 * Get relationship chain for an entity (e.g., Sam → works_for → Strativ Group → recruits_for → Mach Industries)
 */
router.get(
  '/entities/:entityId/relationship-chain',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const { entityId } = req.params;
    const { entityType } = req.query;
    const userId = req.user!.id;

    if (!entityType || (entityType !== 'omega_entity' && entityType !== 'character')) {
      return res.status(400).json({ error: 'entityType must be omega_entity or character' });
    }

    const chain = await entityScopeService.buildRelationshipChain(
      userId,
      entityId,
      entityType as 'omega_entity' | 'character'
    );

    // Enrich with entity names
    const enriched = await Promise.all(
      chain.map(async (link) => {
        let entityName = '';
        let nextEntityName = '';

        if (link.entityType === 'character') {
          const { data: char } = await supabaseAdmin
            .from('characters')
            .select('name')
            .eq('id', link.entityId)
            .single();
          entityName = char?.name || '';
        } else {
          const { data: entity } = await supabaseAdmin
            .from('omega_entities')
            .select('primary_name')
            .eq('id', link.entityId)
            .single();
          entityName = entity?.primary_name || '';
        }

        if (link.nextEntityType === 'character') {
          const { data: char } = await supabaseAdmin
            .from('characters')
            .select('name')
            .eq('id', link.nextEntityId)
            .single();
          nextEntityName = char?.name || '';
        } else {
          const { data: entity } = await supabaseAdmin
            .from('omega_entities')
            .select('primary_name')
            .eq('id', link.nextEntityId)
            .single();
          nextEntityName = entity?.primary_name || '';
        }

        return {
          ...link,
          entityName,
          nextEntityName,
        };
      })
    );

    res.json({
      success: true,
      chain: enriched,
    });
  })
);

/**
 * GET /api/conversation/relationship-trees/:entityId
 * Get relationship tree for a specific entity
 */
router.get(
  '/relationship-trees/:entityId',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const { entityId } = req.params;
    const userId = req.user!.id;
    const category = (req.query.category as RelationshipCategory) || 'all';
    const depth = parseInt(req.query.depth as string) || 3;
    const entityType = (req.query.entityType as 'omega_entity' | 'character') || 'character';

    // Try to get saved tree first
    let tree = await relationshipTreeBuilder.getSavedTree(userId, entityId, entityType);

    // If no saved tree or needs rebuild, build it
    if (!tree) {
      tree = await relationshipTreeBuilder.buildTree(userId, entityId, entityType, category, depth);
      if (tree) {
        await relationshipTreeBuilder.saveTree(userId, tree);
      }
    }

    if (!tree) {
      return res.status(404).json({ error: 'Entity not found or no relationships' });
    }

    res.json({
      success: true,
      tree: {
        rootNode: tree.rootNode,
        nodes: Array.from(tree.nodes.values()),
        relationships: tree.relationships,
        memberCount: tree.memberCount,
        relationshipCount: tree.relationshipCount,
        categories: tree.categories,
      },
    });
  })
);

/**
 * POST /api/conversation/relationship-trees/:entityId/rebuild
 * Rebuild relationship tree for an entity
 */
router.post(
  '/relationship-trees/:entityId/rebuild',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const { entityId } = req.params;
    const userId = req.user!.id;
    const category = (req.body.category as RelationshipCategory) || 'all';
    const depth = parseInt(req.body.depth as string) || 3;
    const entityType = (req.body.entityType as 'omega_entity' | 'character') || 'character';

    const tree = await relationshipTreeBuilder.buildTree(userId, entityId, entityType, category, depth);

    if (!tree) {
      return res.status(404).json({ error: 'Entity not found or no relationships' });
    }

    await relationshipTreeBuilder.saveTree(userId, tree);

    res.json({
      success: true,
      tree: {
        rootNode: tree.rootNode,
        nodes: Array.from(tree.nodes.values()),
        relationships: tree.relationships,
        memberCount: tree.memberCount,
        relationshipCount: tree.relationshipCount,
        categories: tree.categories,
      },
    });
  })
);

/**
 * GET /api/conversation/relationship-trees
 * Get all relationship trees (list of root entities with trees)
 */
router.get(
  '/relationship-trees',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;

    const { data: trees } = await supabaseAdmin
      .from('relationship_trees')
      .select('root_entity_id, root_entity_type, member_count, relationship_count, categories, last_updated')
      .eq('user_id', userId)
      .order('last_updated', { ascending: false });

    res.json({
      success: true,
      trees: trees || [],
    });
  })
);

/**
 * GET /api/conversation/entities/:entityId/attributes
 * Get attributes for an entity
 */
router.get(
  '/entities/:entityId/attributes',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const { entityId } = req.params;
    const userId = req.user!.id;
    const entityType = (req.query.entityType as 'omega_entity' | 'character') || 'character';
    const currentOnly = req.query.currentOnly === 'true';

    const attributes = await entityAttributeDetector.getEntityAttributes(
      userId,
      entityId,
      entityType,
      currentOnly
    );

    res.json({
      success: true,
      attributes,
    });
  })
);

import { metaControlService } from '../services/metaControlService';
import { narrativeContinuityService } from '../services/narrativeContinuityService';
import { selfAwarenessService } from '../services/selfAwarenessService';
import { supabaseAdmin } from '../services/supabaseClient';

/**
 * GET /api/conversation/skill-network
 * Get skill network for user
 */
router.get(
  '/skill-network',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const rootSkillId = req.query.rootSkillId as string | undefined;
    const depth = parseInt(req.query.depth as string) || 3;

    const network = await skillNetworkBuilder.buildNetwork(userId, rootSkillId, depth);

    res.json({
      success: true,
      network: {
        rootSkill: network.rootSkill,
        skills: Array.from(network.skills.values()),
        relationships: network.relationships,
        clusters: network.clusters,
        skillCount: network.skillCount,
        relationshipCount: network.relationshipCount,
      },
    });
  })
);

/**
 * POST /api/conversation/skill-network/detect-clusters
 * Detect and create skill clusters
 */
router.post(
  '/skill-network/detect-clusters',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;

    await skillNetworkBuilder.detectSkillClusters(userId);

    res.json({
      success: true,
      message: 'Skill clusters detected',
    });
  })
);

/**
 * GET /api/conversation/group-network
 * Get group network for user
 */
router.get(
  '/group-network',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const rootGroupId = req.query.rootGroupId as string | undefined;
    const depth = parseInt(req.query.depth as string) || 3;

    const network = await groupNetworkBuilder.buildNetwork(userId, rootGroupId, depth);

    res.json({
      success: true,
      network: {
        rootGroup: network.rootGroup,
        groups: Array.from(network.groups.values()),
        relationships: network.relationships,
        evolution: network.evolution,
        groupCount: network.groupCount,
        relationshipCount: network.relationshipCount,
      },
    });
  })
);

/**
 * GET /api/conversation/romantic-relationships
 * Get all romantic relationships
 */
router.get(
  '/romantic-relationships',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const status = req.query.status as string | undefined;
    const isCurrent = req.query.isCurrent === 'true';

    const query = supabaseAdmin
      .from('romantic_relationships')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (status) {
      query.eq('status', status);
    }
    if (isCurrent) {
      query.eq('is_current', true);
    }

    const { data: relationships, error } = await query;

    if (error) {
      throw error;
    }

    res.json({
      success: true,
      relationships: relationships || [],
    });
  })
);

/**
 * GET /api/conversation/romantic-relationships/top-affections
 * Get who you like most
 */
router.get(
  '/romantic-relationships/top-affections',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const limit = parseInt(req.query.limit as string) || 5;

    const topAffections = await affectionCalculator.getTopAffections(userId, limit);

    res.json({
      success: true,
      affections: topAffections,
    });
  })
);

/**
 * GET /api/conversation/romantic-relationships/:id/analytics
 * Get analytics for a relationship
 */
router.get(
  '/romantic-relationships/:id/analytics',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const { id } = req.params;

    const analytics = await romanticRelationshipAnalytics.generateAnalytics(userId, id);

    if (!analytics) {
      return res.status(404).json({
        success: false,
        error: 'Relationship not found',
      });
    }

    res.json({
      success: true,
      analytics,
    });
  })
);

/**
 * GET /api/conversation/romantic-relationships/:id/dates
 * Get dates and milestones for a relationship
 */
router.get(
  '/romantic-relationships/:id/dates',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const { id } = req.params;

    const { data: dates, error } = await supabaseAdmin
      .from('romantic_dates')
      .select('*')
      .eq('user_id', userId)
      .eq('relationship_id', id)
      .order('date_time', { ascending: false });

    if (error) {
      throw error;
    }

    res.json({
      success: true,
      dates: dates || [],
    });
  })
);

/**
 * POST /api/conversation/romantic-relationships/calculate-affection
 * Recalculate affection scores
 */
router.post(
  '/romantic-relationships/calculate-affection',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;

    const scores = await affectionCalculator.calculateAffectionScores(userId);

    res.json({
      success: true,
      scores,
    });
  })
);

/**
 * GET /api/conversation/romantic-relationships/:id/drift
 * Get relationship drift detection
 */
router.get(
  '/romantic-relationships/:id/drift',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const { id } = req.params;

    const { data: relationship } = await supabaseAdmin
      .from('romantic_relationships')
      .select('person_id, person_type')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (!relationship) {
      return res.status(404).json({
        success: false,
        error: 'Relationship not found',
      });
    }

    const drift = await relationshipDriftDetector.detectDrift(
      userId,
      id,
      relationship.person_id,
      relationship.person_type
    );

    // Get drift history
    const { data: driftHistory } = await supabaseAdmin
      .from('relationship_drift')
      .select('*')
      .eq('user_id', userId)
      .eq('relationship_id', id)
      .order('detected_at', { ascending: false })
      .limit(10);

    res.json({
      success: true,
      currentDrift: drift,
      driftHistory: driftHistory || [],
    });
  })
);

/**
 * GET /api/conversation/romantic-relationships/:id/cycles
 * Get relationship cycles/loops
 */
router.get(
  '/romantic-relationships/:id/cycles',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const { id } = req.params;

    const { data: relationship } = await supabaseAdmin
      .from('romantic_relationships')
      .select('person_id, person_type')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (!relationship) {
      return res.status(404).json({
        success: false,
        error: 'Relationship not found',
      });
    }

    // Detect cycles
    const cycles = await relationshipCycleDetector.detectCycles(
      userId,
      id,
      relationship.person_id,
      relationship.person_type
    );

    // Get cycle history
    const { data: cycleHistory } = await supabaseAdmin
      .from('relationship_cycles')
      .select('*')
      .eq('user_id', userId)
      .eq('relationship_id', id)
      .order('last_observed_at', { ascending: false });

    res.json({
      success: true,
      cycles,
      cycleHistory: cycleHistory || [],
    });
  })
);

/**
 * GET /api/conversation/romantic-relationships/:id/breakup
 * Get breakup information
 */
router.get(
  '/romantic-relationships/:id/breakup',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const { id } = req.params;

    const { data: breakup } = await supabaseAdmin
      .from('relationship_breakups')
      .select('*')
      .eq('user_id', userId)
      .eq('relationship_id', id)
      .order('breakup_date', { ascending: false })
      .limit(1)
      .single();

    if (!breakup) {
      return res.json({
        success: true,
        breakup: null,
      });
    }

    res.json({
      success: true,
      breakup,
    });
  })
);

/**
 * POST /api/conversation/romantic-relationships/detect-drift-all
 * Detect drift for all relationships
 */
router.post(
  '/romantic-relationships/detect-drift-all',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;

    const detections = await relationshipDriftDetector.detectDriftForAll(userId);

    res.json({
      success: true,
      detections,
    });
  })
);

/**
 * GET /api/conversation/characters/:id/timelines
 * Get character timelines (shared experiences and lore)
 */
router.get(
  '/characters/:id/timelines',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const { id } = req.params;

    const timelines = await characterTimelineBuilder.buildTimelines(userId, id);

    res.json({
      success: true,
      timelines,
    });
  })
);

/**
 * POST /api/conversation/characters/:id/rebuild-timelines
 * Rebuild timelines for a character
 */
router.post(
  '/characters/:id/rebuild-timelines',
  requireAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.id;
    const { id } = req.params;

    await characterTimelineBuilder.rebuildTimelinesForCharacter(userId, id);

    res.json({
      success: true,
      message: 'Timelines rebuilt',
    });
  })
);

export default router;

