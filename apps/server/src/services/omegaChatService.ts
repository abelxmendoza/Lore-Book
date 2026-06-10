import { randomUUID } from 'crypto';

import { config } from '../config';
import { logger } from '../logger';
import { openai } from '../lib/openai';
import type { MemoryEntry, ResolvedMemoryEntry } from '../types';
import type { CurrentContext, SoulProfileContext } from '../types/currentContext';
import type { ChatContextExtension } from '../types/timelineInsight';
import { extractTags, shouldPersistMessage, isTrivialMessage } from '../utils/keywordDetector';

import {
  isBeliefChallengeAllowed,
  evaluateBelief,
  generateBeliefChallenge,
} from './conversationCentered/beliefChallenge';
import { conversationIngestionPipeline } from './conversationCentered/ingestionPipeline';
import { ingestionQueue } from './ingestion/ingestionQueue';
import { tokenBudgetService } from './chat/tokenBudgetService';
import { compactionService } from './chat/compactionService';
import { responseSafetyService } from './conversationCentered/responseSafetyService';
import { tangentTransitionDetector, type TransitionAnalysis, type EmotionalState } from './conversationCentered/tangentTransitionDetector';
import { entityAmbiguityService } from './entityAmbiguityService';
import { essenceProfileService } from './essenceProfileService';
import { essenceRefinementEngine } from './essenceRefinement';
import { epiphanySessionManager } from './epiphanyEngine/epiphanySessionManager';
import { intentDetectionService } from './intentDetectionService';
import { locationService } from './locationService';
import { memoirService } from './memoirService';
import { peoplePlacesService } from './peoplePlacesService';
import { perceptionService } from './perceptionService';
import { ragPacketCacheService } from './ragPacketCacheService';
import { buildRAGPacket as _buildRAGPacket } from './chat/ragBuilderService';
import { scoreContext, logScoringDecisions } from './chat/contextScoringService';
import {
  buildSystemPrompt as _buildSystemPrompt,
  buildEssenceContext as _buildEssenceContext,
  extractIdentityFromChatMessage as _extractIdentityFromChatMessage,
  buildIdentityCoreContext as _buildIdentityCoreContext,
  resolveCurrentFocusLine as _resolveCurrentFocusLine,
} from './chat/systemPromptBuilder';
import {
  checkContinuity as _checkContinuity,
  findConnections as _findConnections,
  generateCitations as _generateCitations,
  detectArchivistIntent as _detectArchivistIntent,
  mightBeRefinement as _mightBeRefinement,
  getRecentInsights as _getRecentInsights,
  getStrategicGuidance as _getStrategicGuidance,
} from './chat/chatAnalysisHelpers';
import {
  getOrCreateChatSession as _getOrCreateChatSession,
  detectMemorySuggestion as _detectMemorySuggestion,
  ingestMessageWithContext as _ingestMessageWithContext,
} from './chat/chatPersistenceService';
import { ChatPersonaRL } from './reinforcementLearning/chatPersonaRL';
import { supabaseAdmin } from './supabaseClient';
import { taskEngineService } from './taskEngineService';
import { timeEngine } from './timeEngine';
import { timelineManager } from './timelineManager';
import { extendChatContext } from './timelineInsight';

export type ChatSource = {
  type: 'entry' | 'chapter' | 'character' | 'task' | 'hqi' | 'fabric';
  id: string;
  title: string;
  snippet?: string;
  date?: string;
};

export type MemoryClaim = {
  claim_id: string;
  entity_name: string;
  claim_text: string;
  confidence: number;
  source: 'USER' | 'AI' | 'EXTERNAL';
  sentiment?: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL' | 'MIXED';
};

export type OmegaChatResponse = {
  answer: string;
  entryId?: string;
  characterIds?: string[];
  connections?: string[];
  continuityWarnings?: string[];
  timelineUpdates?: string[];
  strategicGuidance?: string;
  extractedDates?: Array<{ date: string; context: string }>;
  sources?: ChatSource[];
  citations?: Array<{ text: string; sourceId: string; sourceType: string }>;
  memories?: MemoryClaim[]; // Memory claims used in this response
  memorySuggestion?: MemorySuggestion; // Proactive memory suggestion
  mentionedEntities?: Array<{ id: string; name: string; type: 'character' | 'location' | 'organization' }>;
};

export type MemorySuggestion = {
  proposal_id: string;
  entity_name: string;
  claim_text: string;
  confidence: number;
  source_excerpt: string;
  reasoning?: string;
  risk_level: 'LOW' | 'MEDIUM' | 'HIGH';
};

export type StreamingChatResponse = {
  content?: string; // For non-streaming responses (like recall)
  stream: AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>;
  metadata: {
    entryId?: string;
    characterIds?: string[];
    sources?: ChatSource[];
    connections?: string[];
    continuityWarnings?: string[];
    timelineUpdates?: string[];
    memorySuggestion?: MemorySuggestion;
    disambiguationPrompt?: {
      type: 'ENTITY_CLARIFICATION';
      mention_text: string;
      options: Array<{
        label: string;
        subtitle?: string;
        entity_id: string;
        entity_type: string;
      }>;
      skippable: boolean;
      explanation: string;
    };
    // Memory Recall fields
    response_mode?: 'RECALL' | 'SILENCE' | string;
    recall_sources?: Array<{
      entry_id: string;
      timestamp: string;
      summary?: string;
      emotions?: string[];
      themes?: string[];
      entities?: string[];
    }>;
    recall_meta?: {
      persona?: string;
      recall_type?: string;
    };
    confidence_label?: string;
    disclaimer?: string;
    // Cognitive observability — Phase 2
    modeDecision?: {
      mode: string;
      confidence: number;
      reasoning: string;
    };
    ragStats?: {
      sourceCount: number;
      cacheHit: boolean;
      retrievalMs: number;
      contextItems: number;
    };
    activePersona?: string;
    sessionId?: string;
    messageId?: string;
    continuityAcknowledged?: {
      signals: string[];
      entityHints: string[];
      timelineSignificant: boolean;
    };
    mentionedEntities?: Array<{
      id: string;
      name: string;
      type: 'character' | 'location' | 'organization';
    }>;
    mode?: string;
    confidence?: number;
  };
};

class OmegaChatService {
  private personaRL: ChatPersonaRL;

  /**
   * Process passing thought (fire-and-forget, non-blocking)
   * Detects thought type, checks insecurity patterns, generates response
   */
  private async processPassingThought(
    userId: string,
    message: string,
    messageId: string
  ): Promise<void> {
    try {
      // Quick check: is this likely a passing thought?
      // Short messages (<200 chars) that aren't questions are candidates
      if (message.length > 200 || message.includes('?')) {
        return; // Probably not a passing thought
      }

      const { thoughtOrchestrationService } = await import('./thoughtOrchestration/thoughtOrchestrationService');
      
      // Process thought (target <300ms)
      const result = await thoughtOrchestrationService.processThought(
        userId,
        message,
        { messageId }
      );

      // If it's an insecurity with a response, we could optionally:
      // 1. Include response in chat metadata
      // 2. Show as a gentle interruption
      // 3. Store for later reference
      // For now, just process and store - UI can query separately
      
      logger.debug(
        { 
          userId, 
          thoughtType: result.classification.type,
          posture: result.response.posture,
          processingTime: result.processing_time_ms 
        },
        'Passing thought processed'
      );
    } catch (error) {
      // Fail silently - never interrupt chat flow
      logger.debug({ err: error }, 'Thought processing failed');
    }
  }

  constructor() {
    this.personaRL = new ChatPersonaRL();
  }

  /**
   * Build comprehensive RAG packet with ALL lore knowledge
   */
  private async buildRAGPacket(userId: string, message: string, currentContext?: CurrentContext) {
    return _buildRAGPacket(userId, message, currentContext, this.extractDatesAndTimes.bind(this));
  }

  /**
   * Extract dates and times from message using TimeEngine
   */
  async extractDatesAndTimes(message: string): Promise<Array<{ date: string; context: string; precision: string; confidence: number }>> {
    try {
      // First, use OpenAI to identify temporal references
      const completion = await openai.chat.completions.create({
        model: config.defaultModel,
        temperature: 0.1,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: 'Extract all dates, times, and temporal references from the text. Return JSON with array of {text: original text, context: brief description}. Include relative dates like "yesterday", "last week", "next month", and absolute dates.'
          },
          {
            role: 'user',
            content: message
          }
        ]
      });

      const parsed = JSON.parse(completion.choices[0]?.message?.content ?? '{}');
      const temporalRefs = parsed.dates || parsed.temporal_references || [];

      // Parse each reference using TimeEngine
      const extracted = temporalRefs.map((ref: any) => {
        const text = ref.text || ref.date || '';
        const temporalRef = timeEngine.parseTimestamp(text);
        
        return {
          date: temporalRef.timestamp.toISOString(),
          context: ref.context || text,
          precision: temporalRef.precision,
          confidence: temporalRef.confidence,
          originalText: temporalRef.originalText || text
        };
      });

