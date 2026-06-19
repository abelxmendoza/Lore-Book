// =====================================================
// CONVERSATION INGESTION PIPELINE
// Purpose: Process messages through full pipeline
// =====================================================

import { logger } from '../../logger';
import { isIndividualPersonName } from '../../utils/personNameValidation';
import { detectAIUncertainty } from '../../utils/aiUncertainty';
import { supabaseAdmin } from '../supabaseClient';
import { memoryFeedbackBus, type MemoryFeedbackEvent } from '../memoryFeedbackBus';
import { normalizationService } from './normalizationService';
import { semanticExtractionService } from './semanticExtractionService';
import { eventAssemblyService } from './eventAssemblyService';
import { multiEventSplittingService } from './multiEventSplittingService';
import { correctionResolutionService } from './correctionResolutionService';
import { entryEnrichmentService } from '../entryEnrichmentService';
import { knowledgeTypeEngineService } from '../knowledgeTypeEngineService';
import { irCompiler } from '../compiler/irCompiler';
import { dependencyGraph } from '../compiler/dependencyGraph';
import { memoryConsolidationService } from '../compiler/memoryConsolidationService';
import { entityRegistry } from '../entityRegistry';
import { buildMessageLexicalSignals } from '../ontology/messageLexicalMetadataService';
import { semanticConversionService } from './semanticConversion';
import {
  linkContextualEvents,
  resolveAmbiguousEntity,
  updateHouseholdHypotheses,
  learnAlias,
} from './contextualIntelligence';
import { eventImpactDetector } from './eventImpactDetector';
import { eventCausalDetector } from './eventCausalDetector';
import { entityRelationshipDetector } from './entityRelationshipDetector';
import { entityScopeService } from './entityScopeService';
import { entityAttributeDetector } from './entityAttributeDetector';
import { skillNetworkBuilder } from './skillNetworkBuilder';
import { groupNetworkBuilder } from './groupNetworkBuilder';
import { romanticRelationshipDetector } from './romanticRelationshipDetector';
import { ingestRomanticLexicalFromMessage } from '../romanticLexicalIngestionService';
import { ingestRelationshipPeripheralsFromMessage } from '../relationshipPeripheralService';
import { hasRomanticSignals } from '../ontology/romanticIntelligence';
import {
  hasQuestSignal,
  hasProgressSignal,
  hasSkillSignal,
  hasProjectSignal,
  hasInterestSignal,
  hasLifeChangeSignal,
} from './extractionSignals';
import { hasVicariousRelationshipSignals } from '../ontology/vicariousRelationshipIntelligence';
import { relationshipDriftDetector } from './relationshipDriftDetector';
import { relationshipCycleDetector } from './relationshipCycleDetector';
import { breakupDetector } from './breakupDetector';
import { extractAndLogInteraction } from './romanticInteractionExtractor';
import { characterTimelineBuilder } from './characterTimelineBuilder';
import { workoutEventDetector } from './workoutEventDetector';
import { biometricExtractor } from './biometricExtractor';
import { gymSocialDetector } from './gymSocialDetector';
import { interestDetector } from './interestDetector';
import { interestTracker } from './interestTracker';
import { queueExtractedUnitForReview } from './ingestionMemoryBridge';
import type { Message, Utterance, ExtractedUnit, NormalizationResult } from '../../types/conversationCentered';
import { questExtractor } from '../quests/questExtractor';
import { skillExtractionService } from '../skills/skillExtractionService';
import { questService } from '../quests/questService';
import { ingestConversationER } from '../unifiedErIngestion';
import { eventCandidateService } from '../eventCandidates/eventCandidateService';
import { dayOccasionService } from '../continuityRuntime/arcs/dayOccasionService';
import { narrativeContinuityService } from '../narrativeContinuityService';
import { groupCandidateService } from '../groupCandidateService';
import { shadowModeOrchestrator } from '../ingestion/shadowMode';
import { hybridExtractor } from './hybridExtractor';
import { IngestionCostMeter } from '../ingestion/ingestionCostMeter';
import { evaluateEntityCandidates } from '../ontology/entityCandidateGate';
import { StageTimer } from '../../lib/stageTimer';
import { resolveAllTemporalAnchors } from '../../utils/temporalAnchorResolver';
import {
  collectAdditionalTemporalReferences,
  mapTemporalWindowToIngestionRef,
} from '../../utils/temporalResolver';
import { scanTemporalMentions, hasHistoricalDistanceCue } from '../ontology/temporalLexicon';
import { temporalAnchorProfileService } from '../temporal/temporalAnchorProfileService';
import { episodeSegmentationTrigger } from './episodeSegmentationTrigger';

/**
 * Main ingestion pipeline for conversation messages
 */
export class ConversationIngestionPipeline {
  /**
   * Ingest a message from chat_messages table (fire-and-forget compatible)
   * This is the primary entry point for chat integration
   */
  async ingestFromChatMessage(
    userId: string,
    chatMessageId: string,
    sessionId: string,
    conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>,
    force?: boolean
  ): Promise<void> {
    const pipelineStart = Date.now();
    try {
      // Get the chat message
      const { data: chatMessage, error: msgError } = await supabaseAdmin
        .from('chat_messages')
        .select('*')
        .eq('id', chatMessageId)
        .eq('user_id', userId)
        .single();

      if (msgError || !chatMessage) {
        logger.warn({ error: msgError, chatMessageId, userId }, 'Chat message not found for ingestion');
        return;
      }

      // Nothing to extract from an empty/whitespace message — skip before doing
      // any session mapping or downstream scheduling.
      if (typeof chatMessage.content !== 'string' || chatMessage.content.trim().length === 0) {
        logger.debug({ chatMessageId, userId }, 'Chat message has no content; skipping ingestion');
        return;
      }

      // Check if already ingested (avoid duplicate processing). Skipped on a
      // forced re-ingest (a correction) — the caller has already tombstoned the
      // stale derivations and wants fresh ones from the corrected text.
      if (!force) {
        const { data: existing } = await supabaseAdmin
          .from('conversation_messages')
          .select('id')
          .eq('metadata->>chat_message_id', chatMessageId)
          .single();

        if (existing) {
          logger.debug({ chatMessageId, conversationMessageId: existing.id }, 'Message already ingested');
          return;
        }
      }

      // Map chat session to conversation session
      const conversationSessionId = await this.ensureConversationSession(userId, sessionId);

      // Map sender
      const sender: 'USER' | 'AI' = chatMessage.role === 'user' ? 'USER' : 'AI';

      // Ingest the message (with chat_message_id in metadata for linking)
      const result = await this.ingestMessage(
        userId,
        conversationSessionId,
        sender,
        chatMessage.content,
        conversationHistory
      );

      // Link conversation message back to chat message via metadata
      await supabaseAdmin
        .from('conversation_messages')
        .update({
          metadata: {
            chat_message_id: chatMessageId,
            chat_session_id: sessionId,
          },
        })
        .eq('id', result.messageId);

      // Carry resolved entity/location ids + lexical signals onto chat_messages.
      const existingMeta = (chatMessage.metadata as Record<string, unknown> | null) ?? {};
      const lexicalSignals = buildMessageLexicalSignals(chatMessage.content);
      const shouldUpdateMeta =
        result.resolvedEntityIds.length > 0 ||
        result.resolvedLocationIds.length > 0 ||
        lexicalSignals != null;

      if (shouldUpdateMeta) {
        await supabaseAdmin
          .from('chat_messages')
          .update({
            metadata: {
              ...existingMeta,
              ...(result.resolvedEntityIds.length > 0 ? { entity_ids: result.resolvedEntityIds } : {}),
              ...(result.resolvedLocationIds.length > 0 ? { location_ids: result.resolvedLocationIds } : {}),
              ...(lexicalSignals ? { lexical_signals: lexicalSignals } : {}),
            },
          })
          .eq('id', chatMessageId)
          .eq('user_id', userId);
      }

      // Publish feedback so the polling endpoint can surface it to the UI
      setImmediate(() => {
        this.buildAndPublishFeedback(
          userId,
          chatMessageId,
          result.utteranceIds,
          pipelineStart
        ).catch(err => {
          logger.warn({ err, chatMessageId }, 'Failed to build memory feedback (non-critical)');
        });
      });

      // Debounced lore inference (graph, places, orgs, public figures, standing).
      const { inferenceOrchestrator } = await import('../inference/inferenceOrchestrator');
      inferenceOrchestrator.schedule(userId, 'chat_message');
      episodeSegmentationTrigger.schedule(userId, conversationSessionId);
    } catch (error) {
      // Log but don't throw - ingestion failures should not block chat
      logger.error(
        { error, chatMessageId, userId, sessionId },
        'Failed to ingest chat message (non-blocking)'
      );
    }
  }

