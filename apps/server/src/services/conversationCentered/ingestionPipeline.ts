// =====================================================
// CONVERSATION INGESTION PIPELINE
// Purpose: Process messages through full pipeline
// =====================================================

import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';
import { normalizationService } from './normalizationService';
import { semanticExtractionService } from './semanticExtractionService';
import { eventAssemblyService } from './eventAssemblyService';
import { correctionResolutionService } from './correctionResolutionService';
import { entryEnrichmentService } from '../entryEnrichmentService';
import { knowledgeTypeEngineService } from '../knowledgeTypeEngineService';
import { irCompiler } from '../compiler/irCompiler';
import { dependencyGraph } from '../compiler/dependencyGraph';
// import { memoryReviewQueueService } from '../memoryReviewQueueService';
import type { Message, Utterance, ExtractedUnit } from '../../types/conversationCentered';

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
    conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>
  ): Promise<void> {
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

      // Check if already ingested (avoid duplicate processing)
      const { data: existing } = await supabaseAdmin
        .from('conversation_messages')
        .select('id')
        .eq('metadata->>chat_message_id', chatMessageId)
        .single();

      if (existing) {
        logger.debug({ chatMessageId, conversationMessageId: existing.id }, 'Message already ingested');
        return;
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
    } catch (error) {
      // Log but don't throw - ingestion failures should not block chat
      logger.error(
        { error, chatMessageId, userId, sessionId },
        'Failed to ingest chat message (non-blocking)'
      );
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
  }> {
    try {
      // Step 1: Save message (if not already saved)
      // Note: In practice, message might already be saved by chat service
      // This is a placeholder - adjust based on your chat service implementation
      const messageId = await this.ensureMessageSaved(userId, threadId, sender, rawText);

      // Step 2: Split into utterances
      const utteranceTexts = normalizationService.splitIntoUtterances(rawText);

      // Step 3: Normalize each utterance
      const normalizedUtterances = await Promise.all(
        utteranceTexts.map(text => normalizationService.normalizeText(text))
      );

      // Step 4: Extract entities for enrichment (needed before saving utterances)
      const resolvedEntities: Array<{ id: string; type: string }> = [];
      try {
        // Get entities from semantic extraction or entity resolution
        // For now, we'll extract them from the first normalized utterance
        if (normalizedUtterances.length > 0) {
          const { omegaMemoryService } = await import('../omegaMemoryService');
          const candidateEntities = await omegaMemoryService.extractEntities(normalizedUtterances[0].normalized_text);
          const resolved = await omegaMemoryService.resolveEntities(userId, candidateEntities);
          resolvedEntities.push(...resolved.map(e => ({ id: e.id, type: e.type })));
        }
      } catch (error) {
        logger.debug({ error }, 'Failed to resolve entities for enrichment, continuing without');
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
        } catch (error) {
          logger.warn({ error, utteranceId: utterance.id }, 'Failed to compile utterance to IR, continuing');
        }
      }

      // Step 5: Extract semantic units from each utterance
      const unitIds: string[] = [];
      for (let i = 0; i < utteranceIds.length; i++) {
        const normalized = normalizedUtterances[i];
        const units = await semanticExtractionService.extractSemanticUnits(
          normalized.normalized_text,
          conversationHistory
        );

        // Step 6: Save extracted units
        for (const unit of units.units) {
          const savedUnit = await this.saveExtractedUnit(
            userId,
            utteranceIds[i],
            unit,
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
            logger.debug({ error, unitId: savedUnit.id }, 'Failed to create knowledge unit');
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
          await this.enqueueMemoryReviewIfNeeded(userId, savedUnit);
        }
      }

      // Step 12: Trigger event assembly (async, non-blocking)
      // Note: Currently processes all EXPERIENCE units for user
      // Can be optimized later to process only new units
      // Event assembly will skip deprecated units automatically
      if (unitIds.length > 0) {
        eventAssemblyService
          .assembleEvents(userId)
          .catch(err => {
            logger.warn({ error: err, userId, threadId }, 'Event assembly failed (non-blocking)');
          });
      }

      // Step 11: Update thread timestamp
      await this.updateThreadTimestamp(threadId);

      return {
        messageId,
        utteranceIds,
        unitIds,
      };
    } catch (error) {
      logger.error({ error, userId, threadId, rawText }, 'Failed to ingest message');
      throw error;
    }
  }

  /**
   * Ensure conversation session exists (map from chat_session if needed)
   */
  private async ensureConversationSession(
    userId: string,
    chatSessionId: string
  ): Promise<string> {
    // Check if conversation session already exists for this chat session
    const { data: existing } = await supabaseAdmin
      .from('conversation_sessions')
      .select('id')
      .eq('user_id', userId)
      .eq('metadata->>chat_session_id', chatSessionId)
      .single();

    if (existing) {
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

    if (existing) {
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

    return message.id;
  }

  /**
   * Save normalized utterance with enrichment metadata
   */
  private async saveUtterance(
    userId: string,
    messageId: string,
    originalText: string,
    normalized: { normalized_text: string; language: string },
    enrichment?: import('../entryEnrichmentService').EnrichedEntryMetadata
  ): Promise<Utterance> {
    const { data: utterance, error } = await supabaseAdmin
      .from('utterances')
      .insert({
        message_id: messageId,
        user_id: userId,
        normalized_text: normalized.normalized_text,
        original_text: originalText,
        language: normalized.language,
        metadata: enrichment ? {
          emotions: enrichment.emotions,
          themes: enrichment.themes,
          people: enrichment.people,
          intensity: enrichment.intensity,
          is_venting: enrichment.is_venting,
        } : {},
      })
      .select('*')
      .single();

    if (error) {
      throw error;
    }

    return utterance;
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
    normalized: { normalized_text: string; language: string }
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
    unit: ExtractedUnit
  ): Promise<void> {
    // Check if unit affects identity, contradicts, or has high confidence
    const shouldReview =
      unit.type === 'CLAIM' ||
      unit.type === 'PERCEPTION' ||
      unit.confidence >= 0.8 ||
      unit.entity_ids.length > 0; // Affects entities

    if (shouldReview) {
      // Create MRQ proposal
      // Note: This is a simplified version - adjust based on your MRQ service
      try {
        // TODO: Integrate with memoryReviewQueueService
      // await memoryReviewQueueService.createProposalFromUnit(userId, unit);
        logger.debug({ unitId: unit.id }, 'Unit queued for review');
      } catch (error) {
        logger.warn({ error, unitId: unit.id }, 'Failed to queue unit for review');
      }
    }
  }

  /**
   * Link extracted unit to an event
   */
  private async linkUnitToEvent(unitId: string, eventId: string): Promise<void> {
    try {
      await supabaseAdmin
        .from('event_unit_links')
        .insert({
          event_id: eventId,
          unit_id: unitId,
        })
        .onConflict('event_id,unit_id')
        .ignore();
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
}

export const conversationIngestionPipeline = new ConversationIngestionPipeline();