      return extracted;
    } catch (error) {
      logger.error({ error }, 'Failed to extract dates');
      return [];
    }
  }

  /**
   * Check continuity issues
   */
  private async checkContinuity(
    userId: string,
    message: string,
    extractedDates: Array<{ date: string; context: string; precision?: string; confidence?: number }>,
    orchestratorSummary: any
  ): Promise<string[]> {
    return _checkContinuity(userId, message, extractedDates, orchestratorSummary);
  }

  /**
   * Find connections
   */
  private async findConnections(
    userId: string,
    message: string,
    orchestratorSummary: any,
    hqiResults: any[],
    sources: ChatSource[]
  ): Promise<string[]> {
    return _findConnections(userId, message, orchestratorSummary, hqiResults, sources);
  }

  /**
   * Generate inline citations from sources
   */
  private generateCitations(sources: ChatSource[], answer: string): Array<{ text: string; sourceId: string; sourceType: string }> {
    return _generateCitations(sources, answer);
  }

  /**
   * Build comprehensive system prompt with ALL lore knowledge
   */
  private buildSystemPrompt(
    orchestratorSummary: any,
    connections: string[],
    continuityWarnings: string[],
    strategicGuidance: string | null,
    sources: ChatSource[],
    loreData?: {
      allCharacters?: any[];
      allLocations?: any[];
      allChapters?: any[];
      timelineHierarchy?: any;
      allPeoplePlaces?: any[];
      essenceProfile?: any;
      identityCoreProfile?: any;
      characterAttributesMap?: Record<string, any[]>;
      characterMemoriesMap?: Record<string, Array<{ summary: string; createdAt: string }>>;
      romanticRelationships?: any[];
      corrections?: any[];
      deprecatedUnits?: any[];
      workoutEvents?: any[];
      recentBiometrics?: any[];
      topInterests?: any[];
      recentInterpretations?: any[];
      stableArcs?: any[];
      episodicEvents?: any[];
      socialCommunities?: any[];
      crystallizedKnowledge?: Array<{ knowledge_type: string; human_readable_claim: string; confidence: number }>;
      romanticContext?: any[];
    },
    entityContext?: { type: 'CHARACTER' | 'LOCATION' | 'PERCEPTION' | 'MEMORY' | 'ENTITY' | 'GOSSIP' | 'ROMANTIC_RELATIONSHIP'; id: string },
    entityAnalytics?: any,
    entityConfidence?: number | null,
    analyticsGate?: any,
    personaBlend?: { primary: string; secondary: string[]; weights: Record<string, number> },
    transitionAnalysis?: TransitionAnalysis | null,
    currentEmotionalState?: EmotionalState | null,
    currentFocusLine?: string,
    timelineInsight?: ChatContextExtension & { layer?: string },
    continuityIntent?: import('../../utils/continuityIntentDetection').ContinuityIntent | null,
    userId?: string
  ): string {
    return _buildSystemPrompt(orchestratorSummary, connections, continuityWarnings, strategicGuidance, sources, loreData, entityContext, entityAnalytics, entityConfidence, analyticsGate, personaBlend, transitionAnalysis, currentEmotionalState, currentFocusLine, timelineInsight, continuityIntent, userId);
  }

  /**
   * Build essence profile context string for system prompt
   */
  private buildEssenceContext(profile: any): string {
    return _buildEssenceContext(profile);
  }

  /**
   * Extract identity signals from chat message
   */
  private async extractIdentityFromChatMessage(
    userId: string,
    message: string,
    messageId?: string
  ): Promise<void> {
    return _extractIdentityFromChatMessage(userId, message, messageId);
  }

  /**
   * Build Identity Core context string for system prompt
   */
  private buildIdentityCoreContext(profile: any): string {
    return _buildIdentityCoreContext(profile);
  }

  /** Resolve "Current focus" line for system prompt from currentContext (thread name or timeline node title). */
  private async resolveCurrentFocusLine(
    userId: string,
    currentContext?: CurrentContext
  ): Promise<string | undefined> {
    return _resolveCurrentFocusLine(userId, currentContext);
  }

  /**
   * Chat with streaming support
   */
  async chatStream(
    userId: string,
    message: string,
    conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }> = [],
    entityContext?: { type: 'CHARACTER' | 'LOCATION' | 'PERCEPTION' | 'MEMORY' | 'ENTITY' | 'GOSSIP' | 'ROMANTIC_RELATIONSHIP'; id: string },
    currentContext?: CurrentContext,
    soulProfileContext?: SoulProfileContext,
    threadId?: string
  ): Promise<StreamingChatResponse> {
    // Use the UI thread as the session so messages, recall scoping, and
    // ingestion all stay attached to the thread the user is actually in.
    const sessionId = threadId ?? await this.getOrCreateChatSession(userId);

    // Phase 4.5: follow-up after recall (expand / correct)
    try {
      const { data: lastAssistant } = await supabaseAdmin
        .from('chat_messages')
        .select('content, metadata')
        .eq('user_id', userId)
        .eq('session_id', sessionId)
        .eq('role', 'assistant')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      const recallSources = lastAssistant?.metadata?.recall_sources;
      if (recallSources && Array.isArray(recallSources) && recallSources.length > 0) {
        const { handleFollowupAfterRecall } = await import('./narrativeRecall/narrativeRecallCorrection');
        const followUp = await handleFollowupAfterRecall({
          userId,
          userMessage: message,
          lastAssistantMessage: { content: lastAssistant.content ?? '', metadata: lastAssistant.metadata as { recall_sources?: Array<{ entry_id: string }> } },
        });
        if (followUp) {
          supabaseAdmin
            .from('chat_messages')
            .insert({
              user_id: userId,
              session_id: sessionId,
              role: 'assistant',
              content: followUp.content,
              metadata: { ...followUp.metadata, response_mode: followUp.response_mode },
            })
            .then(() => {})
            .catch(() => {});
          return {
            content: followUp.content,
            metadata: { ...followUp.metadata, response_mode: followUp.response_mode },
            stream: (async function* () {
              yield { choices: [{ delta: { content: followUp.content } }] };
            })(),
          };
        }
      }
    } catch (err) {
      logger.debug({ err, userId }, 'Phase 4.5 follow-up check failed, continuing');
    }

    // =====================================================
    // MODE ROUTER (NEW - FIRST GATE)
    // =====================================================
    // Captured here so it can be included in the SSE metadata for the cognition panel.
    let modeDecision: { mode: string; confidence: number; reasoning: string } | undefined;

    try {
      const { modeRouterService } = await import('./modeRouter/modeRouterService');
      const { modeHandlers } = await import('./modeRouter/modeHandlers');
      const { formatModeResponse } = await import('./modeRouter/responseFormatter');

      const routing = await modeRouterService.routeMessage(userId, message, conversationHistory);
      modeDecision = { mode: routing.mode, confidence: routing.confidence, reasoning: routing.reasoning ?? '' };
      
      // Route to appropriate handler if mode is known
      if (routing.mode !== 'UNKNOWN') {
        // For EXPERIENCE_INGESTION and ACTION_LOG, we need messageId - save message first
        let messageId: string | undefined;
        if (routing.mode === 'EXPERIENCE_INGESTION' || routing.mode === 'ACTION_LOG') {
          const { data: savedMessage, error: saveError } = await supabaseAdmin
            .from('chat_messages')
            .insert({
              user_id: userId,
              session_id: sessionId,
              role: 'user',
              content: message,
            })
            .select('id')
            .single();
          
          if (!saveError && savedMessage) {
            messageId = savedMessage.id;
          } else {
            logger.warn({ error: saveError, mode: routing.mode }, 'Failed to save message for ingestion/logging');
          }
        }
        
        // Handle mode
        const handlerResponse = await modeHandlers.handleMode(
          routing.mode,
          userId,
          message,
          { messageId, conversationHistory }
        );

        // Phase 4.5: persist assistant with recall_sources for MEMORY_RECALL
        if (routing.mode === 'MEMORY_RECALL' && (handlerResponse.metadata?.recall_sources as unknown[] | undefined)?.length) {
          supabaseAdmin
            .from('chat_messages')
            .insert({
              user_id: userId,
              session_id: sessionId,
              role: 'assistant',
              content: handlerResponse.content,
              metadata: { recall_sources: handlerResponse.metadata.recall_sources, response_mode: 'RECALL' },
            })
            .then(() => {})
            .catch(() => {});
        }

        // Format and return response
        return formatModeResponse(handlerResponse, routing.mode);
      }
    } catch (error) {
      logger.warn({ error, userId, message }, 'Mode routing failed, falling back to normal chat');
      // Fall through to existing chat flow
    }

    // ---- RECALL GATE: Check if this is a recall query (non-streaming, immediate response) ----
    try {
      const { isRecallQuery, shouldForceArchivist } = await import('./memoryRecall/recallDetector');
      if (isRecallQuery(message)) {
        const { memoryRecallEngine } = await import('./memoryRecall/memoryRecallEngine');
        const { formatRecallChatResponse } = await import('./memoryRecall/recallChatFormatter');
        
        const forcedPersona = shouldForceArchivist(message) ? 'ARCHIVIST' : undefined;
        const recallResult = await memoryRecallEngine.executeRecall({
          raw_text: message,
          user_id: userId,
          persona: forcedPersona || 'DEFAULT',
        });

        // Handle silence
        if (recallResult.silence) {
          const silenceContent = recallResult.silence.message;
          return {
            content: silenceContent,
            metadata: {
              response_mode: 'SILENCE',
              disclaimer: recallResult.silence.reason,
            } as any,
            stream: (async function* () {
              yield { choices: [{ delta: { content: silenceContent } }] };
            })(),
          };
        }

        // Format recall response
        const recallResponse = formatRecallChatResponse(recallResult, forcedPersona);

        // Phase 4.5: persist assistant with recall_sources for follow-up expand/correct
        supabaseAdmin
          .from('chat_messages')
          .insert({
            user_id: userId,
            session_id: sessionId,
            role: 'assistant',
            content: recallResponse.content,
            metadata: { recall_sources: recallResponse.recall_sources, response_mode: 'RECALL' },
          })
          .then(() => {})
          .catch(() => {});

        // Return recall response as immediate stream (single chunk)
        return {
          content: recallResponse.content,
          metadata: {
            ...recallResponse,
            response_mode: recallResponse.response_mode,
            recall_sources: recallResponse.recall_sources,
            recall_meta: recallResponse.recall_meta,
            confidence_label: recallResponse.confidence_label,
            disclaimer: recallResponse.disclaimer,
          },
          stream: (async function* () {
            yield { choices: [{ delta: { content: recallResponse.content } }] };
          })(),
        };
      }
    } catch (error) {
      logger.warn({ error, userId, message }, 'Failed to check recall query, falling back to normal chat');
      // Fall through to normal chat flow
    }

    // Build RAG packet with error handling
    let ragPacket;
    const ragStart = Date.now();
    const ragCacheHit = ragPacketCacheService.getCachedPacket(userId, message) !== null;
    try {
      ragPacket = await this.buildRAGPacket(userId, message, currentContext);
    } catch (error) {
      logger.error({ error }, 'Failed to build RAG packet, using minimal context');
      ragPacket = {
        orchestratorSummary: { timeline: { events: [], arcs: [] }, characters: [] },
        hqiResults: [],
        sources: [],
        extractedDates: [],
        relatedEntries: [],
        fabricNeighbors: [],
        allCharacters: [],
        allLocations: [],
        allChapters: [],
        timelineHierarchy: { eras: [], sagas: [], arcs: [] },
        allPeoplePlaces: []
      };
    }
    
    const { orchestratorSummary, hqiResults, sources, extractedDates } = ragPacket;

    // Load essence profile for context
    let essenceProfile: any = null;
    try {
      essenceProfile = await essenceProfileService.getProfile(userId);
    } catch (error) {
      logger.debug({ error }, 'Failed to load essence profile, continuing without');
    }

    // Load identity core profile for context (most recent)
    let identityCoreProfile: any = null;
    try {
      const { IdentityStorage } = await import('./identityCore/identityStorage');
      const storage = new IdentityStorage();
      const profiles = await storage.getProfiles(userId);
      identityCoreProfile = profiles[0] || null;
    } catch (error) {
      logger.debug({ error }, 'Failed to load identity core profile, continuing without');
    }

    // Build refinement context: use client-provided soulProfileContext when present
    const refinementContext = soulProfileContext
      ? {
          activePanel: 'SoulProfile' as const,
          lastReferencedInsightId: soulProfileContext.lastReferencedInsightId,
          lastSurfacedInsights: soulProfileContext.lastSurfacedInsights,
        }
      : {
          activePanel: 'SoulProfile' as const,
          lastSurfacedInsights: essenceProfile ? this.getRecentInsights(essenceProfile) : undefined,
        };

    let refinementClarificationRequest: string | undefined;
    if (this.mightBeRefinement(message)) {
      try {
        const result = await essenceRefinementEngine.handleChatMessage(
          userId,
          message,
          refinementContext,
          conversationHistory
        );
        refinementClarificationRequest = result.clarificationRequest;
        if (result.silentProfileUpdate) {
          logger.debug({ userId, action: result.refinementAction?.intent }, 'Essence profile refined via chat');
        }
      } catch (err) {
        logger.debug({ err, userId }, 'Essence refinement check failed, continuing');
      }
    } else {
      essenceRefinementEngine
        .handleChatMessage(userId, message, refinementContext, conversationHistory)
        .then((result) => {
          if (result.clarificationRequest) {
            logger.debug({ userId, clarification: result.clarificationRequest }, 'Refinement clarification needed');
          } else if (result.silentProfileUpdate) {
            logger.debug({ userId, action: result.refinementAction?.intent }, 'Essence profile refined via chat');
          }
        })
        .catch((err) => {
          logger.debug({ err, userId }, 'Essence refinement check failed, continuing');
        });
    }

    // Detect groups in conversation (fire-and-forget)
    import('./groupDetectionService').then(({ groupDetectionService }) => {
      const conversationTexts = conversationHistory.map(m => m.content);
      groupDetectionService.detectGroupsInMessage(userId, message, conversationTexts)
        .then(async (detectedGroups) => {
          if (detectedGroups.length > 0) {
            try {
              await groupDetectionService.processDetectedGroups(userId, detectedGroups);
              logger.info({ userId, groupCount: detectedGroups.length }, 'Detected and processed groups from conversation');
            } catch (error) {
              logger.debug({ error, userId }, 'Failed to process detected groups');
            }
          }
        })
        .catch(err => {
          logger.debug({ err }, 'Failed to detect groups from conversation');
        });
    }).catch(err => {
      logger.debug({ err }, 'Failed to import group detection service');
    });

    // Check continuity with error handling
    let continuityWarnings: string[] = [];
    try {
      continuityWarnings = await this.checkContinuity(userId, message, extractedDates, orchestratorSummary);
    } catch (error) {
      logger.warn({ error }, 'Failed to check continuity, continuing without warnings');
    }

    // Find connections with error handling
    let connections: string[] = [];
    try {
      connections = await this.findConnections(userId, message, orchestratorSummary, hqiResults, sources);
    } catch (error) {
      logger.warn({ error }, 'Failed to find connections, continuing without');
    }

    // Get strategic guidance with error handling
    let strategicGuidance: string | null = null;
    try {
      strategicGuidance = await this.getStrategicGuidance(userId, message);
    } catch (error) {
      logger.debug({ error }, 'Failed to get strategic guidance, continuing without');
    }

    // =====================================================
    // TANGENT & TRANSITION DETECTION (Grok-style flow tracking)
    // =====================================================
    let transitionAnalysis: TransitionAnalysis | null = null;
    let currentEmotionalState: EmotionalState | null = null;
    try {
      // Get previous emotional state from session context (if available)
      // For now, we'll detect it from conversation history
      const previousMessages = conversationHistory.slice(-5).map(m => ({
        role: m.role,
        content: m.content,
        timestamp: new Date(), // Approximate
      }));

      // Build conversation context
      const conversationContext = {
        messages: previousMessages,
        previousEmotionalState: undefined, // Could be stored in session
        previousIntent: undefined, // Could be stored in session
        previousTopic: undefined, // Could be extracted from previous messages
      };

      // Detect transitions
      transitionAnalysis = await tangentTransitionDetector.detectTransitions(
        message,
        conversationContext
      );

      // Extract current emotional state
      currentEmotionalState = await tangentTransitionDetector.extractEmotionalState(message);

      if (transitionAnalysis.shouldAcknowledge) {
        logger.debug(
          {
            userId,
            transitionType: transitionAnalysis.transitionType,
            topicShift: transitionAnalysis.topicShift.detected,
            emotionalTransition: transitionAnalysis.emotionalTransition.detected,
          },
          'Transition detected in conversation'
        );
      }
    } catch (error) {
      logger.debug({ error }, 'Transition detection failed, continuing without');
    }

    // =====================================================
    // PERSONA DETECTION (Archivist mode + manual @mention override)
    // =====================================================
    const isArchivistQuery = this.detectArchivistIntent(message);

    // Allow users to pin a persona by prefixing with @name, e.g. "@therapist how am I doing?"
    // Strip the prefix so the underlying message is clean before passing to the LLM.
    const PERSONA_MENTION_RE = /^@(therapist|strategist|gossip_buddy|archivist|soul_capturer|biography_writer)\s*/i;
    const mentionMatch = message.match(PERSONA_MENTION_RE);
    const requestedPersona = mentionMatch ? mentionMatch[1].toLowerCase() : null;
    const cleanMessage = requestedPersona ? message.replace(PERSONA_MENTION_RE, '').trim() : message;

    let activePersona = isArchivistQuery || requestedPersona === 'archivist' ? 'archivist' : 'therapist';

    // =====================================================
    // INLINE ENTITY AMBIGUITY DETECTION (IADE)
    // =====================================================
    let disambiguationPrompt: any = null;
    try {
      // Detect intent (for skipping venting/support requests)
      const detectedIntent = intentDetectionService.detectUserIntent(message);
      
      // Extract entity mentions
      const mentions = entityAmbiguityService.extractEntityMentions(message);
      
      if (mentions.length > 0) {
        // Build context from recent messages
        const recentMessages = conversationHistory.slice(-5).map(m => m.content);
        const context = {
          recent_entities: [], // TODO: Extract from recent messages
          recent_messages: recentMessages,
          session_id: '', // TODO: Get from session if available
        };

        // Detect ambiguities
        const ambiguities = await entityAmbiguityService.detectEntityAmbiguity(
          userId,
          mentions,
          context
        );

        // If we found an ambiguity and should prompt, build the prompt
        if (ambiguities.length > 0) {
          const firstAmbiguity = ambiguities[0];
          
          // Check if we should prompt (skip for venting)
          if (
            entityAmbiguityService.shouldPromptDisambiguation(
              firstAmbiguity,
              detectedIntent === 'VENTING' ? 'VENTING' : 'QUESTION' // Map to UserIntent
            )
          ) {
            disambiguationPrompt = entityAmbiguityService.buildDisambiguationPrompt(firstAmbiguity);
          }
        }
      }
    } catch (error) {
      // Fail silently - never interrupt chat flow
      logger.debug({ error, userId }, 'Entity ambiguity detection failed, continuing without');
    }

    // Entity analytics (chatStream does not fetch yet; pass null so buildSystemPrompt skips entity block)
    let entityAnalytics: any = null;
    let entityConfidence: number | null = null;
    let analyticsGate: any = null;

    // RL: Select optimal persona blend
    let personaBlend;
    let rlContext;
    try {
      // Use the cleaned message (@ prefix stripped) so RL context features are accurate
      personaBlend = await this.personaRL.selectPersonaBlend(
        userId,
        cleanMessage,
        conversationHistory
      );
      // If user explicitly requested a persona, override RL selection entirely
      if (requestedPersona) {
        personaBlend = { primary: requestedPersona, secondary: [], weights: { [requestedPersona]: 1.0 } };
      }
      // Archivist intent overrides everything; otherwise surface the actual selected persona
      if (!isArchivistQuery) {
        activePersona = personaBlend.primary;
      }
      // Build context for saving (needed for reward updates)
      rlContext = await this.personaRL.buildContext(userId, cleanMessage, conversationHistory);
    } catch (error) {
      logger.warn({ error }, 'RL: Failed to select persona, using default');
      personaBlend = requestedPersona
        ? { primary: requestedPersona, secondary: [], weights: { [requestedPersona]: 1.0 } }
        : { primary: 'therapist', secondary: [], weights: { therapist: 1.0 } };
      if (!isArchivistQuery) activePersona = personaBlend.primary;
      rlContext = { type: 'chat_persona', features: {} };
    }

    // RESPONSE SAFETY: Analyze message for stress signals and generate safety guidance
    let safetyContext;
    try {
      safetyContext = responseSafetyService.analyzeMessage(message);
      if (safetyContext.stressSignals.length > 0) {
        logger.debug(
          {
            userId,
            stressSignals: safetyContext.stressSignals.length,
            hasShame: safetyContext.hasShameLanguage,
            hasIsolation: safetyContext.hasIsolationLanguage,
          },
          'Response safety analysis complete'
        );
      }
    } catch (error) {
      logger.debug({ error }, 'Response safety analysis failed, continuing without');
      safetyContext = null;
    }

    // Resolve current focus line for prompt conditioning (thread name or timeline node title)
    const currentFocusLine = await this.resolveCurrentFocusLine(userId, currentContext);

    // Timeline context insight (hierarchy gaps + parallels) when focused on era/saga/arc
    let timelineInsight: (ChatContextExtension & { layer?: string }) | undefined;
    if (
      currentContext?.kind === 'timeline' &&
      currentContext.timelineNodeId &&
      ['era', 'saga', 'arc'].includes(currentContext.timelineLayer ?? '')
    ) {
      try {
        const node = await timelineManager.getNode(userId, currentContext.timelineLayer!, currentContext.timelineNodeId) as { id: string; user_id: string; start_date: string; end_date?: string | null };
        const ext = await extendChatContext(userId, {
          id: node.id,
          layer: currentContext.timelineLayer as 'era' | 'saga' | 'arc',
          user_id: node.user_id,
          start_date: node.start_date,
          end_date: node.end_date ?? null,
        });
        timelineInsight = { ...ext, layer: currentContext.timelineLayer ?? undefined };
      } catch (err) {
        logger.debug({ err, userId, nodeId: currentContext.timelineNodeId }, 'Timeline insight failed, continuing without');
      }
    }

    // Detect continuity intent before building system prompt
    const { detectContinuityIntent } = await import('../utils/continuityIntentDetection');
    const continuityIntent = detectContinuityIntent(message);
    if (continuityIntent.detected) {
      logger.debug({ userId, signals: continuityIntent.signals, entityHints: continuityIntent.entityHints }, 'Continuity intent detected');
    }

    // Return-to-thread orientation: detect idle gap and inject grounding context
    let returnToThreadContext = '';
    if (currentContext?.threadId) {
      try {
        const { data: threadRow } = await supabaseAdmin
          .from('conversation_sessions')
          .select('updated_at, title, metadata')
          .eq('id', currentContext.threadId)
          .eq('user_id', userId)
          .maybeSingle();
        if (threadRow?.updated_at) {
          const idleMs = Date.now() - new Date(threadRow.updated_at).getTime();
          const idleHours = idleMs / 3_600_000;
          if (idleHours >= 24) {
            const idleDays = Math.floor(idleHours / 24);
            const timeLabel = idleDays === 1 ? '1 day' : `${idleDays} days`;
            const subtitle = (threadRow.metadata as any)?.subtitle as string | undefined;
            const entities: string[] = (threadRow.metadata as any)?.dominantEntities ?? [];
            const entityPhrase = entities.length > 0 ? ` The recurring context included: ${entities.slice(0, 3).join(', ')}.` : '';
            const subtitlePhrase = subtitle ? ` The last topic was: ${subtitle}.` : '';
            returnToThreadContext = `\n\n**THREAD RESUMED AFTER ${timeLabel.toUpperCase()} GAP**: This conversation was last active ${timeLabel} ago.${subtitlePhrase}${entityPhrase} Orient naturally to the resumed context — no dramatic welcome, just quiet continuity.`;
          }
        }
      } catch (err) {
        logger.debug({ err, threadId: currentContext.threadId }, 'Return-to-thread context lookup failed, continuing without');
      }
    }

    // ── Context Selection Layer ───────────────────────────────────────────────
    // Score and filter loreData before prompt assembly.
    // Conservative first pass: 30–40% token reduction target.
    // Falls back to the raw loreData if the scorer throws.
    const rawLoreData = {
      allCharacters: ragPacket.allCharacters,
      allLocations: ragPacket.allLocations,
      allChapters: ragPacket.allChapters,
      timelineHierarchy: ragPacket.timelineHierarchy,
      allPeoplePlaces: ragPacket.allPeoplePlaces,
      essenceProfile: essenceProfile,
      identityCoreProfile: identityCoreProfile,
      characterAttributesMap: ragPacket.characterAttributesMap,
      characterMemoriesMap: (ragPacket as any).characterMemoriesMap,
      romanticRelationships: ragPacket.romanticRelationships,
      romanticContext: ragPacket.romanticContext ?? [],
      corrections: ragPacket.corrections,
      deprecatedUnits: ragPacket.deprecatedUnits,
      workoutEvents: ragPacket.workoutEvents,
      recentBiometrics: ragPacket.recentBiometrics,
      topInterests: ragPacket.topInterests,
      recentInterpretations: ragPacket.recentInterpretations,
      stableArcs: ragPacket.stableArcs,
      episodicEvents: ragPacket.episodicEvents,
      socialCommunities: ragPacket.socialCommunities,
      crystallizedKnowledge: ragPacket.crystallizedKnowledge ?? [],
      entityArcNarrativeBlock: ragPacket.entityArcNarrativeBlock ?? null,
    };

    let scoredLoreData: Record<string, unknown> = rawLoreData;
    try {
      const scoringResult = scoreContext(
        rawLoreData as Record<string, unknown>,
        message,
        ragPacket.allCharacters ?? [],
        ragPacket.allLocations ?? []
      );
      logScoringDecisions(scoringResult, userId);
      scoredLoreData = scoringResult.filteredLoreData;
    } catch (scoringErr) {
      logger.warn({ err: scoringErr, userId }, '[ContextScoring] Scorer failed — falling back to raw loreData');
    }
    // ─────────────────────────────────────────────────────────────────────────

    // Build system prompt with comprehensive lore and essence profile
    let systemPrompt = this.buildSystemPrompt(
      orchestratorSummary,
      connections,
      continuityWarnings,
      strategicGuidance,
      sources,
      scoredLoreData as any,
      entityContext,
      entityAnalytics,
      entityConfidence,
      analyticsGate,
      personaBlend,
      undefined,
      undefined,
      currentFocusLine,
      timelineInsight,
      continuityIntent,
      userId
    );

    if (returnToThreadContext) {
      systemPrompt += returnToThreadContext;
    }

    if (refinementClarificationRequest) {
      systemPrompt += `\n\n**REFINEMENT CLARIFICATION**: The user may be correcting something in their Soul Profile. If your reply is about that, first ask them: "${refinementClarificationRequest}"`;
    }

    // NEW: Enforce Archivist persona if detected
    if (activePersona === 'archivist') {
      systemPrompt += `

**ACTIVE PERSONA: ARCHIVIST**
- You are in READ-ONLY mode
- Retrieve facts only, no advice
- Surface uncertainty explicitly
- If confidence is low, say so: "This is tentative due to limited clarity"
- Format responses as: "According to your entries..." or "I found..."
- Do NOT provide suggestions, predictions, or interpretations beyond evidence
`;
    }

    // RESPONSE SAFETY: Inject safety guidance if stress signals detected
    if (safetyContext && safetyContext.stressSignals.length > 0) {
      systemPrompt += `\n\n${safetyContext.safetyGuidance}\n`;
      
      // Adjust persona blend if needed (reduce strategist weight if advice should be avoided)
      if (safetyContext.shouldAvoidAdvice && personaBlend) {
        // Reduce strategist weight, increase therapist weight
        if (personaBlend.weights.strategist && personaBlend.weights.strategist > 0.3) {
          const strategistWeight = personaBlend.weights.strategist;
          personaBlend.weights.strategist = Math.max(0.1, strategistWeight * 0.5);
          personaBlend.weights.therapist = (personaBlend.weights.therapist || 0) + strategistWeight * 0.5;
        }
      }
    }

    // BELIEF CHALLENGE: Check if we can safely challenge a belief
    // Only if safety context allows and user is not in vulnerable state
    if (safetyContext && !safetyContext.hasShame && !safetyContext.hasIsolationLanguage && !safetyContext.hasDependencyFear) {
      try {
        // Get recent perceptions (last 30 days, limit 5)
        const recentPerceptions = await perceptionService.getPerceptionEntries(userId, {
          limit: 5,
          retracted: false,
        });

        // Filter to perceptions older than 7 days
        const eligiblePerceptions = recentPerceptions.filter(p => {
          const ageDays = (Date.now() - new Date(p.created_at).getTime()) / (1000 * 60 * 60 * 24);
          return ageDays >= 7 && p.confidence_level >= 0.3;
        });

        // Check each perception for eligibility
        for (const perception of eligiblePerceptions.slice(0, 2)) { // Limit to 2 challenges max
          const eligibility = isBeliefChallengeAllowed(
            {
              id: perception.id,
              confidence_level: perception.confidence_level,
              created_at: perception.created_at,
            },
            {
              isIsolated: safetyContext.hasIsolationLanguage,
              hasShame: safetyContext.hasShameLanguage,
              hasDependencyFear: safetyContext.hasDependencyFear,
              hasRelationalStrain: safetyContext.hasRelationalStrain,
            }
          );

          if (eligibility.eligible) {
            // Evaluate the belief
            const evaluation = await evaluateBelief(userId, perception.id);

            // Only challenge if there's evidence it might need exploration
            // (repeated multiple times, or has negative reward correlation, or has contradictions)
            if (
              evaluation.repetitionCount > 2 ||
              evaluation.rewardCorrelation < -0.3 ||
              evaluation.contradictingEvidenceCount > 0
            ) {
              // Generate challenge (use 'curious' style for first challenge, 'gentle' for others)
              const challenge = generateBeliefChallenge(
                {
                  id: perception.id,
                  content: perception.content,
                  subject_alias: perception.subject_alias,
                },
                'curious',
                evaluation
              );

              // Inject challenge into system prompt
              systemPrompt += `\n\n**OPTIONAL BELIEF EXPLORATION** (only if conversation naturally flows this way):\n${challenge.challengePrompt}\n\nNote: This is optional. Only bring this up if the conversation naturally allows for gentle exploration. Do not force it.`;

              logger.debug(
                { perceptionId: perception.id, style: challenge.style },
                'Generated belief challenge'
              );

              // Only challenge one belief per conversation to avoid overwhelming
              break;
            }
          }
        }
      } catch (error) {
        // Fail silently - belief challenges are optional
        logger.debug({ error }, 'Belief challenge check failed, continuing without');
      }
    }

    // If the user is answering a clarifying question (last assistant message was one), nudge the model
    const lastAssistant = [...conversationHistory].reverse().find(m => m.role === 'assistant');
    if (lastAssistant && lastAssistant.content) {
      const c = lastAssistant.content.toLowerCase();
      const looksLikeClarify = c.length < 300 && (c.endsWith('?') || c.includes('?')) &&
        (/\b(what do you mean|do you mean|are you talking about)\b/i.test(c));
      if (looksLikeClarify) {
        systemPrompt += `

**FOLLOW-UP TO CLARIFYING QUESTION**: The user is answering your previous clarifying question about something they did or achieved. Acknowledge what they said (including any milestone or progress) and respond helpfully to any frustration or follow-up they have (e.g. what "the way I want" or similar looks like, or how you can help).`;
      }
    }

    // Apply server-side token budget — prevents silent context window overflow.
    // ragContextText is a rough serialization of the context injected into systemPrompt.
    const systemTokens = tokenBudgetService.estimateSystemPromptTokens(systemPrompt);
    const ragTokens    = tokenBudgetService.estimateRagTokens(systemPrompt);
    const { truncatedHistory, compactionNeeded, droppedTurns } =
      tokenBudgetService.buildBudgetedHistory(
        conversationHistory,
        config.defaultModel,
        ragTokens,
        systemTokens
      );

    // Trigger async compaction for dropped turns (non-blocking)
    if (compactionNeeded && droppedTurns > 0) {
      const dropped = conversationHistory.slice(0, droppedTurns);
      setImmediate(() => {
        compactionService.compact(userId, sessionId, dropped, 'ROLLING').catch(err => {
          logger.warn({ err, userId, sessionId }, 'Rolling compaction failed (non-critical)');
        });
      });
    }

    // Prepare messages with session memory block prepended if compactions exist
    const sessionCompactions = await compactionService.getSessionCompactions(userId, sessionId);
    const sessionMemoryBlock = compactionService.buildSessionMemoryBlock(sessionCompactions);
    const finalSystemPrompt  = sessionMemoryBlock
      ? `${systemPrompt}\n\n${sessionMemoryBlock}`
      : systemPrompt;

    const messages = [
      { role: 'system' as const, content: finalSystemPrompt },
      ...truncatedHistory,
      { role: 'user' as const, content: message }
    ];

    // Create streaming response
    const stream = await openai.chat.completions.create({
      model: config.defaultModel,
      temperature: 0.7,
      stream: true,
      messages
    });

    // Save chat message and ingest through pipeline (all non-trivial messages)
    let entryId: string | undefined;
    const timelineUpdates: string[] = [];

    // Only exclude truly trivial messages (hi, ok, thanks, etc.)
    if (!isTrivialMessage(message)) {
      // sessionId from the top of chatStream — thread-aware when threadId was provided

      // Save message to chat_messages table
      const { data: savedMessage, error: saveError } = await supabaseAdmin
        .from('chat_messages')
        .insert({
          user_id: userId,
          session_id: sessionId,
          role: 'user',
          content: message,
          metadata: {
            extractedDates,
            connections: connections.length,
            hasContinuityWarnings: continuityWarnings.length > 0,
            sourcesUsed: sources.length,
          },
        })
        .select('id')
        .single();

      if (saveError || !savedMessage || !savedMessage.id) {
        logger.warn({ error: saveError, userId }, 'Failed to save chat message');
      } else {
        // Set entryId for tracking and RL
        entryId = savedMessage.id;

        // Enqueue ingestion — fully off the chat critical path.
        // Skip when entityContext is set: ingestMessageWithContext() fires separately
        // and handles the full pipeline for entity-scoped sessions. Enqueueing here
        // too would double-ingest the same content → duplicate entities and events.
        if (!entityContext) {
          ingestionQueue.enqueue({
            userId,
            chatMessageId: savedMessage.id,
            sessionId,
            conversationHistory,
          }, 'NORMAL');
        }

        // Fire-and-forget: retroactive pattern detection across journal/chat
        epiphanySessionManager.feedEntry(userId, {
          id: savedMessage.id,
          content: message,
          date: new Date().toISOString(),
        }).catch(err => logger.warn({ err, userId }, 'epiphany feed failed'));

        // Pipeline status intentionally not surfaced to user — trust > transparency of ops
      }

      // Auto-update memoir (fire and forget)
      memoirService.autoUpdateMemoir(userId).catch(err => {
        logger.warn({ err }, 'Failed to auto-update memoir after chat');
      });

      // Auto-update main lifestory biography (fire and forget)
      const { mainLifestoryService } = await import('./mainLifestoryService');
      mainLifestoryService.updateAfterChatEntry(userId).catch(err => {
        logger.warn({ err }, 'Failed to update main lifestory after chat');
      });

      // Extract essence insights after conversation (fire and forget)
      const fullHistory = [...conversationHistory, { role: 'user' as const, content: message }];
      essenceProfileService.extractEssence(userId, fullHistory, ragPacket.relatedEntries)
        .then(insights => {
          if (Object.keys(insights).length > 0) {
            return essenceProfileService.updateProfile(userId, insights);
          }
        })
        .catch(err => {
          logger.debug({ err }, 'Failed to extract essence insights');
        });
    }

    // Extract characters (check both names and aliases/nicknames)
    const characters = await peoplePlacesService.listEntities(userId);
    const messageLower = message.toLowerCase();
    const mentionedCharacters = characters.filter(char => {
      const nameMatch = messageLower.includes(char.name.toLowerCase());
      // Also check corrected names (nicknames/aliases)
      const aliasMatch = char.corrected_names && Array.isArray(char.corrected_names) 
        ? char.corrected_names.some((alias: string) => messageLower.includes(alias.toLowerCase()))
        : false;
      return nameMatch || aliasMatch;
    });
    const characterIds = mentionedCharacters.map(c => c.id);
    const mentionedEntities: Array<{ id: string; name: string; type: 'character' | 'location' | 'organization' }> =
      mentionedCharacters.map(c => ({
        id: c.id,
        name: c.name,
        type: c.type === 'place' ? 'location' as const
            : (c.type === 'organization' || c.type === 'platform') ? 'organization' as const
            : 'character' as const,
      }));

    // Detect unnamed characters and generate nicknames (fire and forget)
    const { characterNicknameService } = await import('./characterNicknameService');
    characterNicknameService.extractNicknamesFromConversation(userId, message, conversationHistory)
      .then(async (result) => {
        // Create characters with generated nicknames
        for (const newChar of result.newCharacters) {
          try {
            const created = await characterNicknameService.createCharacterWithNickname(userId, newChar);
            if (created) {
              logger.info({ userId, characterId: created.id, nickname: created.name }, 'Created character with auto-generated nickname');
            }
          } catch (error) {
            logger.debug({ error, character: newChar }, 'Failed to create character with nickname');
          }
        }

        // Add nicknames to existing characters
        for (const mapping of result.nicknameMappings) {
          try {
            await characterNicknameService.addNicknameToCharacter(userId, mapping.characterId, mapping.nickname);
          } catch (error) {
            logger.debug({ error, mapping }, 'Failed to add nickname to character');
          }
        }
      })
      .catch(err => {
        logger.debug({ err }, 'Failed to extract nicknames from conversation');
      });

    // Detect unnamed locations and generate nicknames (fire and forget)
    const { locationNicknameService } = await import('./locationNicknameService');
    locationNicknameService.detectAndGenerateNicknames(userId, message, conversationHistory)
      .then(async (locations) => {
        for (const loc of locations) {
          try {
            const created = await locationNicknameService.createLocationWithNickname(userId, loc);
            if (created) {
              logger.info({ userId, locationId: created.id, nickname: created.name }, 'Created location with auto-generated nickname');
            }
          } catch (error) {
            logger.debug({ error, location: loc }, 'Failed to create location with nickname');
          }
        }
      })
      .catch(err => {
        logger.debug({ err }, 'Failed to extract location nicknames from conversation');
      });

    // Detect memory suggestion (proactive memory capture)
    let memorySuggestion: MemorySuggestion | null = null;
    try {
      memorySuggestion = await this.detectMemorySuggestion(userId, message);
    } catch (error) {
      logger.debug({ error }, 'Failed to detect memory suggestion, continuing');
    }

    // Ingest message with entity context (fire-and-forget)
    if (entityContext) {
      this.ingestMessageWithContext(userId, message, conversationHistory, entityContext).catch(err => {
        logger.warn({ err, userId, entityContext }, 'Failed to ingest message with entity context (non-blocking)');
      });
    }

    // RL: Save context for later reward updates (generate message ID if entryId not available)
    const messageId = entryId || randomUUID();
    // sessionId is already declared at the top of this method (line ~1361)
    if (rlContext && personaBlend) {
      this.personaRL.saveChatContext(
        userId,
        messageId,
        sessionId,
        rlContext,
        personaBlend.primary
      ).catch(err => {
        logger.debug({ err }, 'RL: Failed to save chat context (non-critical)');
      });

      // AUTOMATIC: Record implicit rewards after a delay (when user likely read response)
      // This happens automatically without user action
      setTimeout(() => {
        this.personaRL.recordImplicitRewards(userId, sessionId, {
          messageId,
          actionType: 'follow_up', // Will be updated when user actually sends follow-up
          timeSpent: 5000, // Assume user spent at least 5 seconds reading
        }).catch(err => {
          logger.debug({ err }, 'RL: Failed to record automatic implicit rewards (non-critical)');
        });
      }, 10000); // After 10 seconds, assume user has read the response
    }

    return {
      stream,
      metadata: {
        entryId,
        messageId, // Include messageId for feedback
        sessionId, // Include sessionId for action tracking
        characterIds,
        mentionedEntities: mentionedEntities.length > 0 ? mentionedEntities : undefined,
        sources: sources.slice(0, 10),
        connections,
        continuityWarnings,
        timelineUpdates,
        memorySuggestion: memorySuggestion || undefined,
        disambiguationPrompt: disambiguationPrompt || undefined,
        activePersona: activePersona || undefined,
        modeDecision: modeDecision || undefined,
        continuityAcknowledged: continuityIntent?.detected ? {
          signals: continuityIntent.signals,
          entityHints: continuityIntent.entityHints,
          timelineSignificant: continuityIntent.timelineSignificant,
        } : undefined,
        ragStats: {
          sourceCount: sources.length,
          cacheHit: ragCacheHit,
          retrievalMs: Date.now() - ragStart,
          contextItems: hqiResults.length + (sources?.length ?? 0),
        }
      }
    };
  }

  /**
   * Detect if user query requires Archivist persona (factual recall only)
   */
  private detectArchivistIntent(message: string): boolean {
    return _detectArchivistIntent(message);
  }

  /**
   * Non-streaming chat (fallback)
   */
  async chat(
    userId: string,
    message: string,
    conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }> = [],
    entityContext?: { type: 'CHARACTER' | 'LOCATION' | 'PERCEPTION' | 'MEMORY' | 'ENTITY' | 'GOSSIP' | 'ROMANTIC_RELATIONSHIP'; id: string },
    currentContext?: CurrentContext,
    soulProfileContext?: SoulProfileContext,
    threadId?: string
  ): Promise<OmegaChatResponse> {
    // Build RAG packet
    const ragPacket = await this.buildRAGPacket(userId, message, currentContext);
    const { orchestratorSummary, hqiResults, sources, extractedDates } = ragPacket;

    // Load essence profile for context
    let essenceProfile: any = null;
    try {
      essenceProfile = await essenceProfileService.getProfile(userId);
    } catch (error) {
      logger.debug({ error }, 'Failed to load essence profile, continuing without');
    }

    // Load identity core profile for context (most recent)
    let identityCoreProfile: any = null;
    try {
      const { IdentityStorage } = await import('./identityCore/identityStorage');
      const storage = new IdentityStorage();
      const profiles = await storage.getProfiles(userId);
      identityCoreProfile = profiles[0] || null;
    } catch (error) {
      logger.debug({ error }, 'Failed to load identity core profile, continuing without');
    }

    // Soul Profile refinement: build context, run gate, optionally await and capture clarification
    const refinementContextChat = soulProfileContext
      ? {
          activePanel: 'SoulProfile' as const,
          lastReferencedInsightId: soulProfileContext.lastReferencedInsightId,
          lastSurfacedInsights: soulProfileContext.lastSurfacedInsights,
        }
      : {
          activePanel: 'SoulProfile' as const,
          lastSurfacedInsights: essenceProfile ? this.getRecentInsights(essenceProfile) : undefined,
        };
    let refinementClarificationChat: string | undefined;
    if (this.mightBeRefinement(message)) {
      try {
        const result = await essenceRefinementEngine.handleChatMessage(
          userId,
          message,
          refinementContextChat,
          conversationHistory
        );
        refinementClarificationChat = result.clarificationRequest;
        if (result.silentProfileUpdate) {
          logger.debug({ userId, action: result.refinementAction?.intent }, 'Essence profile refined via chat');
        }
      } catch (err) {
        logger.debug({ err, userId }, 'Essence refinement check failed, continuing');
      }
    } else {
      essenceRefinementEngine
        .handleChatMessage(userId, message, refinementContextChat, conversationHistory)
        .then((result) => {
          if (result.clarificationRequest) {
            logger.debug({ userId, clarification: result.clarificationRequest }, 'Refinement clarification needed');
          } else if (result.silentProfileUpdate) {
            logger.debug({ userId, action: result.refinementAction?.intent }, 'Essence profile refined via chat');
          }
        })
        .catch((err) => {
          logger.debug({ err, userId }, 'Essence refinement check failed, continuing');
        });
    }

    // Check continuity
    const continuityWarnings = await this.checkContinuity(userId, message, extractedDates, orchestratorSummary);

    // Find connections
    const connections = await this.findConnections(userId, message, orchestratorSummary, hqiResults, sources);

    // Get strategic guidance
    const strategicGuidance = await this.getStrategicGuidance(userId, message);

    // Load entity analytics and confidence if entityContext is provided
    let entityAnalytics: any = null;
    let entityConfidence: number | null = null;
    let analyticsGate: any = null;
    
    if (entityContext) {
      try {
        // Get confidence gate first
        const { entityConfidenceService } = await import('./entityConfidenceService');
        analyticsGate = await entityConfidenceService.shouldSurfaceAnalytics(
          userId,
          entityContext.id,
          entityContext.type === 'ENTITY' ? 'ORG' : entityContext.type
        );
        
        entityConfidence = await entityConfidenceService['getCurrentEntityConfidence'](
          userId,
          entityContext.id,
          entityContext.type === 'ENTITY' ? 'ORG' : entityContext.type
        );

        if (entityContext.type === 'CHARACTER') {
          const { data: character } = await supabaseAdmin
            .from('characters')
            .select('*')
            .eq('id', entityContext.id)
            .eq('user_id', userId)
            .single();
          if (character) {
            const { characterAnalyticsService } = await import('./characterAnalyticsService');
            entityAnalytics = await characterAnalyticsService.calculateAnalytics(userId, entityContext.id, character);
            
            // Soften language if confidence is low
            if (entityConfidence !== null && entityConfidence < 0.5) {
              entityAnalytics = entityConfidenceService['softenAnalyticsLanguage'](entityAnalytics, entityConfidence);
            }
          }
        } else if (entityContext.type === 'LOCATION') {
          const location = await locationService.getLocationProfile(userId, entityContext.id);
          if (location) {
            const { locationAnalyticsService } = await import('./locationAnalyticsService');
            entityAnalytics = await locationAnalyticsService.calculateAnalytics(userId, entityContext.id, location);
            
            // Soften language if confidence is low
            if (entityConfidence !== null && entityConfidence < 0.5) {
              entityAnalytics = entityConfidenceService['softenAnalyticsLanguage'](entityAnalytics, entityConfidence);
            }
          }
        } else if (entityContext.type === 'ENTITY') {
          const { organizationService } = await import('./organizationService');
          const org = await organizationService.getOrganization(userId, entityContext.id);
          if (org) {
            const { groupAnalyticsService } = await import('./groupAnalyticsService');
            entityAnalytics = await groupAnalyticsService.calculateAnalytics(userId, entityContext.id, org);
            
            // Soften language if confidence is low
            if (entityConfidence !== null && entityConfidence < 0.5) {
              entityAnalytics = entityConfidenceService['softenAnalyticsLanguage'](entityAnalytics, entityConfidence);
            }
          }
        } else if (entityContext.type === 'ROMANTIC_RELATIONSHIP') {
          // Load romantic relationship data
          const { data: relationship } = await supabaseAdmin
            .from('romantic_relationships')
            .select('*')
            .eq('id', entityContext.id)
            .eq('user_id', userId)
            .single();
          
          if (relationship) {
            // Load person name
            let personName = 'Unknown';
            if (relationship.person_type === 'character') {
              const { data: character } = await supabaseAdmin
                .from('characters')
                .select('name')
                .eq('id', relationship.person_id)
                .single();
              personName = character?.name || 'Unknown';
            }
            
            // Load analytics
            const { romanticRelationshipAnalytics } = await import('./conversationCentered/romanticRelationshipAnalytics');
            const analytics = await romanticRelationshipAnalytics.generateAnalytics(userId, entityContext.id);
            
            entityAnalytics = {
              relationship,
              personName,
              analytics: analytics || {
                pros: relationship.pros || [],
                cons: relationship.cons || [],
                redFlags: relationship.red_flags || [],
                greenFlags: relationship.green_flags || [],
                strengths: relationship.strengths || [],
                weaknesses: relationship.weaknesses || [],
                affectionScore: relationship.affection_score || 0.5,
                compatibilityScore: relationship.compatibility_score || 0.5,
                healthScore: relationship.relationship_health || 0.5,
                intensityScore: relationship.emotional_intensity || 0.5,
              }
            };
          }
        }
      } catch (error) {
        logger.debug({ error, entityContext }, 'Failed to load entity analytics, continuing without');
      }
    }

    // RL: Select optimal persona blend
    let personaBlend;
    let rlContext;
    try {
      personaBlend = await this.personaRL.selectPersonaBlend(
        userId,
        message,
        conversationHistory
      );
      // Build context for saving (needed for reward updates)
      rlContext = await this.personaRL.buildContext(userId, message, conversationHistory);
    } catch (error) {
      logger.warn({ error }, 'RL: Failed to select persona, using default');
      personaBlend = {
        primary: 'therapist',
        secondary: [],
        weights: { therapist: 1.0 },
      };
      rlContext = {
        type: 'chat_persona',
        features: {},
      };
    }

    // RESPONSE SAFETY: Analyze message for stress signals and generate safety guidance
    let safetyContext;
    try {
      safetyContext = responseSafetyService.analyzeMessage(message);
      if (safetyContext.stressSignals.length > 0) {
        logger.debug(
          {
            userId,
            stressSignals: safetyContext.stressSignals.length,
            hasShame: safetyContext.hasShameLanguage,
            hasIsolation: safetyContext.hasIsolationLanguage,
          },
          'Response safety analysis complete'
        );
      }
    } catch (error) {
      logger.debug({ error }, 'Response safety analysis failed, continuing without');
      safetyContext = null;
    }

    // Resolve current focus line for prompt conditioning
    const currentFocusLine = await this.resolveCurrentFocusLine(userId, currentContext);

    // Timeline context insight (hierarchy gaps + parallels) when focused on era/saga/arc
    let timelineInsightChat: (ChatContextExtension & { layer?: string }) | undefined;
    if (
      currentContext?.kind === 'timeline' &&
      currentContext.timelineNodeId &&
      ['era', 'saga', 'arc'].includes(currentContext.timelineLayer ?? '')
    ) {
      try {
        const node = await timelineManager.getNode(userId, currentContext.timelineLayer!, currentContext.timelineNodeId) as { id: string; user_id: string; start_date: string; end_date?: string | null };
        const ext = await extendChatContext(userId, {
          id: node.id,
          layer: currentContext.timelineLayer as 'era' | 'saga' | 'arc',
          user_id: node.user_id,
          start_date: node.start_date,
          end_date: node.end_date ?? null,
        });
        timelineInsightChat = { ...ext, layer: currentContext.timelineLayer ?? undefined };
      } catch (err) {
        logger.debug({ err, userId, nodeId: currentContext.timelineNodeId }, 'Timeline insight failed, continuing without');
      }
    }

    // ── Context Selection Layer ───────────────────────────────────────────────
    const rawLoreDataChat = {
      allCharacters: ragPacket.allCharacters,
      allLocations: ragPacket.allLocations,
      allChapters: ragPacket.allChapters,
      timelineHierarchy: ragPacket.timelineHierarchy,
      allPeoplePlaces: ragPacket.allPeoplePlaces,
      essenceProfile: essenceProfile,
      identityCoreProfile: identityCoreProfile,
      characterAttributesMap: ragPacket.characterAttributesMap,
      characterMemoriesMap: (ragPacket as any).characterMemoriesMap,
      romanticRelationships: ragPacket.romanticRelationships,
      romanticContext: ragPacket.romanticContext ?? [],
      corrections: ragPacket.corrections,
      deprecatedUnits: ragPacket.deprecatedUnits,
      workoutEvents: ragPacket.workoutEvents,
      recentBiometrics: ragPacket.recentBiometrics,
      topInterests: ragPacket.topInterests,
      recentInterpretations: ragPacket.recentInterpretations,
      stableArcs: ragPacket.stableArcs,
      episodicEvents: ragPacket.episodicEvents,
      socialCommunities: ragPacket.socialCommunities,
      crystallizedKnowledge: ragPacket.crystallizedKnowledge ?? [],
      entityArcNarrativeBlock: ragPacket.entityArcNarrativeBlock ?? null,
    };

    let scoredLoreDataChat: Record<string, unknown> = rawLoreDataChat;
    try {
      const scoringResultChat = scoreContext(
        rawLoreDataChat as Record<string, unknown>,
        message,
        ragPacket.allCharacters ?? [],
        ragPacket.allLocations ?? []
      );
      logScoringDecisions(scoringResultChat, userId);
      scoredLoreDataChat = scoringResultChat.filteredLoreData;
    } catch (scoringErr) {
      logger.warn({ err: scoringErr, userId }, '[ContextScoring] Scorer failed — falling back to raw loreData');
    }
    // ─────────────────────────────────────────────────────────────────────────

    // Build system prompt with comprehensive lore and essence profile
    let systemPrompt = this.buildSystemPrompt(
      orchestratorSummary,
      connections,
      continuityWarnings,
      strategicGuidance,
      sources,
      scoredLoreDataChat as any,
      entityContext,
      entityAnalytics,
      entityConfidence,
      analyticsGate,
      personaBlend,
      undefined,
      undefined,
      currentFocusLine,
      timelineInsightChat,
      undefined,
      userId
    );

    if (refinementClarificationChat) {
      systemPrompt += `\n\n**REFINEMENT CLARIFICATION**: The user may be correcting something in their Soul Profile. If your reply is about that, first ask them: "${refinementClarificationChat}"`;
    }

    // RESPONSE SAFETY: Inject safety guidance if stress signals detected (BEFORE creating messages)
    if (safetyContext && safetyContext.stressSignals.length > 0) {
      systemPrompt += `\n\n${safetyContext.safetyGuidance}\n`;
      
      // Adjust persona blend if needed (reduce strategist weight if advice should be avoided)
      if (safetyContext.shouldAvoidAdvice && personaBlend) {
        // Reduce strategist weight, increase therapist weight
        if (personaBlend.weights.strategist && personaBlend.weights.strategist > 0.3) {
          const strategistWeight = personaBlend.weights.strategist;
          personaBlend.weights.strategist = Math.max(0.1, strategistWeight * 0.5);
          personaBlend.weights.therapist = (personaBlend.weights.therapist || 0) + strategistWeight * 0.5;
        }
      }
    }

    // BELIEF CHALLENGE: Check if we can safely challenge a belief (non-streaming chat only)
    // Only if safety context allows and user is not in vulnerable state
    if (safetyContext && !safetyContext.hasShame && !safetyContext.hasIsolationLanguage && !safetyContext.hasDependencyFear) {
      try {
        // Get recent perceptions (last 30 days, limit 5)
        const recentPerceptions = await perceptionService.getPerceptionEntries(userId, {
          limit: 5,
          retracted: false,
        });

        // Filter to perceptions older than 7 days
        const eligiblePerceptions = recentPerceptions.filter(p => {
          const ageDays = (Date.now() - new Date(p.created_at).getTime()) / (1000 * 60 * 60 * 24);
          return ageDays >= 7 && p.confidence_level >= 0.3;
        });

        // Check each perception for eligibility
        for (const perception of eligiblePerceptions.slice(0, 2)) { // Limit to 2 challenges max
          const eligibility = isBeliefChallengeAllowed(
            {
              id: perception.id,
              confidence_level: perception.confidence_level,
              created_at: perception.created_at,
            },
            {
              isIsolated: safetyContext.hasIsolationLanguage,
              hasShame: safetyContext.hasShameLanguage,
              hasDependencyFear: safetyContext.hasDependencyFear,
              hasRelationalStrain: safetyContext.hasRelationalStrain,
            }
          );

          if (eligibility.eligible) {
            // Evaluate the belief
            const evaluation = await evaluateBelief(userId, perception.id);

            // Only challenge if there's evidence it might need exploration
            // (repeated multiple times, or has negative reward correlation, or has contradictions)
            if (
              evaluation.repetitionCount > 2 ||
              evaluation.rewardCorrelation < -0.3 ||
              evaluation.contradictingEvidenceCount > 0
            ) {
              // Generate challenge (use 'curious' style for first challenge, 'gentle' for others)
              const challenge = generateBeliefChallenge(
                {
                  id: perception.id,
                  content: perception.content,
                  subject_alias: perception.subject_alias,
                },
                'curious',
                evaluation
              );

              // Inject challenge into system prompt
              systemPrompt += `\n\n**OPTIONAL BELIEF EXPLORATION** (only if conversation naturally flows this way):\n${challenge.challengePrompt}\n\nNote: This is optional. Only bring this up if the conversation naturally allows for gentle exploration. Do not force it.`;

              logger.debug(
                { perceptionId: perception.id, style: challenge.style },
                'Generated belief challenge'
              );

              // Only challenge one belief per conversation to avoid overwhelming
              break;
            }
          }
        }
      } catch (error) {
        // Fail silently - belief challenges are optional
        logger.debug({ error }, 'Belief challenge check failed, continuing without');
      }
    }

    // If the user is answering a clarifying question (last assistant message was one), nudge the model
    const lastAssistantNonStream = [...conversationHistory].reverse().find(m => m.role === 'assistant');
    if (lastAssistantNonStream && lastAssistantNonStream.content) {
      const c = lastAssistantNonStream.content.toLowerCase();
      const looksLikeClarify = c.length < 300 && (c.endsWith('?') || c.includes('?')) &&
        (/\b(what do you mean|do you mean|are you talking about)\b/i.test(c));
      if (looksLikeClarify) {
        systemPrompt += `

**FOLLOW-UP TO CLARIFYING QUESTION**: The user is answering your previous clarifying question about something they did or achieved. Acknowledge what they said (including any milestone or progress) and respond helpfully to any frustration or follow-up they have (e.g. what "the way I want" or similar looks like, or how you can help).`;
      }
    }

    // Generate response
    const messages = [
      { role: 'system' as const, content: systemPrompt },
      ...conversationHistory.slice(-6),
      { role: 'user' as const, content: message }
    ];

    // Declare entryId here so it is in scope for RL context saving below.
    // The variable is assigned after the user message is persisted further down in the function.
    let entryId: string | undefined;

    const completion = await openai.chat.completions.create({
      model: config.defaultModel,
      temperature: 0.7,
      messages
    });

    const answer = completion.choices[0]?.message?.content ?? 'I understand. Tell me more.';

    // RL: Save context for later reward updates (use entryId if available, otherwise generate)
    const messageId = entryId || randomUUID();
    const sessionId = threadId ?? await this.getOrCreateChatSession(userId);

    // Save assistant response with challenge metadata if present
    const assistantMetadata: any = {
      sources: sources.slice(0, 10).map(s => ({ type: s.type, id: s.id, title: s.title })),
      connections: connections,
      continuity_warnings: continuityWarnings,
    };

    // Save assistant message (fire-and-forget)
    supabaseAdmin
      .from('chat_messages')
      .insert({
        user_id: userId,
        session_id: sessionId,
        role: 'assistant',
        content: answer,
        metadata: assistantMetadata,
      })
      .select('id')
      .single()
      .then(async (result) => {
        if (result.data && result.data.id) {
          logger.debug({ userId, sessionId }, 'Saved assistant response');
          
          // Enqueue AI response ingestion at LOW priority (user messages take precedence).
          // Skip when entityContext is set — entity-scoped sessions are handled by
          // ingestMessageWithContext and enqueueing here would double-ingest.
          if (!entityContext) {
            ingestionQueue.enqueue({
              userId,
              chatMessageId: result.data.id,
              sessionId,
              conversationHistory,
            }, 'LOW');
          }
        }
      })
      .catch(err => {
        logger.debug({ err }, 'Failed to save assistant response (non-blocking)');
      });
    if (rlContext && personaBlend) {
      this.personaRL.saveChatContext(
        userId,
        messageId,
        sessionId,
        rlContext,
        personaBlend.primary
      ).catch(err => {
        logger.debug({ err }, 'RL: Failed to save chat context (non-critical)');
      });

      // AUTOMATIC: Record implicit rewards after a delay (when user likely read response)
      // This happens automatically without user action
      setTimeout(() => {
        this.personaRL.recordImplicitRewards(userId, sessionId, {
          messageId,
          actionType: 'follow_up', // Will be updated when user actually sends follow-up
          timeSpent: 5000, // Assume user spent at least 5 seconds reading
        }).catch(err => {
          logger.debug({ err }, 'RL: Failed to record automatic implicit rewards (non-critical)');
        });
      }, 10000); // After 10 seconds, assume user has read the response
    }

    // Generate citations
    const citations = this.generateCitations(sources, answer);

    // Extract memory claims used in response (from omega memory)
    // Note: This is a placeholder - in production, you'd query omega_claims
    // based on entities mentioned in sources or the response content
    const memories: MemoryClaim[] = [];

    // Save chat message and ingest through pipeline (all non-trivial messages)
    // Note: entryId was declared earlier in this function, above the OpenAI call.
    const timelineUpdates: string[] = [];

    // Only exclude truly trivial messages (hi, ok, thanks, etc.)
    if (!isTrivialMessage(message)) {
      // Use the UI thread as the session when provided (matches chatStream behaviour)
      const sessionId = threadId ?? await this.getOrCreateChatSession(userId);

      // Save message to chat_messages table
      const { data: savedMessage, error: saveError } = await supabaseAdmin
        .from('chat_messages')
        .insert({
          user_id: userId,
          session_id: sessionId,
          role: 'user',
          content: message,
          metadata: {
            extractedDates,
            connections: connections.length,
            hasContinuityWarnings: continuityWarnings.length > 0,
            sourcesUsed: sources.length,
          },
        })
        .select('id')
        .single();

      if (saveError || !savedMessage || !savedMessage.id) {
        logger.warn({ error: saveError, userId }, 'Failed to save chat message');
      } else {
        // Set entryId for tracking and RL
        entryId = savedMessage.id;

        // Fire-and-forget ingestion through pipeline (non-blocking)
        conversationIngestionPipeline
          .ingestFromChatMessage(
            userId,
            savedMessage.id,
            sessionId,
            conversationHistory
          )
          .then(result => {
            logger.debug({ userId, messageId: savedMessage.id }, 'Successfully ingested chat message');
          })
          .catch(err => {
            logger.warn({ err, userId, messageId: savedMessage.id }, 'Failed to ingest chat message (non-blocking)');
          });

        // Pipeline status intentionally not surfaced to user — trust > transparency of ops
      }

      memoirService.autoUpdateMemoir(userId).catch(err => {
        logger.warn({ err }, 'Failed to auto-update memoir after chat');
      });

      // Auto-update main lifestory biography (fire and forget)
      const { mainLifestoryService } = await import('./mainLifestoryService');
      mainLifestoryService.updateAfterChatEntry(userId).catch(err => {
        logger.warn({ err }, 'Failed to update main lifestory after chat');
      });

      // Extract essence insights after conversation (fire and forget)
      const fullHistory = [...conversationHistory, { role: 'user' as const, content: message }];
      essenceProfileService.extractEssence(userId, fullHistory, ragPacket.relatedEntries)
        .then(insights => {
          if (Object.keys(insights).length > 0) {
            return essenceProfileService.updateProfile(userId, insights);
          }
        })
        .catch(err => {
          logger.debug({ err }, 'Failed to extract essence insights');
        });
    }

    // Extract characters and detect unnamed characters with nicknames
    const characters = await peoplePlacesService.listEntities(userId);
    const mentionedCharacters = characters.filter(char =>
      message.toLowerCase().includes(char.name.toLowerCase())
    );
    const characterIds = mentionedCharacters.map(c => c.id);
    const mentionedEntities: Array<{ id: string; name: string; type: 'character' | 'location' | 'organization' }> =
      mentionedCharacters.map(c => ({
        id: c.id,
        name: c.name,
        type: c.type === 'place' ? 'location' as const
            : (c.type === 'organization' || c.type === 'platform') ? 'organization' as const
            : 'character' as const,
      }));

    // Detect unnamed characters and generate nicknames (fire and forget)
    const { characterNicknameService } = await import('./characterNicknameService');
    characterNicknameService.extractNicknamesFromConversation(userId, message, conversationHistory)
      .then(async (result) => {
        // Create characters with generated nicknames
        for (const newChar of result.newCharacters) {
          try {
            const created = await characterNicknameService.createCharacterWithNickname(userId, newChar);
            if (created) {
              logger.info({ userId, characterId: created.id, nickname: created.name }, 'Created character with auto-generated nickname');
            }
          } catch (error) {
            logger.debug({ error, character: newChar }, 'Failed to create character with nickname');
          }
        }

        // Add nicknames to existing characters
        for (const mapping of result.nicknameMappings) {
          try {
            await characterNicknameService.addNicknameToCharacter(userId, mapping.characterId, mapping.nickname);
          } catch (error) {
            logger.debug({ error, mapping }, 'Failed to add nickname to character');
          }
        }
      })
      .catch(err => {
        logger.debug({ err }, 'Failed to extract nicknames from conversation');
      });

    // Detect memory suggestion (proactive memory capture)
    let memorySuggestion: MemorySuggestion | null = null;
    try {
      memorySuggestion = await this.detectMemorySuggestion(userId, message);
    } catch (error) {
      logger.debug({ error }, 'Failed to detect memory suggestion, continuing');
    }

    // Detect groups in conversation (fire-and-forget)
    import('./groupDetectionService').then(({ groupDetectionService }) => {
      const conversationTexts = conversationHistory.map(m => m.content);
      groupDetectionService.detectGroupsInMessage(userId, message, conversationTexts)
        .then(async (detectedGroups) => {
          if (detectedGroups.length > 0) {
            try {
              await groupDetectionService.processDetectedGroups(userId, detectedGroups);
              logger.info({ userId, groupCount: detectedGroups.length }, 'Detected and processed groups from conversation');
            } catch (error) {
              logger.debug({ error, userId }, 'Failed to process detected groups');
            }
          }
        })
        .catch(err => {
          logger.debug({ err }, 'Failed to detect groups from conversation');
        });
    }).catch(err => {
      logger.debug({ err }, 'Failed to import group detection service');
    });

    // Ingest message with entity context (fire-and-forget)
    if (entityContext) {
      this.ingestMessageWithContext(userId, message, conversationHistory, entityContext).catch(err => {
        logger.warn({ err, userId, entityContext }, 'Failed to ingest message with entity context (non-blocking)');
      });
    }

    return {
      answer,
      entryId,
      messageId,
      sessionId,
      characterIds,
      activePersona: personaBlend?.primary || 'therapist',
      mentionedEntities: mentionedEntities.length > 0 ? mentionedEntities : undefined,
      connections,
      continuityWarnings,
      timelineUpdates,
      strategicGuidance: strategicGuidance || undefined,
      extractedDates,
      sources: sources.slice(0, 10),
      citations,
      memorySuggestion: memorySuggestion || undefined
    };
  }

  private async getStrategicGuidance(userId: string, message: string): Promise<string | null> {
    return _getStrategicGuidance(userId, message);
  }

  /**
   * Detect memory-worthy content and create suggestion
   * Proactive memory capture - better than ChatGPT
   */
  private async detectMemorySuggestion(
    userId: string,
    message: string
  ): Promise<MemorySuggestion | null> {
    return _detectMemorySuggestion(userId, message);
  }

  /**
   * Helper: Get or create a chat session for the user
   */
  private async getOrCreateChatSession(userId: string): Promise<string> {
    return _getOrCreateChatSession(userId);
  }

  /**
   * Lightweight gate: does the message look like a Soul Profile correction/refinement?
   * Used to decide whether to await refinement (and possibly inject clarification) or fire-and-forget.
   */
  private mightBeRefinement(message: string): boolean {
    return _mightBeRefinement(message);
  }

  /**
   * Helper: Get recent insights from essence profile for refinement context
   */
  private getRecentInsights(profile: any): Array<{ id: string; category: string; text: string; confidence: number }> {
    return _getRecentInsights(profile);
  }

  /**
   * Ingest message with entity context (fire-and-forget)
   */
  private async ingestMessageWithContext(
    userId: string,
    message: string,
    conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>,
    entityContext: { type: 'CHARACTER' | 'LOCATION' | 'PERCEPTION' | 'MEMORY' | 'ENTITY' | 'GOSSIP' | 'ROMANTIC_RELATIONSHIP'; id: string }
  ): Promise<void> {
    return _ingestMessageWithContext(userId, message, conversationHistory, entityContext);
  }
}

export const omegaChatService = new OmegaChatService();