  /**
   * Query what the pipeline just extracted and publish it to the MemoryFeedbackBus
   * so the client-side cognition panel can display it.
   * All DB errors are swallowed — this is observability, not load-bearing.
   */
  private async buildAndPublishFeedback(
    userId: string,
    chatMessageId: string,
    utteranceIds: string[],
    startedAt: number
  ): Promise<void> {
    if (utteranceIds.length === 0) return;

    // Query knowledge units created for this message (linked via utterance_id)
    const { data: kuRows } = await supabaseAdmin
      .from('knowledge_units')
      .select('knowledge_type, content, confidence, emotions, entities, certainty_source, temporal_scope')
      .in('utterance_id', utteranceIds)
      .limit(20) as { data: any[] | null };

    // Query utterances for emotional metadata
    const { data: uttRows } = await supabaseAdmin
      .from('utterances')
      .select('metadata')
      .in('id', utteranceIds) as { data: any[] | null };

    // Check for very-recent contradictions surfaced by the pipeline
    const { data: corrections } = await supabaseAdmin
      .from('correction_records')
      .select('correction_text')
      .eq('user_id', userId)
      .gte('created_at', new Date(startedAt - 5000).toISOString()) // within pipeline run
      .order('created_at', { ascending: false })
      .limit(3) as { data: any[] | null };

    // — Emotional signals ——————————————————————————————————
    const emotions: string[] = [];
    let intensity: 'LOW' | 'MEDIUM' | 'HIGH' = 'LOW';
    let isVenting = false;

    for (const u of uttRows ?? []) {
      const meta = u?.metadata ?? {};
      if (Array.isArray(meta.emotions)) emotions.push(...meta.emotions);
      if (meta.intensity === 'HIGH') intensity = 'HIGH';
      else if (meta.intensity === 'MEDIUM' && intensity === 'LOW') intensity = 'MEDIUM';
      if (meta.is_venting) isVenting = true;
    }

    // — Knowledge units ———————————————————————————————————
    const knowledgeUnits = (kuRows ?? []).map((ku: any) => ({
      type: ku.knowledge_type as MemoryFeedbackEvent['knowledgeUnits'][0]['type'],
      content: String(ku.content ?? '').slice(0, 120),
      confidence: Number(ku.confidence ?? 0.5),
      certaintySource: String(ku.certainty_source ?? 'UNKNOWN'),
      temporalScope: (ku.temporal_scope ?? 'UNKNOWN') as MemoryFeedbackEvent['knowledgeUnits'][0]['temporalScope'],
    }));

    // — Entities ——————————————————————————————————————————
    const seenIds = new Set<string>();
    const entitiesDetected: MemoryFeedbackEvent['entitiesDetected'] = [];
    for (const ku of kuRows ?? []) {
      for (const e of (ku.entities ?? []) as any[]) {
        if (e?.id && !seenIds.has(e.id)) {
          seenIds.add(e.id);
          entitiesDetected.push({ name: String(e.name ?? ''), type: String(e.type ?? 'UNKNOWN') });
        }
      }
    }

    // — Temporal anchor ———————————————————————————————————
    const hasTemporalScope = (kuRows ?? []).some(
      (ku: any) => ku.temporal_scope && ku.temporal_scope !== 'UNKNOWN'
    );

    const feedback: MemoryFeedbackEvent = {
      chatMessageId,
      userId,
      timestamp: new Date().toISOString(),
      processingTimeMs: Date.now() - startedAt,
      pipelineComplete: true,
      knowledgeUnits,
      emotionalSignals: {
        emotions: [...new Set(emotions)].slice(0, 6),
        intensity: emotions.length > 0 ? intensity : null,
        isVenting,
      },
      entitiesDetected: entitiesDetected.slice(0, 8),
      temporalAnchor: { detected: hasTemporalScope },
      contradictionsDetected: (corrections ?? []).map((c: any) => ({
        description: String(c.correction_text ?? 'Potential contradiction detected'),
      })),
    };

    memoryFeedbackBus.publish(chatMessageId, feedback);
    logger.debug({ chatMessageId, knowledgeUnitCount: knowledgeUnits.length }, 'Memory feedback published');
  }

  /** Post-detection hooks shared by lexical + LLM romantic paths. */
  private runRomanticRelationshipFollowUps(
    userId: string,
    rawText: string,
    messageId: string,
    rel: {
      relationshipId: string;
      personId: string;
      personType: 'character' | 'omega_entity';
    },
    options?: { logInteraction?: boolean }
  ): void {
    const { relationshipId, personId } = rel;

    const dateEventPromise = romanticRelationshipDetector
      .detectDateEvent(userId, rawText, relationshipId, personId, messageId);
    void dateEventPromise.catch(err => {
      logger.warn({ err }, 'Date event detection failed');
    });

    const breakupPromise = breakupDetector
      .detectBreakup(userId, rawText, relationshipId, personId, messageId);
    void breakupPromise.then(breakup => {
      if (breakup) {
        logger.debug({ userId, relationshipId }, 'Detected breakup');
      }
    }).catch(err => {
      logger.warn({ err }, 'Breakup detection failed');
    });

    const loveDeclarationPromise = breakupDetector
      .detectLoveDeclaration(userId, rawText, relationshipId, personId, messageId);
    void loveDeclarationPromise.catch(err => {
      logger.warn({ err }, 'Love declaration detection failed');
    });

    if (Math.random() < 0.1) {
      const driftPromise = relationshipDriftDetector
        .detectDrift(userId, relationshipId, personId, rel.personType);
      void driftPromise.then(drift => {
        if (drift) {
          logger.debug(
            { userId, relationshipId, driftType: drift.driftType },
            'Detected relationship drift'
          );
        }
      }).catch(err => {
        logger.warn({ err }, 'Drift detection failed');
      });
    }

    if (Math.random() < 0.05) {
      const cyclesPromise = relationshipCycleDetector
        .detectCycles(userId, relationshipId, personId, rel.personType);
      void cyclesPromise.then(cycles => {
        if (cycles.length > 0) {
          logger.debug(
            { userId, relationshipId, cyclesFound: cycles.length },
            'Detected relationship cycles'
          );
        }
      }).catch(err => {
        logger.warn({ err }, 'Cycle detection failed');
      });
    }

    if (options?.logInteraction !== false) {
      void extractAndLogInteraction(userId, relationshipId, rawText, messageId).catch(err => {
        logger.warn({ err }, 'Interaction extraction failed (non-blocking)');
      });
    }
  }

  /** Detect romantic relationships asynchronously (non-blocking). */
  private async detectRomanticRelationshipsAsync(
    userId: string,
    rawText: string,
    unitIds: string[],
    messageId: string
  ): Promise<void> {
    try {
      const resolved = unitIds.length > 0
        ? await entityRegistry.resolveManyById(unitIds, userId)
        : [];
      const validEntities = resolved
        .map(e => ({
          id: e.id,
          name: e.name,
          type: (e.source === 'character' ? 'character' : 'omega_entity') as 'character' | 'omega_entity',
        }))
        .filter(e => isIndividualPersonName(e.name));

      const scoreRelationships = () => {
        void import('./romanticRelationshipScoring')
          .then(({ romanticRelationshipScoring }) => romanticRelationshipScoring.scoreAllForUser(userId))
          .catch(err => logger.debug({ err, userId }, 'Relationship scoring failed'));
      };

      // Phase 1: lexical fast path — glossary + ontology, no LLM.
      const lexicalResult = await ingestRomanticLexicalFromMessage(
        userId,
        rawText,
        messageId,
        validEntities
      );

      if (lexicalResult.saved > 0) {
        logger.debug(
          { userId, relationshipsFound: lexicalResult.saved },
          'Lexical romantic relationships ingested from live chat'
        );
        scoreRelationships();
        for (const rel of lexicalResult.relationships) {
          this.runRomanticRelationshipFollowUps(
            userId,
            rawText,
            messageId,
            {
              relationshipId: rel.relationshipId,
              personId: rel.personId,
              personType: rel.personType,
            },
            { logInteraction: false }
          );
        }
      }

      // Phase 2: LLM refinement when people are mentioned in knowledge units.
      if (validEntities.length > 0) {
        const relationships = await romanticRelationshipDetector.detectRelationships(
          userId,
          rawText,
          validEntities,
          messageId
        );

        if (relationships.length > 0) {
          logger.debug(
            { userId, relationshipsFound: relationships.length },
            'Detected romantic relationships (LLM)'
          );

          scoreRelationships();

          for (const rel of relationships) {
            const relationshipResult = await supabaseAdmin
              .from('romantic_relationships')
              .select('id')
              .eq('user_id', userId)
              .eq('person_id', rel.personId)
              .eq('person_type', rel.personType)
              .eq('relationship_type', rel.relationshipType)
              .eq('status', rel.status)
              .single();

            const relationship = relationshipResult.data;

            if (relationship) {
              this.runRomanticRelationshipFollowUps(userId, rawText, messageId, {
                relationshipId: relationship.id,
                personId: rel.personId,
                personType: rel.personType,
              });
            }
          }
        }
      }

      // Phase 3: vicarious romantic periphery — other partners of relationship subjects.
      const anchorNames = [
        ...lexicalResult.relationships.map((r) => r.partnerName),
        ...validEntities.map((e) => e.name),
      ];
      await ingestRelationshipPeripheralsFromMessage(userId, rawText, messageId, anchorNames, validEntities);
    } catch (err) {
      logger.warn({ err }, 'Romantic relationship detection failed (non-blocking)');
    }
  }

  /**
   * Ingest a message through the full pipeline
   * @param eventContext - Optional event ID if this message is scoped to a specific event
   * @param entityContext - Optional entity context (character_id, location_id, perception_id, memory_id, etc.)
   */
  async ingestMessage(
    userId: string,
    threadId: string,
    sender: 'USER' | 'AI',
    rawText: string,
    conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>,
    eventContext?: string,
    entityContext?: {
      type: 'CHARACTER' | 'LOCATION' | 'PERCEPTION' | 'MEMORY' | 'ENTITY' | 'GOSSIP';
      id: string;
    }
  ): Promise<{
    messageId: string;
    utteranceIds: string[];
    unitIds: string[];
    resolvedEntityIds: string[];
    resolvedLocationIds: string[];
  }> {
    // Defensive validation — these are required, non-optional inputs. A missing
    // userId/threadId is a programming error upstream, not user content, so fail
    // loudly rather than silently writing orphaned rows.
    if (!userId || typeof userId !== 'string') {
      throw new TypeError('ingestMessage: userId is required');
    }
    if (!threadId || typeof threadId !== 'string') {
      throw new TypeError('ingestMessage: threadId is required');
    }
    if (sender !== 'USER' && sender !== 'AI') {
      throw new TypeError(`ingestMessage: sender must be 'USER' or 'AI', got ${String(sender)}`);
    }

    // Empty / whitespace-only messages carry no extractable content. Skip them
    // cleanly instead of creating empty utterances and firing the whole cluster.
    if (typeof rawText !== 'string' || rawText.trim().length === 0) {
      logger.debug({ userId, threadId }, 'ingestMessage: skipping empty message');
      return {
        messageId: '',
        utteranceIds: [],
        unitIds: [],
        resolvedEntityIds: [],
        resolvedLocationIds: [],
      };
    }

    try {
      return await this.ingestMessageCore(userId, threadId, sender, rawText, conversationHistory, eventContext, entityContext);
    } catch (err) {
      logger.error({ error: err, userId, threadId, rawText }, 'Failed to ingest message');
      throw err;
    }
  }

