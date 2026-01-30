// =====================================================
// CONVERSATION INGESTION PIPELINE
// Purpose: Process messages through full pipeline
// =====================================================

import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';
import { normalizationService } from './normalizationService';
import { semanticExtractionService } from './semanticExtractionService';
import { eventAssemblyService } from './eventAssemblyService';
import { multiEventSplittingService } from './multiEventSplittingService';
import { correctionResolutionService } from './correctionResolutionService';
import { entryEnrichmentService } from '../entryEnrichmentService';
import { knowledgeTypeEngineService } from '../knowledgeTypeEngineService';
import { irCompiler } from '../compiler/irCompiler';
import { dependencyGraph } from '../compiler/dependencyGraph';
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
import { relationshipDriftDetector } from './relationshipDriftDetector';
import { relationshipCycleDetector } from './relationshipCycleDetector';
import { breakupDetector } from './breakupDetector';
import { characterTimelineBuilder } from './characterTimelineBuilder';
import { workoutEventDetector } from './workoutEventDetector';
import { biometricExtractor } from './biometricExtractor';
import { gymSocialDetector } from './gymSocialDetector';
import { interestDetector } from './interestDetector';
import { interestTracker } from './interestTracker';
// import { memoryReviewQueueService } from '../memoryReviewQueueService';
import type { Message, Utterance, ExtractedUnit, NormalizationResult } from '../../types/conversationCentered';
import { questExtractor } from '../quests/questExtractor';
import { questService } from '../quests/questService';
import { ingestConversationER } from '../unifiedErIngestion';

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

  /** Detect romantic relationships asynchronously (non-blocking). */
  private async detectRomanticRelationshipsAsync(
    userId: string,
    rawText: string,
    unitIds: string[],
    messageId: string
  ): Promise<void> {
    try {
      // Get entities mentioned in this message
      const entitiesWithNames = await Promise.all(
        unitIds.map(async (entityId) => {
          try {
            // Try character first
            const { data: character } = await supabaseAdmin
              .from('characters')
              .select('id, name')
              .eq('id', entityId)
              .eq('user_id', userId)
              .single();

            if (character) {
              return { id: character.id, name: character.name, type: 'character' as const };
            }

            // Try omega entity
            const { data: entity } = await supabaseAdmin
              .from('omega_entities')
              .select('id, primary_name')
              .eq('id', entityId)
              .eq('user_id', userId)
              .single();

            if (entity) {
              return { id: entity.id, name: entity.primary_name, type: 'omega_entity' as const };
            }

            return null;
          } catch (error) {
            return null;
          }
        })
      );

      const validEntities = entitiesWithNames.filter(e => e !== null) as Array<{
        id: string;
        name: string;
        type: 'character' | 'omega_entity';
      }>;

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
            'Detected romantic relationships'
          );

          // For each detected relationship, try to detect date events
          for (const rel of relationships) {
            // Get relationship ID
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
              // Detect date events
              const dateEventPromise = romanticRelationshipDetector
                .detectDateEvent(userId, rawText, relationship.id, rel.personId, messageId);
              void dateEventPromise.catch(err => {
                logger.debug({ err }, 'Date event detection failed');
              });

              // Detect breakups
              const breakupPromise = breakupDetector
                .detectBreakup(userId, rawText, relationship.id, rel.personId, messageId);
              void breakupPromise.then(breakup => {
                if (breakup) {
                  logger.debug({ userId, relationshipId: relationship.id }, 'Detected breakup');
                }
              }).catch(err => {
                logger.debug({ err }, 'Breakup detection failed');
              });

              // Detect love declarations
              const loveDeclarationPromise = breakupDetector
                .detectLoveDeclaration(userId, rawText, relationship.id, rel.personId, messageId);
              void loveDeclarationPromise.catch(err => {
                logger.debug({ err }, 'Love declaration detection failed');
              });

              // Detect drift (async, less frequent)
              if (Math.random() < 0.1) {
                const driftPromise = relationshipDriftDetector
                  .detectDrift(userId, relationship.id, rel.personId, rel.personType);
                void driftPromise.then(drift => {
                  if (drift) {
                    logger.debug(
                      { userId, relationshipId: relationship.id, driftType: drift.driftType },
                      'Detected relationship drift'
                    );
                  }
                }).catch(err => {
                  logger.debug({ err }, 'Drift detection failed');
                });
              }

              // Detect cycles (less frequent, weekly check)
              if (Math.random() < 0.05) {
                const cyclesPromise = relationshipCycleDetector
                  .detectCycles(userId, relationship.id, rel.personId, rel.personType);
                void cyclesPromise.then(cycles => {
                  if (cycles.length > 0) {
                    logger.debug(
                      { userId, relationshipId: relationship.id, cyclesFound: cycles.length },
                      'Detected relationship cycles'
                    );
                  }
                }).catch(err => {
                  logger.debug({ err }, 'Cycle detection failed');
                });
              }
            }
          }
        }
      }
    } catch (err) {
      logger.debug({ err }, 'Romantic relationship detection failed (non-blocking)');
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
    normalizedText: string,
    originalText: string
  ): Promise<Array<{
    timestamp: Date;
    precision: import('../timeEngine').TimePrecision;
    confidence: number;
    originalText?: string;
  }>> {
    const { timeEngine } = await import('../timeEngine');
    const references: Array<{
      timestamp: Date;
      precision: import('../timeEngine').TimePrecision;
      confidence: number;
      originalText?: string;
    }> = [];

    // Look for temporal expressions in the text
    const temporalPatterns = [
      /\b(today|yesterday|tomorrow|now|right now|just now)\b/gi,
      /\b(last|next)\s+(week|month|year|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/gi,
      /\b(\d+)\s+(day|week|month|year)s?\s+ago\b/gi,
      /\bin\s+(\d+)\s+(day|week|month|year)s?\b/gi,
      /\b(a couple|a few)\s+(weeks?|months?|years?)\s+ago\b/gi,
      /\bwhen i was (a kid|in (high school|college|university)|younger)\b/gi,
      /\b(in|during)\s+(19|20)\d{2}\b/gi,
      /\b(19|20)\d{2}\b/g,
      /\bthe other day\b/gi,
      /\blast year\b/gi,
      /\bin (a few|a couple (of )?)weeks?\b/gi
    ];

    for (const pattern of temporalPatterns) {
      const matches = originalText.match(pattern);
      if (matches) {
        for (const match of matches) {
          const ref = timeEngine.parseTimestamp(match, undefined, true);
          if (ref.confidence > 0.5) {
            references.push({
              timestamp: ref.timestamp,
              precision: ref.precision,
              confidence: ref.confidence,
              originalText: ref.originalText || match
            });
          }
        }
      }
    }

    // If no patterns found but text suggests real-time (present tense, "just happened", etc.)
    if (references.length === 0) {
      const presentTenseIndicators = /\b(just|recently|now|currently|happening|happened|occurred)\b/gi;
      if (presentTenseIndicators.test(normalizedText)) {
        references.push({
          timestamp: new Date(),
          precision: 'minute',
          confidence: 0.7,
          originalText: 'current time'
        });
      }
    }

    return references;
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
   * Detect AI uncertainty markers in text
   * Helps identify when AI might be making assumptions
   */
  private detectAIUncertainty(text: string): {
    uncertainty_markers: string[];
    context_quality: 'high' | 'medium' | 'low';
  } {
    const uncertaintyWords = [
      'might', 'possibly', 'seems', 'appears', 'likely', 'probably',
      'perhaps', 'maybe', 'could', 'may', 'might be', 'seems like',
      'appears to', 'looks like', 'sounds like', 'i think', 'i believe',
      'i assume', 'i guess', 'unclear', 'uncertain', 'not sure'
    ];
    
    const foundMarkers: string[] = [];
    const lowerText = text.toLowerCase();
    
    for (const word of uncertaintyWords) {
      if (lowerText.includes(word)) {
        foundMarkers.push(word);
      }
    }
    
    // Determine context quality based on uncertainty markers
    let contextQuality: 'high' | 'medium' | 'low' = 'high';
    if (foundMarkers.length >= 3) {
      contextQuality = 'low';
    } else if (foundMarkers.length >= 1) {
      contextQuality = 'medium';
    }
    
    return {
      uncertainty_markers: foundMarkers,
      context_quality: contextQuality,
    };
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

  /** Core ingestion logic. Extracted to avoid esbuild parse errors on large try block. */
  private async ingestMessageCore(
    userId: string,
    threadId: string,
    sender: 'USER' | 'AI',
    rawText: string,
    conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>,
    eventContext?: string,
    entityContext?: { type: 'CHARACTER' | 'LOCATION' | 'PERCEPTION' | 'MEMORY' | 'ENTITY' | 'GOSSIP'; id: string }
  ): Promise<{ messageId: string; utteranceIds: string[]; unitIds: string[] }> {
      // Step 1: Save message (if not already saved)
      // Note: In practice, message might already be saved by chat service
      // This is a placeholder - adjust based on your chat service implementation
      const messageId = await this.ensureMessageSaved(userId, threadId, sender, rawText);

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

      // Step 4.2: Detect entity relationships and scopes
      // This happens after entity extraction so we have entity IDs
      if (resolvedEntities.length >= 2) {
        try {
          // Map entity types to our EntityType format
          const entitiesForDetection = resolvedEntities.map(e => ({
            id: e.id,
            name: '', // Will be fetched if needed
            type: (e.type === 'PERSON' || e.type === 'CHARACTER' ? 'character' : 'omega_entity') as 'character' | 'omega_entity',
          }));

          // Get entity names for detection
          const entityNames = await Promise.all(
            entitiesForDetection.map(async (e) => {
              try {
                if (e.type === 'character') {
                  const { data: char } = await supabaseAdmin
                    .from('characters')
                    .select('name')
                    .eq('id', e.id)
                    .single();
                  return { ...e, name: char?.name || '' };
                } else {
                  const { data: entity } = await supabaseAdmin
                    .from('omega_entities')
                    .select('primary_name')
                    .eq('id', e.id)
                    .single();
                  return { ...e, name: entity?.primary_name || '' };
                }
              } catch (error) {
                return { ...e, name: '' };
              }
            })
          );

          const entitiesWithNames = entityNames.filter(e => e.name);

          if (entitiesWithNames.length >= 2) {
            const detection = await entityRelationshipDetector.detectRelationshipsAndScopes(
              userId,
              rawText,
              entitiesWithNames,
              messageId,
              undefined // journal entry ID if available
            );

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

            // Detect attributes (Step 4.3)
            if (entitiesWithNames.length > 0) {
              try {
                const attributes = await entityAttributeDetector.detectAttributes(
                  userId,
                  rawText,
                  entitiesWithNames,
                  messageId,
                  undefined
                );

                if (attributes.length > 0) {
                  logger.debug(
                    { userId, attributesFound: attributes.length },
                    'Detected entity attributes'
                  );
                }
              } catch (error) {
                logger.debug({ error }, 'Attribute detection failed, continuing');
              }
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
        } catch (error) {
          logger.debug({ error }, 'Entity relationship detection failed (non-blocking)');
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
                normalized.normalized_text,
                utteranceTexts[i]
              );
              
              if (temporalRefs.length > 0) {
                temporalContext = {
                  ...temporalContext,
                  start_time: temporalRefs[0].timestamp.toISOString(),
                  precision: temporalRefs[0].precision,
                  confidence: temporalRefs[0].confidence,
                  original_text: temporalRefs[0].originalText
                };
              } else {
                // Default to current time for real-time chat
                temporalContext = {
                  ...temporalContext,
                  start_time: new Date().toISOString(),
                  precision: 'minute',
                  confidence: 0.7,
                  inferred: true,
                  source: 'current_time'
                };
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
          }
        } else {
          // Normal extraction for single-event utterances
          const units = await semanticExtractionService.extractSemanticUnits(
            normalized.normalized_text,
            conversationHistory,
            isAIMessage
          );

          // Step 6: Save extracted units
          for (const unit of units.units) {
            // Extract temporal context from the unit
            let temporalContext = unit.temporal_context || {};
            
            // If no explicit time is found, try to extract temporal references
            if (!temporalContext.start_time && !temporalContext.end_time) {
              const temporalRefs = await this.extractTemporalReferences(
                normalized.normalized_text,
                utteranceTexts[i]
              );
              
              if (temporalRefs.length > 0) {
                // Use the extracted temporal reference
                temporalContext = {
                  ...temporalContext,
                  start_time: temporalRefs[0].timestamp.toISOString(),
                  precision: temporalRefs[0].precision,
                  confidence: temporalRefs[0].confidence,
                  original_text: temporalRefs[0].originalText
                };
              } else {
                // Default to current time for real-time chat
                temporalContext = {
                  ...temporalContext,
                  start_time: new Date().toISOString(),
                  precision: 'minute', // More precise for real-time chat
                  confidence: 0.7,
                  inferred: true,
                  source: 'current_time'
                };
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
            logger.debug({ error, unitId: savedUnit.id }, 'Failed to create knowledge unit');
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
              logger.debug({ error, unitId: savedUnit.id }, 'Contextual intelligence failed (non-blocking)');
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
          .then(async (assembledEvents) => {
            // Step 12.5: Link assembled events to previous context (Phase-Safe)
            // Step 12.6: Detect event impacts (how events affect the user)
            // This happens after event assembly so we have event IDs
            if (assembledEvents && assembledEvents.length > 0) {
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

                  // Detect event impacts
                  const { data: fullEvent } = await supabaseAdmin
                    .from('resolved_events')
                    .select('*')
                    .eq('id', eventResult.event_id)
                    .eq('user_id', userId)
                    .single();

                  if (fullEvent) {
                    // Get source messages and journal entries for this event
                    const { data: mentions } = await supabaseAdmin
                      .from('event_mentions')
                      .select('memory_id')
                      .eq('event_id', fullEvent.id);

                    const sourceMessageIds = mentions?.map(m => m.memory_id) || [];

                    // Get message content for impact analysis
                    const sourceMessages: Array<{ id: string; content: string }> = [];
                    if (sourceMessageIds.length > 0) {
                      const { data: messages } = await supabaseAdmin
                        .from('chat_messages')
                        .select('id, content')
                        .in('id', sourceMessageIds)
                        .limit(10); // Limit for performance

                      if (messages) {
                        sourceMessages.push(...messages.map(m => ({ id: m.id, content: m.content })));
                      }
                    }

                    // Get journal entry content
                    const sourceJournalEntries: Array<{ id: string; content: string }> = [];
                    if (sourceMessageIds.length > 0) {
                      const { data: entries } = await supabaseAdmin
                        .from('journal_entries')
                        .select('id, content')
                        .in('id', sourceMessageIds)
                        .limit(10);

                      if (entries) {
                        sourceJournalEntries.push(...entries.map(e => ({ id: e.id, content: e.content })));
                      }
                    }

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
                          logger.debug({ err }, 'Character timeline processing failed (non-blocking)');
                        });
                    }

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
                          logger.debug({ err, eventId: fullEvent.id }, 'Workout detection failed (non-blocking)');
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
                          logger.debug({ err, eventId: fullEvent.id }, 'Biometric extraction failed (non-blocking)');
                        });
                    }
                  }
                } catch (error) {
                  logger.debug({ error, eventId: eventResult.event_id }, 'Failed to process event context');
                }
              }
            }
          })
          .catch(err => {
            logger.warn({ error: err, userId, threadId }, 'Event assembly failed (non-blocking)');
          });
      }

      // Step 12.11: Detect interests from message text (async, non-blocking)
      if (sender === 'USER' && rawText.length > 10) {
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
                  logger.debug({ err, interestName: detected.interest_name }, 'Failed to save interest');
                }
              }
            }
          })
          .catch(err => {
            logger.debug({ err }, 'Interest detection failed (non-blocking)');
          });
      }

      // Step 12.12: Auto-detect and manage quests from user messages (async, non-blocking)
      if (sender === 'USER' && rawText.length > 10) {
        // 12.12.1: Extract new quests
        questExtractor
          .extractQuestsFromMessage(userId, rawText, conversationHistory)
          .then(async (extractedQuests) => {
            if (extractedQuests.length > 0) {
              for (const quest of extractedQuests) {
                try {
                  // Check if a similar quest already exists (by title)
                  const { questStorage } = await import('../quests/questStorage');
                  const existingQuests = await questStorage.getQuests(userId, {
                    search: quest.title.substring(0, 30), // Search by first 30 chars of title
                    status: ['active', 'paused'], // Only check active/paused quests
                  });

                  // Check for duplicates (similar title)
                  const isDuplicate = existingQuests.some(
                    (q: any) => q.title.toLowerCase() === quest.title.toLowerCase() && q.status !== 'completed'
                  );

                  if (!isDuplicate) {
                    // Create the quest
                    await questService.createQuest(userId, {
                      title: quest.title,
                      description: quest.description,
                      quest_type: quest.quest_type,
                      priority: quest.priority,
                      importance: quest.importance,
                      impact: quest.impact,
                      category: quest.category,
                      source: 'extracted',
                      metadata: {
                        extracted_from_message: messageId,
                        extracted_at: new Date().toISOString(),
                      },
                    });

                    logger.info(
                      { userId, questTitle: quest.title, questType: quest.quest_type },
                      'Auto-detected and created quest from chat message'
                    );
                  } else {
                    logger.debug(
                      { userId, questTitle: quest.title },
                      'Skipped duplicate quest detection'
                    );
                  }
                } catch (err) {
                  logger.debug({ err, questTitle: quest.title }, 'Failed to create auto-detected quest');
                }
              }
            }
          })
          .catch(err => {
            logger.debug({ err }, 'Quest extraction failed (non-blocking)');
          });

        // 12.12.2: Extract progress updates and update existing quests
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
            logger.debug({ err }, 'Progress update extraction failed (non-blocking)');
          });

        // 12.12.3: Detect life changes and handle conflicting quests
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
            logger.debug({ err }, 'Life change detection failed (non-blocking)');
          });
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
                  logger.debug({ err }, 'Skill relationship detection failed (non-blocking)');
                });
            }
          }
        } catch (error) {
          logger.debug({ error }, 'Skill relationship detection check failed');
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
                  logger.debug({ err }, 'Group relationship detection failed (non-blocking)');
                });
            }
          }
        } catch (error) {
          logger.debug({ error }, 'Group relationship detection check failed');
        }
      }

      // Step 11.3: Detect romantic relationships (async, non-blocking)
      if (unitIds.length > 0) {
        try {
          // SECURITY: Store promise in variable to avoid esbuild parsing issues
          const romanticDetectionPromise = this.detectRomanticRelationshipsAsync(userId, rawText, unitIds, messageId);
          romanticDetectionPromise.catch((err: unknown) => {
            logger.debug({ err }, 'Romantic relationship detection failed');
          });
        } catch (err) {
          logger.debug({ err }, 'Failed to initiate romantic relationship detection');
        }
      }

      // Step 12: Update thread timestamp
      try {
        await this.updateThreadTimestamp(threadId);
      } catch (err) {
        logger.warn({ err, userId, threadId }, 'Failed to update thread timestamp, continuing');
      }

      // Return the results
      return { messageId, utteranceIds, unitIds };
    }
  }
}