  /**
   * Extract temporal references from text using TimeEngine
   */
  private async extractTemporalReferences(
    userId: string,
    normalizedText: string,
    originalText: string
  ): Promise<Array<{
    timestamp: Date;
    endTimestamp?: Date;
    precision: import('../timeEngine').TimePrecision;
    confidence: number;
    originalText?: string;
    label?: string;
  }>> {
    const { resolveUserTimezone, clampOccurrenceDate } = await import('../../utils/temporalOccurrence');
    await resolveUserTimezone(userId);
    const now = new Date();
    // Per-user birth-year anchor (cached) so "when I was 19" / "in high school"
    // resolve to absolute years instead of defaulting to ingest-time.
    const anchorProfile = await temporalAnchorProfileService.getProfile(userId);
    const text = originalText || normalizedText;
    const references: Array<{
      timestamp: Date;
      endTimestamp?: Date;
      precision: import('../timeEngine').TimePrecision;
      confidence: number;
      originalText?: string;
      label?: string;
    }> = [];

    const seenLabels = new Set<string>();

    for (const mention of scanTemporalMentions(text, now, anchorProfile)) {
      if (!mention.window) continue;
      const label = mention.window.label;
      if (seenLabels.has(label)) continue;
      seenLabels.add(label);

      const mapped = mapTemporalWindowToIngestionRef(mention.window, mention.phrase);
      references.push({
        timestamp: clampOccurrenceDate(mapped.timestamp, now) ?? now,
        endTimestamp: mapped.endTimestamp
          ? clampOccurrenceDate(mapped.endTimestamp, now) ?? undefined
          : undefined,
        precision: mapped.precision,
        confidence: mapped.confidence,
        originalText: mapped.originalText,
        label: mapped.label,
      });
    }

    for (const mapped of collectAdditionalTemporalReferences(text, now, seenLabels)) {
      references.push({
        timestamp: clampOccurrenceDate(mapped.timestamp, now) ?? now,
        endTimestamp: mapped.endTimestamp
          ? clampOccurrenceDate(mapped.endTimestamp, now) ?? undefined
          : undefined,
        precision: mapped.precision,
        confidence: mapped.confidence,
        originalText: mapped.originalText,
        label: mapped.label,
      });
    }

    if (references.length === 0) {
      const anchor = resolveAllTemporalAnchors(text, now);
      if (anchor) {
        const mapped = mapTemporalWindowToIngestionRef(anchor);
        references.push({
          timestamp: clampOccurrenceDate(mapped.timestamp, now) ?? now,
          endTimestamp: mapped.endTimestamp
            ? clampOccurrenceDate(mapped.endTimestamp, now) ?? undefined
            : undefined,
          precision: mapped.precision,
          confidence: mapped.confidence,
          originalText: mapped.originalText,
          label: mapped.label,
        });
      }
    }

    if (references.length === 0) {
      const presentTenseIndicators = /\b(just|recently|now|currently|happening|happened|occurred)\b/gi;
      if (presentTenseIndicators.test(normalizedText)) {
        references.push({
          timestamp: new Date(),
          precision: 'minute',
          confidence: 0.7,
          originalText: 'current time',
        });
      }
    }

    return references.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Build temporal_context when no concrete date resolved (extractTemporalReferences
   * returned empty). Honest-occurrence policy:
   *  - Historical-but-undated ("used to", "back then") → DO NOT stamp ingest-time as
   *    the occurrence. Leave start_time absent (consumers like eventAssemblyService
   *    already fall back to created_at = recorded date) and flag occurrence_unknown.
   *  - Otherwise (recent/real-time chat) → ingest-time is a fair occurrence estimate.
   * This kills the created_at-as-occurrence conflation for life-story narration while
   * preserving the sensible default for "had coffee with Maria"-style recent entries.
   */
  private buildUnresolvedTemporalContext(
    text: string,
    base: Record<string, any>
  ): Record<string, any> {
    if (hasHistoricalDistanceCue(text)) {
      return {
        ...base,
        precision: 'unknown',
        confidence: 0.1,
        occurrence_unknown: true,
        source: 'unresolved_past',
      };
    }
    return {
      ...base,
      start_time: new Date().toISOString(),
      precision: 'minute',
      confidence: 0.7,
      inferred: true,
      source: 'current_time',
    };
  }

  /**
   * Ensure conversation session exists (map from chat_session if needed)
   */
  private async ensureConversationSession(
    userId: string,
    chatSessionId: string
  ): Promise<string> {
    // If the id is already a conversation_sessions row (a UI thread), use it
    // directly — this keeps ingested memories attached to the thread the user
    // is actually chatting in instead of a parallel shadow session.
    const { data: directRows } = await supabaseAdmin
      .from('conversation_sessions')
      .select('id')
      .eq('user_id', userId)
      .eq('id', chatSessionId)
      .limit(1);
    if (directRows?.[0]?.id) {
      return directRows[0].id;
    }

    // Check if conversation session already exists for this chat session.
    // Use limit(1) instead of .single() — multiple duplicate sessions can exist
    // due to prior race conditions, and .single() throws on >1 rows which
    // causes existing to be null and creates yet another duplicate.
    const { data: existingRows } = await supabaseAdmin
      .from('conversation_sessions')
      .select('id')
      .eq('user_id', userId)
      .eq('metadata->>chat_session_id', chatSessionId)
      .order('created_at', { ascending: true })
      .limit(1);

    const existing = existingRows?.[0] ?? null;
    if (existing && existing.id) {
      return existing.id;
    }

    // Get chat session details
    const { data: chatSession } = await supabaseAdmin
      .from('chat_sessions')
      .select('*')
      .eq('session_id', chatSessionId)
      .eq('user_id', userId)
      .single();

    // Create conversation session
    const { data: conversationSession, error } = await supabaseAdmin
      .from('conversation_sessions')
      .insert({
        user_id: userId,
        title: chatSession?.metadata?.title || null,
        metadata: {
          chat_session_id: chatSessionId,
          ...(chatSession?.metadata || {}),
        },
      })
      .select('id')
      .single();

    if (error) {
      throw error;
    }

    if (!conversationSession || !conversationSession.id) {
      throw new Error('Failed to create conversation session: no ID returned');
    }

    return conversationSession.id;
  }

  /**
   * Ensure message is saved (or get existing ID)
   */
  private async ensureMessageSaved(
    userId: string,
    threadId: string,
    sender: 'USER' | 'AI',
    rawText: string
  ): Promise<string> {
    // Check if message already exists (by content and thread)
    const { data: existing } = await supabaseAdmin
      .from('conversation_messages')
      .select('id')
      .eq('session_id', threadId)
      .eq('user_id', userId)
      .eq('content', rawText)
      .eq('role', sender.toLowerCase())
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (existing && existing.id) {
      return existing.id;
    }

    // Create new message
    const { data: message, error } = await supabaseAdmin
      .from('conversation_messages')
      .insert({
        session_id: threadId,
        user_id: userId,
        role: sender.toLowerCase(),
        content: rawText,
      })
      .select('id')
      .single();

    if (error) {
      throw error;
    }

    if (!message || !message.id) {
      throw new Error('Failed to create conversation message: no ID returned');
    }

    return message.id;
  }

  /**
   * Save normalized utterance with enrichment metadata
   */
  private async saveUtterance(
    userId: string,
    messageId: string,
    originalText: string,
    normalized: NormalizationResult,
    enrichment?: import('../entryEnrichmentService').EnrichedEntryMetadata
  ): Promise<Utterance> {
    const { data: utterance, error } = await supabaseAdmin
      .from('utterances')
      .insert({
        message_id: messageId,
        user_id: userId,
        normalized_text: normalized.normalized_text,
        original_text: originalText, // Always preserve original
        language: normalized.language,
        metadata: {
          ...(enrichment ? {
            emotions: enrichment.emotions,
            themes: enrichment.themes,
            people: enrichment.people,
            intensity: enrichment.intensity,
            is_venting: enrichment.is_venting,
          } : {}),
          refinement_level: normalized.refinement_level || 'light',
          original_preserved: normalized.original_preserved !== false,
          corrections: normalized.corrections,
          spanish_terms: normalized.spanish_terms,
        },
      })
      .select('*')
      .single();

    if (error) {
      throw error;
    }

    return utterance;
  }

  /**
   * Detect AI uncertainty markers in text.
   * Delegates to the pure {@link detectAIUncertainty} util (unit-tested).
   */
  private detectAIUncertainty(text: string): {
    uncertainty_markers: string[];
    context_quality: 'high' | 'medium' | 'low';
  } {
    return detectAIUncertainty(text);
  }

  /**
   * Save extracted unit
   */
  private async saveExtractedUnit(
    userId: string,
    utteranceId: string,
    unit: {
      type: string;
      content: string;
      confidence: number;
      temporal_context?: Record<string, any>;
      entity_ids?: string[];
    },
    normalized: NormalizationResult,
    additionalMetadata?: Record<string, any>
  ): Promise<ExtractedUnit> {
    const { data: extractedUnit, error } = await supabaseAdmin
      .from('extracted_units')
      .insert({
        utterance_id: utteranceId,
        user_id: userId,
        type: unit.type,
        content: unit.content,
        confidence: unit.confidence,
        temporal_context: unit.temporal_context || {},
        entity_ids: unit.entity_ids || [],
        metadata: {
          ...additionalMetadata,
          refinement_level: normalized.refinement_level,
          original_preserved: normalized.original_preserved,
          language: normalized.language,
          spanish_terms: normalized.spanish_terms,
        },
      })
      .select('*')
      .single();

    if (error) {
      throw error;
    }

    return extractedUnit;
  }


  /**
   * Enqueue for memory review if needed
   */
  private async enqueueMemoryReviewIfNeeded(
    userId: string,
    unit: ExtractedUnit,
    sourceText?: string
  ): Promise<void> {
    try {
      await queueExtractedUnitForReview(userId, unit, sourceText);
    } catch (error) {
      logger.warn({ error, unitId: unit.id }, 'Failed to queue unit for review');
    }
  }

  /**
   * Link extracted unit to an event
   */
  private async linkUnitToEvent(unitId: string, eventId: string): Promise<void> {
    try {
      await supabaseAdmin
        .from('event_unit_links')
        .upsert(
          { event_id: eventId, unit_id: unitId },
          { onConflict: 'event_id,unit_id', ignoreDuplicates: true }
        );
    } catch (error) {
      logger.warn({ error, unitId, eventId }, 'Failed to link unit to event');
    }
  }

  /**
   * Link extracted unit to an entity (character, location, perception, memory, etc.)
   * Stores in metadata for now, can be migrated to a proper table later
   */
  private async linkUnitToEntity(
    unitId: string,
    entityContext: { type: string; id: string }
  ): Promise<void> {
    try {
      // Update unit metadata to include entity context
      const { data: unit } = await supabaseAdmin
        .from('extracted_units')
        .select('metadata')
        .eq('id', unitId)
        .single();

      const updatedMetadata = {
        ...(unit?.metadata || {}),
        entity_context: {
          type: entityContext.type,
          id: entityContext.id,
          linked_at: new Date().toISOString(),
        },
      };

      await supabaseAdmin
        .from('extracted_units')
        .update({ metadata: updatedMetadata })
        .eq('id', unitId);
    } catch (error) {
      logger.warn({ error, unitId, entityContext }, 'Failed to link unit to entity');
    }
  }

  /**
   * Update thread timestamp
   */
  private async updateThreadTimestamp(threadId: string): Promise<void> {
    await supabaseAdmin
      .from('conversation_sessions')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', threadId)
      .then(({ error }) => {
        if (error) {
          logger.warn({ error, threadId }, 'Failed to update thread timestamp');
        }
      });
  }

  /** Core ingestion logic. Extracted to avoid esbuild parse errors on large try block. */
  private async ingestMessageCore(
    userId: string,
    threadId: string,
    sender: 'USER' | 'AI',
    rawText: string,
    conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>,
    eventContext?: string,
    entityContext?: { type: 'CHARACTER' | 'LOCATION' | 'PERCEPTION' | 'MEMORY' | 'ENTITY' | 'GOSSIP'; id: string }
  ): Promise<{
    messageId: string;
    utteranceIds: string[];
    unitIds: string[];
    resolvedEntityIds: string[];
    resolvedLocationIds: string[];
  }> {
      // Collector for shadow mode baseline — populated by synchronous pipeline steps below
      const _shadowBaseline = {
        entities:        [] as Array<{ name: string; type: string }>,
        relationships:   [] as Array<{ from: string; to: string; type: string }>,
        interests:       [] as Array<{ name: string; category?: string }>,
        romanticSignals: [] as Array<{ person_name: string; signal_type: string }>,
        experiences:     [] as Array<{ content: string; type: string }>,
      };

      // Thread-intelligence collector (Phase 2): resolved entity names this turn,
      // folded into conversation_sessions.metadata.threadMeta after Step 12.
      const _threadMetaTurn = { people: [] as string[], places: [] as string[] };
      const _resolvedEntityIds: string[] = [];
      const _resolvedLocationIds: string[] = [];

      // Step 1: Save message (if not already saved)
      // Note: In practice, message might already be saved by chat service
      // This is a placeholder - adjust based on your chat service implementation
      const messageId = await this.ensureMessageSaved(userId, threadId, sender, rawText);

      // Cost meter: records which per-message LLM steps were eligible / invoked /
      // productive. Flushed once at the end as `ingestion.cost`. See plan: measure
      // skip-rate and waste-rate before further detector consolidation.
      const costMeter = new IngestionCostMeter(userId, messageId);
      // Latency-by-stage for the heavy background path (companion to costMeter).
      const stageTimer = new StageTimer('ingestion.message', { userId, messageId });

      // Capture a stated birth year ("born in 1995", "I'm 28") to the self
      // character so later life-stage/age phrases resolve to absolute years.
      // Cheap when absent (regex only); fire-and-forget so it never blocks ingest.
      if (sender === 'USER') {
        void temporalAnchorProfileService.captureFromText(userId, rawText).catch(() => {});
      }

      // Step 2: Split into utterances
      const utteranceTexts = normalizationService.splitIntoUtterances(rawText);

      // Step 3: Normalize each utterance
      // Use 'light' refinement for user messages (preserves original language, fixes critical issues)
      // Use 'standard' for AI messages (they're already well-formed)
      const refinementLevel = sender === 'USER' ? 'light' : 'standard';
      const normalizedUtterances = await Promise.all(
        utteranceTexts.map(text => normalizationService.normalizeText(text, refinementLevel))
      );

      // Step 3.5: Check for multi-event entries and split if needed
      // Process each normalized utterance for multi-event splitting
      const processedUtterances: Array<{
        original: string;
        normalized: NormalizationResult;
        splitEvents?: any[];
      }> = [];

      for (let i = 0; i < normalizedUtterances.length; i++) {
        const normalized = normalizedUtterances[i];
        const original = utteranceTexts[i];

        // Check if this utterance contains multiple events
        const splitResult = await multiEventSplittingService.splitEntryIntoEvents(
          normalized.normalized_text,
          normalized.language
        );

        if (splitResult.events.length > 1) {
          // Multiple events detected - process each separately
          logger.debug(
            { userId, messageId, eventCount: splitResult.events.length },
            'Detected multi-event entry, splitting into separate events'
          );

          // Convert split events to extracted units format
          const splitUnits = multiEventSplittingService.convertToExtractedUnits(
            splitResult,
            {
              original_utterance: original,
              language: normalized.language,
              spanish_terms: normalized.spanish_terms || splitResult.spanish_terms,
            }
          );

          processedUtterances.push({
            original,
            normalized,
            splitEvents: splitUnits,
          });
        } else {
          // Single event - process normally
          processedUtterances.push({
            original,
            normalized,
          });
        }
      }

      // Step 4: Extract entities for enrichment (needed before saving utterances)
      const resolvedEntities: Array<{ id: string; type: string }> = [];
      try {
        // Get entities from semantic extraction or entity resolution.
        // Use the full message (all utterances joined) — a message like
        // "Had coffee with X. She's my old roommate." splits into two
        // utterances, and the relationship context lives in the second one.
        if (normalizedUtterances.length > 0) {
          const fullNormalizedText = normalizedUtterances.map(u => u.normalized_text).join(' ');
          const { omegaMemoryService } = await import('../omegaMemoryService');
          // Mirror the gate inside extractEntities so the meter can attribute the
          // skip to this message (same deterministic function — no divergence).
          const entityGateOpen = evaluateEntityCandidates(fullNormalizedText).hasCandidates;
          const candidateEntities = await omegaMemoryService.extractEntities(fullNormalizedText);
          const resolved = await omegaMemoryService.resolveEntities(userId, candidateEntities);
          costMeter.record('entity_extraction', {
            eligible: entityGateOpen,
            invoked: entityGateOpen,
            productive: resolved.length > 0,
          });
          resolvedEntities.push(...resolved.map(e => ({ id: e.id, type: e.type })));

          for (const e of resolved) {
            if (e.type === 'LOCATION') {
              if (!_resolvedLocationIds.includes(e.id)) _resolvedLocationIds.push(e.id);
            } else {
              if (!_resolvedEntityIds.includes(e.id)) _resolvedEntityIds.push(e.id);
            }
          }

          // Collect resolved names for thread metadata (people vs places).
          for (const e of resolved) {
            const name = (e as any).primary_name as string | undefined;
            if (!name?.trim()) continue;
            if (e.type === 'PERSON' || e.type === 'CHARACTER') _threadMetaTurn.people.push(name.trim());
            else if (e.type === 'LOCATION') _threadMetaTurn.places.push(name.trim());
          }

          // Promote PERSON/CHARACTER entities to characters table so they appear
          // in the Characters Book. USER messages only — assistant/RAG text must
          // not queue entity questions the user never typed (e.g. Hell Fairy leaking
          // into an unrelated LoreBook thread).
          const personEntities = resolved.filter(
            e => e.type === 'PERSON' || e.type === 'CHARACTER'
          );
          if (sender === 'USER' && personEntities.length > 0) {
            const { characterFoundationService } = await import('../characterFoundationService');
            const promotedCharacterIds: string[] = [];
            for (const entity of personEntities) {
              try {
                const characterId = await characterFoundationService.promoteOmegaEntityToCharacter(
                  userId,
                  entity as any,
                  threadId
                );
                if (!characterId) continue;
                promotedCharacterIds.push(characterId);
                if (threadId) {
                  const { entityConversationLinkService } = await import('./entityConversationLinkService');
                  await entityConversationLinkService
                    .linkEntity(userId, 'character', characterId, threadId, {
                      linkKind: 'mention',
                      entityName: (entity as any).primary_name,
                    })
                    .catch(() => {});
                }
                const { entityFactsService } = await import('../entityFactsService');
                entityFactsService
                  .extractAndPersistFacts(
                    userId,
                    characterId,
                    'character',
                    (entity as any).primary_name,
                    fullNormalizedText
                  )
                  .catch((err) => logger.warn({ err }, 'Character facts extraction failed (non-blocking)'));
              } catch (err) {
                logger.warn({ err, name: (entity as any).primary_name }, 'Character promotion failed (non-blocking)');
              }
            }

            if (promotedCharacterIds.length > 0 || personEntities.length >= 2) {
              try {
                const { familyGraphInferenceService } = await import('../kinship/familyGraphInferenceService');
                const { householdInferenceService } = await import('../kinship/householdInferenceService');
                await familyGraphInferenceService.processMessage(
                  userId,
                  fullNormalizedText,
                  messageId,
                  promotedCharacterIds
                );
                await householdInferenceService.processMessage(
                  userId,
                  fullNormalizedText,
                  messageId,
                  promotedCharacterIds
                );
              } catch (err) {
                logger.warn({ err, messageId }, 'Kinship/household inference failed (non-blocking)');
              }
            }
          }

          if (threadId && resolved.length > 0) {
            import('./entityConversationLinkService').then(({ entityConversationLinkService }) => {
              entityConversationLinkService
                .linkResolvedEntities(userId, threadId, resolved as any[], { markOrigin: sender === 'USER' })
                .catch((err) => logger.warn({ err, threadId }, 'Entity-thread link failed (non-blocking)'));
            }).catch(() => {});
          }

          // Extract facts for ORG and LOCATION entities — fire-and-forget
          const utteranceText = fullNormalizedText;
          const orgEntities = resolved.filter(e => e.type === 'ORG');
          const locationEntities = resolved.filter(e => e.type === 'LOCATION');

          if (orgEntities.length > 0 || locationEntities.length > 0) {
            import('../entityFactsService').then(({ entityFactsService }) => {
              orgEntities.forEach(async (entity) => {
                try {
                  const name = (entity as any).primary_name as string;
                  if (!name) return;
                  const id = await entityFactsService.resolveOrgIdByName(userId, name);
                  if (!id) return;
                  entityFactsService.extractAndPersistFacts(userId, id, 'organization', name, utteranceText)
                    .catch(err => logger.warn({ err }, 'Org facts extraction failed (non-blocking)'));
                } catch { /* non-blocking */ }
              });

              locationEntities.forEach(async (entity) => {
                try {
                  const name = (entity as any).primary_name as string;
                  if (!name) return;
                  const id = await entityFactsService.resolveLocationIdByName(userId, name);
                  if (!id) return;
                  entityFactsService.extractAndPersistFacts(userId, id, 'location', name, utteranceText)
                    .catch(err => logger.warn({ err }, 'Location facts extraction failed (non-blocking)'));
                } catch { /* non-blocking */ }
              });
            }).catch(() => {});
          }
        }
      } catch (error) {
        logger.warn({ error }, 'Failed to resolve entities for enrichment, continuing without');
      }
      stageTimer.mark('entity_resolution');

      // Step 4.2: Resolve entity names (shadow baseline) + detect relationships/scopes
      // Sprint P (shadow-mode integrity): name resolution must run for ANY
      // resolved-entity count so `_shadowBaseline.entities` reflects what the
      // legacy pipeline actually found — including the 1-entity case, which
      // this gate used to skip entirely (silently logging an empty baseline
      // and producing trivially-perfect precision/recall/F1 downstream).
      // Relationship detection genuinely requires >= 2 named entities — that
      // gate is preserved below, unchanged, because a relationship needs two
      // parties; it is a real domain constraint, not a measurement shortcut.
      if (resolvedEntities.length >= 1) {
        try {
          // Map entity types to our EntityType format
          const entitiesForDetection = resolvedEntities.map(e => ({
            id: e.id,
            name: '', // Will be fetched if needed
            type: (e.type === 'PERSON' || e.type === 'CHARACTER' ? 'character' : 'omega_entity') as 'character' | 'omega_entity',
          }));

          const registryResults = await entityRegistry.resolveManyById(
            entitiesForDetection.map(e => e.id),
            userId
          );
          const registryById = new Map(registryResults.map(r => [r.id, r]));
          const entitiesWithNames = entitiesForDetection
            .map(e => ({ ...e, name: registryById.get(e.id)?.name ?? '' }))
            .filter(e => e.name);

          // Capture for shadow baseline
          _shadowBaseline.entities = entitiesWithNames.map(e => ({ name: e.name, type: e.type }));

          const hasSelfReference =
            /\b(I|me|my|myself|I'm|I am|I've|I have|I don't|I didn't|I can't|I won't)\b/i.test(rawText);

          if (entitiesWithNames.length >= 2) {
            const detection = await entityRelationshipDetector.detectRelationshipsAndScopes(
              userId,
              rawText,
              entitiesWithNames,
              messageId,
              undefined // journal entry ID if available
            );

            costMeter.record('relationship_detection', {
              eligible: true,
              invoked: true,
              productive: detection.relationships.length > 0 || detection.scopes.length > 0,
            });

            // Capture for shadow baseline
            _shadowBaseline.relationships = detection.relationships.map(r => ({
              from: r.fromEntityId,
              to: r.toEntityId,
              type: r.relationshipType,
            }));

            // Save relationships
            for (const relationship of detection.relationships) {
              await entityRelationshipDetector.saveRelationship(userId, relationship);

              // Add entities to scope groups
              if (relationship.scope) {
                await entityScopeService.addEntityToScopeGroup(
                  userId,
                  relationship.fromEntityId,
                  relationship.fromEntityType,
                  relationship.scope
                );
                await entityScopeService.addEntityToScopeGroup(
                  userId,
                  relationship.toEntityId,
                  relationship.toEntityType,
                  relationship.scope
                );
              }
            }

            // Save scopes
            for (const scope of detection.scopes) {
              await entityRelationshipDetector.saveScope(userId, scope);

              // Add to scope group
              await entityScopeService.addEntityToScopeGroup(
                userId,
                scope.entityId,
                scope.entityType,
                scope.scope,
                scope.scopeContext
              );
            }

            if (detection.relationships.length > 0 || detection.scopes.length > 0) {
              logger.debug(
                {
                  userId,
                  messageId,
                  relationships: detection.relationships.length,
                  scopes: detection.scopes.length,
                },
                'Detected entity relationships and scopes'
              );
            }
          }

          // Detect attributes when any named entity is present OR the narrator speaks in first person
          if (entitiesWithNames.length > 0 || hasSelfReference) {
            try {
              const attributes = await entityAttributeDetector.detectAttributes(
                userId,
                rawText,
                entitiesWithNames,
                messageId,
                undefined
              );

              if (hasSelfReference) {
                const selfChar = await entityAttributeDetector.ensureUserCharacter(userId);
                if (selfChar) {
                  const { entityFactsService } = await import('../entityFactsService');
                  entityFactsService
                    .extractAndPersistSelfFacts(userId, selfChar.id, rawText)
                    .catch(err => logger.warn({ err }, 'Self facts extraction failed (non-blocking)'));
                }
              }

              costMeter.record('attribute_detection', {
                eligible: true,
                invoked: true,
                productive: attributes.length > 0,
              });

              if (attributes.length > 0) {
                logger.debug(
                  { userId, attributesFound: attributes.length },
                  'Detected entity attributes'
                );
              }
            } catch (error) {
              logger.warn({ error }, 'Attribute detection failed, continuing');
            }
          }
        } catch (error) {
          logger.warn({ error }, 'Entity relationship detection failed (non-blocking)');
        }
      }
      stageTimer.mark('relationship_attribute_detection');

      // Solo first-person messages with no resolved entities still carry self knowledge
      const soloSelfReference =
        resolvedEntities.length === 0 &&
        /\b(I|me|my|myself|I'm|I am|I've|I have|I don't|I didn't|I can't|I won't)\b/i.test(rawText);
      if (soloSelfReference) {
        try {
          await entityAttributeDetector.detectAttributes(userId, rawText, [], messageId, undefined);
          const selfChar = await entityAttributeDetector.ensureUserCharacter(userId);
          if (selfChar) {
            const { entityFactsService } = await import('../entityFactsService');
            entityFactsService
              .extractAndPersistSelfFacts(userId, selfChar.id, rawText)
              .catch(err => logger.warn({ err }, 'Self facts extraction failed (non-blocking)'));
          }
        } catch (error) {
          logger.warn({ error }, 'Solo self-reference extraction failed (non-blocking)');
        }
      }

      // Step 4.5: Save utterances with enrichment and compile to IR
      const utteranceIds: string[] = [];
      const irIds: string[] = [];
      
      for (let i = 0; i < utteranceTexts.length; i++) {
        // Enrich entry before saving
        const enrichment = await entryEnrichmentService.enrichEntry(
          utteranceTexts[i],
          resolvedEntities
        );

        const utterance = await this.saveUtterance(
          userId,
          messageId,
          utteranceTexts[i],
          normalizedUtterances[i],
          enrichment // Pass enrichment metadata
        );
        utteranceIds.push(utterance.id);

        // Step 4.6: Compile utterance to IR (LNC Phase 1)
        try {
          const ir = await irCompiler.compileUtteranceToIR(
            userId,
            utterance.id,
            utteranceTexts[i],
            threadId,
            utterance.created_at || new Date().toISOString()
          );
          irIds.push(ir.id);

          // Update dependency graph
          await dependencyGraph.updateDependencyGraph(ir);

          // Consolidate IR → journal_entry (non-blocking — never delays chat response)
          // This closes the cognition loop: every USER utterance becomes retrievable memory.
          if (sender === 'USER') {
            setImmediate(() => {
              memoryConsolidationService.consolidateEntry(userId, ir.id).catch(err => {
                logger.warn({ err, irId: ir.id, userId }, 'Memory consolidation failed; will retry via nightly sweep');
              });
            });
          }
        } catch (error) {
          logger.warn({ error, utteranceId: utterance.id }, 'Failed to compile utterance to IR, continuing');
        }
      }

      // Step 5: Extract semantic units from each utterance
      const unitIds: string[] = [];
      for (let i = 0; i < utteranceIds.length; i++) {
        const processed = processedUtterances[i];
        const normalized = processed.normalized;

        // If this utterance was split into multiple events, use those instead
        if (processed.splitEvents && processed.splitEvents.length > 0) {
          // Save split events as extracted units
          for (const splitUnit of processed.splitEvents) {
            // Extract temporal context for split events
            let temporalContext = splitUnit.temporal_context || {};
            
            if (!temporalContext.start_time && !temporalContext.end_time) {
              const temporalRefs = await this.extractTemporalReferences(
                userId,
                normalized.normalized_text,
                utteranceTexts[i]
              );
              
              if (temporalRefs.length > 0) {
                temporalContext = {
                  ...temporalContext,
                  start_time: temporalRefs[0].timestamp.toISOString(),
                  ...(temporalRefs[0].endTimestamp ? { end_time: temporalRefs[0].endTimestamp.toISOString() } : {}),
                  precision: temporalRefs[0].precision,
                  confidence: temporalRefs[0].confidence,
                  original_text: temporalRefs[0].originalText,
                  label: temporalRefs[0].label,
                };
              } else {
                temporalContext = this.buildUnresolvedTemporalContext(
                  utteranceTexts[i] || normalized.normalized_text,
                  temporalContext
                );
              }
            }

            const savedUnit = await this.saveExtractedUnit(
              userId,
              utteranceIds[i],
              {
                type: splitUnit.type,
                content: splitUnit.content,
                confidence: splitUnit.confidence,
                temporal_context: temporalContext,
                entity_ids: splitUnit.entity_ids || [],
              },
              normalized,
              splitUnit.metadata
            );
            unitIds.push(savedUnit.id);

            const splitUnitForReview: ExtractedUnit = {
              ...savedUnit,
              entity_ids:
                savedUnit.entity_ids?.length > 0 ? savedUnit.entity_ids : _resolvedEntityIds,
            };
            await this.enqueueMemoryReviewIfNeeded(
              userId,
              splitUnitForReview,
              splitUnit.content || normalized.normalized_text
            );
          }
        } else {
          // Normal extraction for single-event utterances — hybrid router first,
          // falls back to full LLM only for complex messages.
          const hybridResult = await hybridExtractor.extractSemanticUnits(
            normalized.normalized_text,
            conversationHistory,
            sender === 'AI'
          );
          const units = hybridResult;
          logger.debug(
            { route: hybridResult.route, complexity: hybridResult.classification.complexity },
            'Extraction route taken'
          );

          // Capture for shadow baseline
          for (const u of units.units) {
            _shadowBaseline.experiences.push({ content: u.content, type: u.type });
          }

          // Step 6: Save extracted units
          for (const unit of units.units) {
            // Extract temporal context from the unit
            let temporalContext = unit.temporal_context || {};
            
            // If no explicit time is found, try to extract temporal references
            if (!temporalContext.start_time && !temporalContext.end_time) {
              const temporalRefs = await this.extractTemporalReferences(
                userId,
                normalized.normalized_text,
                utteranceTexts[i]
              );
              
              if (temporalRefs.length > 0) {
                // Use the extracted temporal reference
                temporalContext = {
                  ...temporalContext,
                  start_time: temporalRefs[0].timestamp.toISOString(),
                  ...(temporalRefs[0].endTimestamp ? { end_time: temporalRefs[0].endTimestamp.toISOString() } : {}),
                  precision: temporalRefs[0].precision,
                  confidence: temporalRefs[0].confidence,
                  original_text: temporalRefs[0].originalText,
                  label: temporalRefs[0].label,
                };
              } else {
                temporalContext = this.buildUnresolvedTemporalContext(
                  utteranceTexts[i] || normalized.normalized_text,
                  temporalContext
                );
              }
            }

            const savedUnit = await this.saveExtractedUnit(
              userId,
              utteranceIds[i],
              {
                ...unit,
                temporal_context: temporalContext
              },
              normalized
            );
            unitIds.push(savedUnit.id);

          // Step 6.5: Create knowledge unit with epistemic classification
          try {
            const knowledgeUnit = await knowledgeTypeEngineService.createKnowledgeUnit(
              userId,
              utteranceIds[i],
              unit.content || normalized.normalized_text,
              {
                entities: unit.entity_ids?.map((id: string) => ({ id, name: '', type: '' })) || [],
                emotions: unit.emotions || [],
                themes: unit.themes || [],
              }
            );
            
            // Link knowledge unit to extracted unit via metadata
            await supabaseAdmin
              .from('extracted_units')
              .update({
                metadata: {
                  ...savedUnit.metadata,
                  knowledge_unit_id: knowledgeUnit.id,
                  knowledge_type: knowledgeUnit.knowledge_type,
                },
              })
              .eq('id', savedUnit.id);
          } catch (error) {
            // Non-blocking - log but continue
            logger.warn({ error, unitId: savedUnit.id }, 'Failed to create knowledge unit');
          }

          // Step 6.7: Convert semantic units to memory artifacts
          // This is the finalization layer that commits understanding to memory
          try {
            // Create unit with saved ID and utterance_id for conversion
            const unitForConversion: ExtractedUnit = {
              ...savedUnit,
              id: savedUnit.id,
              utterance_id: savedUnit.utterance_id || utteranceIds[i],
              type: unit.type,
              content: unit.content || normalized.normalized_text,
              confidence: unit.confidence || savedUnit.confidence || 0.5,
              temporal_context: unit.temporal_context || {},
              entity_ids: unit.entity_ids || [],
              metadata: {
                ...(savedUnit.metadata || {}),
                temporal_scope: unit.metadata?.temporal_scope || savedUnit.metadata?.temporal_scope,
              },
            };

            const conversionResult = await semanticConversionService.convertUnitsToMemoryArtifacts(
              [unitForConversion],
              {
                userId,
                messageId,
                sessionId: threadId,
                utteranceId: utteranceIds[i], // Pass current utterance ID as fallback
                conversationHistory,
              }
            );

            logger.debug({
              userId,
              messageId,
              unitId: savedUnit.id,
              perceptions: conversionResult.perceptionEntries.length,
              entries: conversionResult.journalEntries.length,
              insights: conversionResult.insights.length,
            }, 'Converted semantic unit to memory artifacts');

            // Step 6.8: Entity Relationship Detection (unified ER path)
            ingestConversationER(userId, messageId, unit.content || normalized.normalized_text);

            // Step 6.9: Contextual Intelligence (Phase-Safe)
            // After semantic conversion, before event assembly
            try {
              // Extract entities from unit for context
              const unitEntityIds = unit.entity_ids || [];

              // Resolve ambiguous references if we have context entities
              if (unitEntityIds.length > 0 && unit.content) {
                // Check for ambiguous references in content (simple pattern matching)
                const ambiguousPatterns = [
                  /(?:^|\s)(the\s+)?(kids|children|boys|girls|guys|people|family|everyone)(?:\s|$)/i,
                ];

                for (const pattern of ambiguousPatterns) {
                  const match = unit.content.match(pattern);
                  if (match) {
                    const referenceText = match[0].trim();
                    const resolution = await resolveAmbiguousEntity(
                      userId,
                      referenceText,
                      unitEntityIds,
                      {
                        location: unit.metadata?.location as string | undefined,
                        household: unit.metadata?.household as string | undefined,
                        recentConversations: conversationHistory?.slice(-5).map(m => m.content),
                      }
                    );

                    if (resolution) {
                      // Learn alias if multiple entities resolved
                      if (unitEntityIds.length >= 2) {
                        await learnAlias(
                          userId,
                          referenceText,
                          unitEntityIds,
                          'household',
                          {
                            location: unit.metadata?.location as string | undefined,
                            household: unit.metadata?.household as string | undefined,
                          }
                        );
                      }

                      logger.debug(
                        { userId, referenceText, resolvedId: resolution.resolved_entity_id },
                        'Resolved ambiguous reference'
                      );
                    }
                  }
                }
              }

              // Build household hypotheses if entities are mentioned together
              if (unitEntityIds.length >= 2) {
                // Check if this suggests cohabitation (same location, same time)
                const location = unit.metadata?.location as string | undefined;
                if (location && (location.includes('house') || location.includes('home'))) {
                  // Create cohabitation hypotheses for pairs
                  for (let i = 0; i < unitEntityIds.length; i++) {
                    for (let j = i + 1; j < unitEntityIds.length; j++) {
                      await updateHouseholdHypotheses(userId, {
                        subject_entity_id: unitEntityIds[i],
                        related_entity_id: unitEntityIds[j],
                        hypothesis_type: 'cohabitation',
                        location,
                      });
                    }
                  }
                }
              }
            } catch (error) {
              // Non-blocking - log but continue
              logger.warn({ error, unitId: savedUnit.id }, 'Contextual intelligence failed (non-blocking)');
            }
          } catch (error) {
            // Non-blocking - log but continue
            logger.warn({ error, unitId: savedUnit.id }, 'Failed to convert unit to memory artifacts');
          }

          // Step 7: Detect and process corrections
          const correctionDetection = await correctionResolutionService.detectCorrection(
            userId,
            savedUnit,
            conversationHistory
          );

          if (correctionDetection.isCorrection && correctionDetection.correctedUnitIds.length > 0) {
            // Process explicit or implicit correction
            await correctionResolutionService.processCorrection(
              userId,
              savedUnit,
              correctionDetection.correctedUnitIds,
              correctionDetection.correctionType
            );
            logger.info(
              {
                correctionUnitId: savedUnit.id,
                correctedUnitIds: correctionDetection.correctedUnitIds,
                type: correctionDetection.correctionType,
              },
              'Correction detected and processed'
            );
          } else {
            // Step 8: Auto-resolve contradictions (if not a correction)
            const contradictions = await correctionResolutionService.autoResolveContradictions(
              userId,
              savedUnit
            );
            if (contradictions.length > 0) {
              logger.info(
                { unitId: savedUnit.id, resolutions: contradictions.length },
                'Contradictions auto-resolved'
              );
            }
          }

          // Step 9: Link unit to event if event context provided
          if (eventContext) {
            await this.linkUnitToEvent(savedUnit.id, eventContext);
            // Reconcile event after linking new unit (async, non-blocking)
            eventAssemblyService
              .reconcileEvent(eventContext, userId)
              .catch(err => {
                logger.warn({ error: err, eventId: eventContext, userId }, 'Event reconciliation failed (non-blocking)');
              });
          }

          // Step 10: Link unit to entity if entity context provided
          if (entityContext) {
            await this.linkUnitToEntity(savedUnit.id, entityContext);
          }

          // Step 11: Enqueue for memory review if needed
          const unitForReview: ExtractedUnit = {
            ...savedUnit,
            entity_ids:
              savedUnit.entity_ids?.length > 0 ? savedUnit.entity_ids : _resolvedEntityIds,
          };
          await this.enqueueMemoryReviewIfNeeded(
            userId,
            unitForReview,
            unit.content || normalized.normalized_text
          );
        }
      }

      // Step 12: Trigger event assembly (async, non-blocking)
      // Note: Currently processes all EXPERIENCE units for user
      // Can be optimized later to process only new units
      // Event assembly will skip deprecated units automatically
      if (unitIds.length > 0) {
        eventAssemblyService
          .assembleEvents(userId, threadId)
          .then(async (assembledEvents) => {
            // Step 12.5: Link assembled events to previous context (Phase-Safe)
            // Step 12.6: Detect event impacts (how events affect the user)
            // This happens after event assembly so we have event IDs
            if (assembledEvents && assembledEvents.length > 0) {
              // Batch-fetch all resolved_events and their mentions up front.
              // Reduces from 4N queries to 4 queries total (DataLoader pattern).
              const assembledEventIds = assembledEvents.map(e => e.event_id);

              const [eventsResult, mentionsResult] = await Promise.all([
                supabaseAdmin
                  .from('resolved_events')
                  .select('*')
                  .in('id', assembledEventIds)
                  .eq('user_id', userId),
                supabaseAdmin
                  .from('event_mentions')
                  .select('event_id, memory_id')
                  .in('event_id', assembledEventIds),
              ]);

              const fullEventsMap = new Map(
                (eventsResult.data ?? []).map((e: any) => [e.id, e])
              );

              // Group mention source IDs by event, collect all unique source IDs
              const mentionsByEvent = new Map<string, string[]>();
              const allSourceIds = new Set<string>();
              for (const m of (mentionsResult.data ?? [])) {
                const arr = mentionsByEvent.get(m.event_id) ?? [];
                arr.push(m.memory_id);
                mentionsByEvent.set(m.event_id, arr);
                allSourceIds.add(m.memory_id);
              }

              const sourceIdsArr = Array.from(allSourceIds);
              const [messagesResult, journalResult] = await Promise.all([
                sourceIdsArr.length > 0
                  ? supabaseAdmin.from('chat_messages').select('id, content').in('id', sourceIdsArr).limit(50)
                  : Promise.resolve({ data: [] as any[] }),
                sourceIdsArr.length > 0
                  ? supabaseAdmin.from('journal_entries').select('id, content').in('id', sourceIdsArr).limit(50)
                  : Promise.resolve({ data: [] as any[] }),
              ]);

              const messagesById = new Map(
                (messagesResult.data ?? []).map((m: any) => [m.id, m.content as string])
              );
              const journalById = new Map(
                (journalResult.data ?? []).map((e: any) => [e.id, e.content as string])
              );

              for (const eventResult of assembledEvents) {
                try {
                  // Link to previous context
                  const links = await linkContextualEvents(userId, eventResult.event_id);

                  if (links.length > 0) {
                    logger.debug(
                      { userId, eventId: eventResult.event_id, linksFound: links.length },
                      'Linked event to previous context'
                    );
                  }

                  const fullEvent = fullEventsMap.get(eventResult.event_id);

                  if (fullEvent) {
                    const sourceMessageIds = mentionsByEvent.get(fullEvent.id) ?? [];

                    // Resolve from pre-fetched maps — no per-event DB queries
                    const sourceMessages = sourceMessageIds
                      .map(id => ({ id, content: messagesById.get(id) ?? '' }))
                      .filter(m => m.content);

                    const sourceJournalEntries = sourceMessageIds
                      .map(id => ({ id, content: journalById.get(id) ?? '' }))
                      .filter(e => e.content);

                    // Detect impact
                    const impact = await eventImpactDetector.detectEventImpact(
                      userId,
                      fullEvent.id,
                      {
                        people: fullEvent.people || [],
                        locations: fullEvent.locations || [],
                        title: fullEvent.title,
                        summary: fullEvent.summary || '',
                      },
                      sourceMessages,
                      sourceJournalEntries
                    );

                    if (impact) {
                      logger.debug(
                        { userId, eventId: fullEvent.id, impactType: impact.impactType },
                        'Detected event impact'
                      );
                    }

                    // Detect causal relationships (Step 12.7)
                    const causalLinks = await eventCausalDetector.detectCausalRelationships(
                      userId,
                      {
                        id: fullEvent.id,
                        title: fullEvent.title,
                        summary: fullEvent.summary,
                        start_time: fullEvent.start_time,
                        people: fullEvent.people || [],
                        locations: fullEvent.locations || [],
                      },
                      sourceMessages,
                      sourceJournalEntries
                    );

                    if (causalLinks.length > 0) {
                      logger.debug(
                        { userId, eventId: fullEvent.id, causalLinksFound: causalLinks.length },
                        'Detected causal relationships'
                      );
                    }

                    // Step 12.8: Build character timelines (shared experiences and lore)
                    if (fullEvent.people && fullEvent.people.length > 0) {
                      characterTimelineBuilder
                        .processEventForCharacters(
                          userId,
                          fullEvent.id,
                          {
                            title: fullEvent.title,
                            summary: fullEvent.summary,
                            type: fullEvent.type,
                            start_time: fullEvent.start_time,
                            people: fullEvent.people,
                          },
                          impact?.impactType,
                          impact?.connectionCharacterId
                        )
                        .then(() => {
                          logger.debug(
                            { userId, eventId: fullEvent.id, characters: fullEvent.people.length },
                            'Processed event for character timelines'
                          );
                        })
                        .catch(err => {
                          logger.warn({ err }, 'Character timeline processing failed (non-blocking)');
                        });

                      // Sprint AL: enrich real data after event assembly
                      void import('../events/eventSignificanceService')
                        .then(({ scoreAndPersistEvent }) => scoreAndPersistEvent(userId, fullEvent.id))
                        .catch(err => logger.debug({ err, userId }, 'AL event significance failed'));

                      void import('../meaning/eventMeaningService')
                        .then(({ generateAndPersistEventMeaning }) =>
                          generateAndPersistEventMeaning(userId, fullEvent.id)
                        )
                        .catch(err => logger.debug({ err, userId }, 'AL event meaning failed'));

                      void import('../characters/characterImportanceService')
                        .then(async ({ scoreAndPersistCharacter }) => {
                          for (const charId of fullEvent.people ?? []) {
                            await scoreAndPersistCharacter(userId, charId);
                          }
                        })
                        .catch(err => logger.debug({ err, userId }, 'AL character importance failed'));

                      void import('../characters/characterBiographyService')
                        .then(async ({ buildAndPersistBiography }) => {
                          for (const charId of fullEvent.people ?? []) {
                            await buildAndPersistBiography(userId, charId);
                          }
                        })
                        .catch(err => logger.debug({ err, userId }, 'AL character biography failed'));
                    }

                    // Step 12.8.5: Recurring scene detection — non-blocking
                    eventCandidateService
                      .processResolvedEvent(userId, fullEvent.id)
                      .catch(err => {
                        logger.warn({ err }, 'Event candidate processing failed (non-blocking)');
                      });

                    // Step 12.8.4b: Lexical narrative structure → event metadata + interpretations
                    void import('../narrative/narrativeStructureService')
                      .then(async ({ persistNarrativeStructureForEvent, boostArcMembershipFromEvent }) => {
                        const narrativeText = [
                          ...sourceMessages.map((m) => m.content),
                          ...sourceJournalEntries.map((e) => e.content),
                        ].join('\n').trim() || fullEvent.summary || fullEvent.title || '';
                        const analysis = await persistNarrativeStructureForEvent(
                          userId,
                          fullEvent.id,
                          narrativeText,
                        );
                        if (analysis?.primaryArcMembershipRole) {
                          await boostArcMembershipFromEvent(userId, fullEvent.id);
                        }
                        if (analysis?.isStoryBlock) {
                          const { scheduleNarrativeArcConsolidation } = await import(
                            '../narrative/narrativeArcConsolidationScheduler'
                          );
                          scheduleNarrativeArcConsolidation(userId, 'story_block_ingest');
                        }
                      })
                      .catch(err => logger.debug({ err, userId }, 'Narrative structure persist failed'));

                    // Step 12.8.6: Narrative continuity detection — non-blocking
                    // detectContinuity() is rule-based (no LLM), fully implemented,
                    // but was never wired into the pipeline. This activates "Part of a
                    // Bigger Picture" for all future events.
                    ;(async () => {
                      try {
                        const { data: pastEvents } = await supabaseAdmin
                          .from('resolved_events')
                          .select('id, title, summary, confidence, people, locations, activities, start_time, end_time, metadata')
                          .eq('user_id', userId)
                          .lt('start_time', fullEvent.start_time)
                          .order('start_time', { ascending: false })
                          .limit(30);

                        if (pastEvents && pastEvents.length > 0) {
                          const currentEventForContinuity = {
                            id: fullEvent.id,
                            title: fullEvent.title,
                            summary: fullEvent.summary,
                            confidence: (fullEvent as any).confidence || 0.7,
                            people: fullEvent.people || [],
                            locations: fullEvent.locations || [],
                            activities: fullEvent.activities || [],
                            start_time: fullEvent.start_time,
                            end_time: (fullEvent as any).end_time ?? null,
                            metadata: (fullEvent as any).metadata,
                          };
                          const pastEventsForContinuity = pastEvents.map((e: any) => ({
                            id: e.id,
                            title: e.title,
                            summary: e.summary,
                            confidence: e.confidence || 0.7,
                            people: e.people || [],
                            locations: e.locations || [],
                            activities: e.activities || [],
                            start_time: e.start_time,
                            end_time: e.end_time ?? null,
                            metadata: e.metadata,
                          }));

                          const links = await narrativeContinuityService.detectContinuity(
                            userId,
                            [currentEventForContinuity],
                            pastEventsForContinuity
                          );

                          if (links.length > 0) {
                            logger.debug(
                              { userId, eventId: fullEvent.id, linksFound: links.length },
                              'Detected narrative continuity links'
                            );
                          }
                        }
                      } catch (err) {
                        logger.warn({ err, eventId: fullEvent.id }, 'Narrative continuity detection failed (non-blocking)');
                      }
                    })();

                    // Step 12.9: Detect workout events and extract biometrics
                    // Check if this event is workout-related
                    const eventText = `${fullEvent.title} ${fullEvent.summary || ''}`.toLowerCase();
                    const isWorkoutRelated = await workoutEventDetector.detectWorkout({
                      id: fullEvent.id,
                      user_id: userId,
                      type: 'EXPERIENCE',
                      content: eventText,
                      confidence: 0.5,
                      temporal_context: {},
                      entity_ids: [],
                      metadata: {}
                    } as ExtractedUnit);

                    if (isWorkoutRelated) {
                      // Extract workout data
                      workoutEventDetector
                        .extractWorkoutData(userId, eventText)
                        .then(async (workoutData) => {
                          if (workoutData) {
                            // Detect social interactions at gym
                            const socialInteractions = await gymSocialDetector.detectSocialInteractions(
                              userId,
                              eventText,
                              fullEvent.id
                            );

                            if (socialInteractions.length > 0) {
                              workoutData.social_interactions = socialInteractions;
                            }

                            // Calculate significance
                            workoutData.significance_score = workoutEventDetector.calculateSignificance(workoutData);

                            // Determine skills practiced
                            const skillsPracticed: string[] = [];
                            if (workoutData.workout_type === 'weightlifting' || workoutData.workout_type === 'mixed') {
                              skillsPracticed.push('weightlifting');
                            }
                            if (socialInteractions.length > 0) {
                              skillsPracticed.push('social_skills');
                              if (socialInteractions.some(i => i.interaction_type === 'romantic_interest')) {
                                skillsPracticed.push('romantic_approach');
                              }
                            }
                            workoutData.skills_practiced = skillsPracticed;

                            // Save workout event
                            await workoutEventDetector.saveWorkoutEvent(userId, fullEvent.id, workoutData);

                            logger.debug(
                              { userId, eventId: fullEvent.id, workoutType: workoutData.workout_type },
                              'Detected and saved workout event'
                            );
                          }
                        })
                        .catch(err => {
                          logger.warn({ err, eventId: fullEvent.id }, 'Workout detection failed (non-blocking)');
                        });
                    }

                    // Step 12.10: Extract biometrics from event text
                    if (biometricExtractor.detectBiometrics(eventText)) {
                      biometricExtractor
                        .extractBiometrics(userId, eventText, undefined)
                        .then(async (biometric) => {
                          if (biometric) {
                            await biometricExtractor.saveBiometricMeasurement(biometric);
                            logger.debug(
                              { userId, eventId: fullEvent.id, source: biometric.source },
                              'Extracted and saved biometric measurement'
                            );
                          }
                        })
                        .catch(err => {
                          logger.warn({ err, eventId: fullEvent.id }, 'Biometric extraction failed (non-blocking)');
                        });
                    }
                  }
                } catch (error) {
                  logger.warn({ error, eventId: eventResult.event_id }, 'Failed to process event context');
                }
              }
            }

            dayOccasionService
              .processRecentDays(userId, { lookbackDays: 7 })
              .catch(err => {
                logger.warn({ err, userId }, 'Day occasion arc detection failed (non-blocking)');
              });
          })
          .catch(err => {
            logger.warn({ error: err, userId, threadId }, 'Event assembly failed (non-blocking)');
          });
      }

      // Step 12.11: Detect interests from message text (async, non-blocking)
      // Gated on a cheap keyword signal — see extractionSignals.ts. Skips the LLM
      // call for the many messages with no interest content (the 429 fan-out fix).
      if (sender === 'USER' && rawText.length > 10 && hasInterestSignal(rawText)) {
        interestDetector
          .detectInterests(userId, rawText, undefined, messageId)
          .then(async (detectedInterests) => {
            if (detectedInterests.length > 0) {
              for (const detected of detectedInterests) {
                try {
                  // Save or update interest
                  const interestId = await interestTracker.saveInterest(
                    userId,
                    detected,
                    undefined, // entryId (could be linked later)
                    messageId
                  );

                  // Add to scope if category is provided
                  if (detected.interest_category) {
                    await interestTracker.addInterestToScope(
                      userId,
                      interestId,
                      detected.interest_category,
                      detected.context
                    );
                  }

                  logger.debug(
                    { userId, interestName: detected.interest_name, interestId },
                    'Detected and saved interest'
                  );
                } catch (err) {
                  logger.warn({ err, interestName: detected.interest_name }, 'Failed to save interest');
                }
              }
            }
          })
          .catch(err => {
            logger.warn({ err }, 'Interest detection failed (non-blocking)');
          });
      }

      // Step 12.12: Detect quests/progress/skills/projects/life-changes from user
      // messages. Each extractor is an independent LLM call, so each is gated on a
      // cheap keyword signal (extractionSignals.ts) to avoid firing the full
      // cluster on messages with no such content — the core 429 fan-out fix.
      if (sender === 'USER' && rawText.length > 10) {
        if (hasQuestSignal(rawText)) {
          const { questSuggestionService } = await import('../quests/questSuggestionService');
          questSuggestionService
            .processChatMessageForQuestSuggestions(userId, messageId, rawText, conversationHistory)
            .then((count) => {
              if (count > 0) {
                logger.debug({ userId, messageId, count }, 'Queued quest suggestions from chat');
              }
            })
            .catch(err => {
              logger.warn({ err, userId, messageId }, 'Quest suggestion extraction failed (non-blocking)');
            });
        }

        // 12.12.2: Extract progress updates and update existing quests
        if (hasProgressSignal(rawText)) {
        questExtractor
          .extractProgressUpdates(userId, rawText, conversationHistory)
          .then(async (progressUpdates) => {
            if (progressUpdates.length > 0) {
              const results = await questService.updateProgressFromExtraction(userId, progressUpdates);
              if (results.some(r => r.updated)) {
                logger.info(
                  { userId, updatedCount: results.filter(r => r.updated).length },
                  'Auto-updated quest progress from chat message'
                );
              }
            }
          })
          .catch(err => {
            logger.warn({ err, userId, messageId }, 'Progress update extraction failed (non-blocking)');
          });
        }

        // 12.12.2b: Detect skills from chat → pending suggestions (user confirms in Skills book)
        if (hasSkillSignal(rawText)) {
        skillExtractionService
          .processChatMessageForSkillSuggestions(userId, messageId, rawText)
          .then((count) => {
            if (count > 0) {
              logger.debug({ userId, messageId, count }, 'Queued skill suggestions from chat');
            }
          })
          .catch((err) => {
            logger.warn({ err, userId, messageId }, 'Skill suggestion extraction failed (non-blocking)');
          });
        }

        if (hasProjectSignal(rawText)) {
          const { projectSuggestionService } = await import('../projects/projectSuggestionService');
          projectSuggestionService
            .processChatMessageForProjectSuggestions(userId, messageId, rawText, conversationHistory)
            .then((count) => {
              if (count > 0) {
                logger.debug({ userId, messageId, count }, 'Queued project suggestions from chat');
              }
            })
            .catch((err) => {
              logger.warn({ err, userId, messageId }, 'Project suggestion extraction failed (non-blocking)');
            });
        }

        // 12.12.3: Detect life changes and handle conflicting quests
        if (hasLifeChangeSignal(rawText)) {
        questExtractor
          .detectLifeChanges(userId, rawText, conversationHistory)
          .then(async (lifeChanges) => {
            if (lifeChanges.abandonedQuests.length > 0 || lifeChanges.pausedQuests.length > 0) {
              // Abandon conflicting quests
              if (lifeChanges.abandonedQuests.length > 0) {
                const abandonResults = await questService.abandonConflictingQuests(userId, lifeChanges.abandonedQuests);
                
                // Convert abandoned quests to goals
                for (const result of abandonResults) {
                  if (result.abandoned) {
                    try {
                      const goalId = await questService.convertAbandonedQuestToGoal(
                        userId,
                        result.questId,
                        lifeChanges.overallReason || result.reason
                      );
                      if (goalId) {
                        logger.info(
                          { userId, questId: result.questId, goalId },
                          'Converted abandoned quest to goal'
                        );
                      }
                    } catch (error) {
                      logger.warn({ error, userId, questId: result.questId }, 'Failed to convert abandoned quest to goal');
                    }
                  }
                }

                if (abandonResults.some(r => r.abandoned)) {
                  logger.info(
                    { userId, abandonedCount: abandonResults.filter(r => r.abandoned).length },
                    'Auto-abandoned quests due to life changes'
                  );
                }
              }

              // Pause quests
              if (lifeChanges.pausedQuests.length > 0) {
                const pauseResults = await questService.pauseQuestsFromLifeChanges(userId, lifeChanges.pausedQuests);
                if (pauseResults.some(r => r.paused)) {
                  logger.info(
                    { userId, pausedCount: pauseResults.filter(r => r.paused).length },
                    'Auto-paused quests due to life changes'
                  );
                }
              }
            }
          })
          .catch(err => {
            logger.warn({ err, userId, messageId }, 'Life change detection failed (non-blocking)');
          });
        }
      } // End of Step 12.12 quest extraction block

      // Step 11: Detect skill and group relationships (async, non-blocking)
      // Detect skill relationships if skills are mentioned
      if (unitIds.length > 0) {
        // Get skills mentioned in this message (via skill extraction or entity detection)
        try {
          const { data: skills } = await supabaseAdmin
            .from('skills')
            .select('id, skill_name')
            .eq('user_id', userId)
            .eq('is_active', true)
            .limit(10);

          if (skills && skills.length >= 2) {
            // Check if message mentions multiple skills
            const mentionedSkills = skills.filter(skill =>
              rawText.toLowerCase().includes(skill.skill_name.toLowerCase())
            );

            if (mentionedSkills.length >= 2) {
              skillNetworkBuilder
                .detectSkillRelationships(userId, rawText, mentionedSkills)
                .then(rels => {
                  if (rels.length > 0) {
                    logger.debug(
                      { userId, relationshipsFound: rels.length },
                      'Detected skill relationships'
                    );
                  }
                })
                .catch(err => {
                  logger.warn({ err, userId, messageId, mentionedSkillCount: mentionedSkills.length }, 'Skill relationship detection failed (non-blocking)');
                });
            }
          }
        } catch (error) {
          logger.warn({ error, userId, messageId }, 'Skill relationship detection check failed');
        }

        // Detect group relationships if groups are mentioned
        try {
          const { data: groups } = await supabaseAdmin
            .from('social_communities')
            .select('id, community_id, members')
            .eq('user_id', userId)
            .limit(10);

          if (groups && groups.length >= 2) {
            // Check if message mentions multiple groups
            const mentionedGroups = groups.filter(group =>
              rawText.toLowerCase().includes(group.community_id.toLowerCase())
            );

            if (mentionedGroups.length >= 2) {
              groupNetworkBuilder
                .detectGroupRelationships(
                  userId,
                  rawText,
                  mentionedGroups.map(g => ({
                    id: g.id,
                    name: g.community_id,
                    members: g.members || [],
                  }))
                )
                .then(rels => {
                  if (rels.length > 0) {
                    logger.debug(
                      { userId, relationshipsFound: rels.length },
                      'Detected group relationships'
                    );
                  }
                })
                .catch(err => {
                  logger.warn({ err }, 'Group relationship detection failed (non-blocking)');
                });
            }
          }
        } catch (error) {
          logger.warn({ error }, 'Group relationship detection check failed');
        }
      }

      // Step 11.3: Detect romantic relationships (async, non-blocking)
      if (sender === 'USER' && (unitIds.length > 0 || hasRomanticSignals(rawText) || hasVicariousRelationshipSignals(rawText))) {
        try {
          const romanticDetectionPromise = this.detectRomanticRelationshipsAsync(userId, rawText, unitIds, messageId);
          romanticDetectionPromise.catch((err: unknown) => {
            logger.warn({ err }, 'Romantic relationship detection failed');
          });
        } catch (err) {
          logger.warn({ err }, 'Failed to initiate romantic relationship detection');
        }
      }

      // Step 12: Update thread timestamp
      try {
        await this.updateThreadTimestamp(threadId);
      } catch (err) {
        logger.warn({ err, userId, threadId }, 'Failed to update thread timestamp, continuing');
      }

      // Step 12.5: Thread intelligence — fold this turn into the canonical
      // thread metadata (Phase 2) and refresh living summaries if stale (Phase 1).
      // Incremental, single store (conversation_sessions.metadata.threadMeta),
      // never a full thread scan. Non-blocking.
      try {
        const { threadIntelligenceService } = await import('./threadIntelligenceService');
        await threadIntelligenceService.updateOnMessage(userId, threadId, {
          people: _threadMetaTurn.people,
          places: _threadMetaTurn.places,
          at: new Date().toISOString(),
          addedMessages: 1,
        });
        // Summary regen is staleness-gated internally; fire-and-forget so it
        // never blocks the chat turn.
        import('./threadSummaryService').then(({ threadSummaryService }) => {
          threadSummaryService.maybeRefresh(userId, threadId).catch(() => {});
        }).catch(() => {});
      } catch (err) {
        logger.warn({ err, userId, threadId }, 'Thread intelligence update failed (non-blocking)');
      }

      // Step 12.13: Group candidate detection — non-blocking, fire-and-forget
      // Detects recurring people clusters and named groups in USER messages.
      // Results land in group_candidates table for user review — nothing is auto-created.
      if (sender === 'USER' && rawText.length > 15) {
        groupCandidateService
          .processChatMessage(userId, rawText, messageId)
          .catch(err => {
            logger.warn({ err }, 'Group candidate detection failed (non-blocking)');
          });
      }

      // Shadow mode — runs in background after response is returned, never blocks chat
      if (sender === 'USER') {
        setImmediate(() => {
          shadowModeOrchestrator.runShadow({
            messageId,
            userId,
            rawText,
            sender,
            conversationHistory,
            knownEntityNames: _shadowBaseline.entities.map(e => e.name),
            baseline: _shadowBaseline,
          }).catch(() => {});
        });
      }

      // Emit the per-message LLM cost summary (ingestion.cost) and stage latency.
      stageTimer.mark('detectors_and_assembly');
      costMeter.flush();
      stageTimer.flush();

      // Return the results
      return {
        messageId,
        utteranceIds,
        unitIds,
        resolvedEntityIds: _resolvedEntityIds,
        resolvedLocationIds: _resolvedLocationIds,
      };
    }
  }
}
