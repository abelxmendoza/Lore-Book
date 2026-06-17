import { randomUUID } from 'crypto';

import type OpenAI from 'openai';

import { config } from '../config';
import { logger } from '../logger';
import { openai } from '../lib/openai';
import type { MemoryEntry, ResolvedMemoryEntry } from '../types';
import type { CurrentContext, SoulProfileContext } from '../types/currentContext';
import type { ChatContextExtension } from '../types/timelineInsight';
import { extractTags, shouldPersistMessage, isTrivialMessage } from '../utils/keywordDetector';
import { messageReferencesMention } from '../utils/disambiguationUtils';

import {
  isBeliefChallengeAllowed,
  evaluateBelief,
  generateBeliefChallenge,
} from './conversationCentered/beliefChallenge';
import { ingestionQueue } from './ingestion/ingestionQueue';
import { tokenBudgetService } from './chat/tokenBudgetService';
import { compactionService } from './chat/compactionService';
import { createOpenAIChatStream, type LorekeeperChatStream } from './chat/openaiChatStreamAdapter';
import { responseSafetyService } from './conversationCentered/responseSafetyService';
import { tangentTransitionDetector, type TransitionAnalysis, type EmotionalState } from './conversationCentered/tangentTransitionDetector';
import { entityAmbiguityService } from './entityAmbiguityService';
import { essenceProfileService } from './essenceProfileService';
import { essenceRefinementEngine } from './essenceRefinement';
import { epiphanySessionManager } from './epiphanyEngine/epiphanySessionManager';
import { intentDetectionService } from './intentDetectionService';
import { locationService } from './locationService';
import { memoirService } from './memoirService';
import { resolveMessageEntitiesForDisplay } from './chat/messageEntityDisplayService';
import { loadEntityAnalyticsForContext } from './chat/entityAnalyticsLoader';
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
  mentionedEntities?: Array<{
    id: string;
    name: string;
    type: 'character' | 'location' | 'organization';
    confidence?: number;
    provenance?: 'character_book' | 'location_book' | 'organization_book' | 'omega_entity';
    mentionStatus?: 'confirmed' | 'mentioned_only';
  }>;
  suggestedActions?: ChatSuggestedAction[];
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

export type ChatSuggestedAction = {
  id: string;
  label: string;
  kind: 'open_sources' | 'search' | 'prefill' | 'fork';
  prompt?: string;
  query?: string;
  targetId?: string;
};

function buildSuggestedActions(input: {
  message: string;
  sources: ChatSource[];
  mentionedEntities: Array<{ id: string; name: string; type: 'character' | 'location' | 'organization' }>;
  timelineUpdates: string[];
  memorySuggestion: MemorySuggestion | null;
  disambiguationPrompt: StreamingChatResponse['metadata']['disambiguationPrompt'] | null;
}): ChatSuggestedAction[] {
  const actions: ChatSuggestedAction[] = [];
  const add = (action: ChatSuggestedAction) => {
    if (!actions.some((existing) => existing.id === action.id)) actions.push(action);
  };

  if (input.sources.length > 0) {
    add({
      id: 'open-sources',
      label: 'Review sources',
      kind: 'open_sources',
      targetId: input.sources[0]?.id,
    });
  }

  if (input.memorySuggestion) {
    add({
      id: 'confirm-memory',
      label: 'Confirm memory',
      kind: 'prefill',
      prompt: `Yes, remember this: ${input.memorySuggestion.claim_text}`,
    });
  }

  if (input.disambiguationPrompt) {
    add({
      id: 'clarify-entity',
      label: 'Clarify who this is',
      kind: 'prefill',
      prompt: `When I said "${input.disambiguationPrompt.mention_text}", I meant `,
    });
  }

  const primaryEntity = input.mentionedEntities[0];
  if (primaryEntity) {
    add({
      id: `ask-entity-${primaryEntity.id}`,
      label: `Ask about ${primaryEntity.name}`,
      kind: 'prefill',
      prompt: `What do you know about ${primaryEntity.name} across my Lore Book?`,
      targetId: primaryEntity.id,
    });
  }

  if (input.timelineUpdates.length > 0 || /\b(date|timeline|when|chapter|event|happened)\b/i.test(input.message)) {
    add({
      id: 'refine-timeline',
      label: 'Refine timeline',
      kind: 'prefill',
      prompt: 'Help me refine the timeline details from this conversation.',
    });
  }

  if (/\b(remember|recall|what do you know|have i ever|find)\b/i.test(input.message)) {
    add({
      id: 'search-related',
      label: 'Find related memories',
      kind: 'search',
      query: input.message.slice(0, 160),
    });
  }

  add({
    id: 'fork-thread',
    label: 'Branch from here',
    kind: 'fork',
  });

  if (actions.length < 3) {
    add({
      id: 'go-deeper',
      label: 'Go deeper',
      kind: 'prefill',
      prompt: 'Go deeper on this and connect it to the broader patterns in my Lore Book.',
    });
  }

  return actions.slice(0, 4);
}

export type StreamingChatResponse = {
  content?: string; // For non-streaming responses (like recall)
  stream: LorekeeperChatStream;
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
      /** Persisted entity_questions row id (creation-time near-duplicate flow) */
      question_id?: string;
      /** Allow selecting multiple existing people for one mention */
      multi_select?: boolean;
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
    suggestedActions?: ChatSuggestedAction[];
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
  /**
   * Return-to-thread orientation block for the system prompt. Empty string
   * unless the thread has been idle 24h+. Includes recurring scenes
   * (continuity_strength ≥ 0.72 — 3+ traced occurrences) the thread
   * participated in: structural facts the model may reference when relevant
   * but must never interpret emotionally.
   */
  private async buildReturnToThreadContext(userId: string, threadId: string): Promise<string> {
    let context = '';
    try {
      const { data: threadRow } = await supabaseAdmin
        .from('conversation_sessions')
        .select('title, metadata')
        .eq('id', threadId)
        .eq('user_id', userId)
        .maybeSingle();
      if (!threadRow) return '';

      // Idle gap is measured from the last MESSAGE, not the session row's
      // updated_at: background machinery (subtitle extraction, ingestion
      // bookkeeping) touches the row constantly, which silently reset the
      // idle clock and made the 24h gap undetectable for real users.
      const { data: lastMsg } = await supabaseAdmin
        .from('chat_messages')
        .select('created_at')
        .eq('session_id', threadId)
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!lastMsg?.created_at) return '';

      const idleHours = (Date.now() - new Date(lastMsg.created_at).getTime()) / 3_600_000;
      if (idleHours < 24) return '';

      const idleDays = Math.floor(idleHours / 24);
      const timeLabel = idleDays === 1 ? '1 day' : `${idleDays} days`;

      // Prefer the structured, deterministic continuity card (Phase 3) built from
      // conversation_sessions.metadata.threadMeta — people/places/projects/episodes/
      // open loops + the living medium summary. Falls back to the legacy
      // subtitle/dominantEntities only when threadMeta is empty.
      let continuityBody = '';
      try {
        const { threadIntelligenceService } = await import('./conversationCentered/threadIntelligenceService');
        const { card } = await threadIntelligenceService.getContinuity(userId, threadId);
        if (card) continuityBody = `\n${card}`;
      } catch (err) {
        logger.warn({ err, threadId }, 'Continuity card lookup failed, falling back');
      }
      if (!continuityBody) {
        const subtitle = (threadRow.metadata as any)?.subtitle as string | undefined;
        const entities: string[] = (threadRow.metadata as any)?.dominantEntities ?? [];
        const entityPhrase = entities.length > 0 ? ` The recurring context included: ${entities.slice(0, 3).join(', ')}.` : '';
        const subtitlePhrase = subtitle ? ` The last topic was: ${subtitle}.` : '';
        continuityBody = `${subtitlePhrase}${entityPhrase}`;
      }
      context = `\n\n**THREAD RESUMED AFTER ${timeLabel.toUpperCase()} GAP**: This conversation was last active ${timeLabel} ago.${continuityBody}\nOrient naturally to the resumed context — no dramatic welcome, just quiet continuity.`;

      try {
        const { eventCandidateService } = await import('./eventCandidates/eventCandidateService');
        const scenes = await eventCandidateService.getRecurringScenesForThread(userId, threadId);
        if (scenes.length > 0) {
          const sceneLines = scenes.map(s => {
            const who = (s.dominant_entity_names ?? []).slice(0, 3).join(', ');
            const lastSeen = s.last_seen_at ? new Date(s.last_seen_at).toISOString().slice(0, 10) : 'unknown';
            return `- "${s.canonical_title}"${who ? ` (${who})` : ''} — ${s.occurrence_count} occurrences on record, last ${lastSeen}`;
          });
          context += `\n**RECURRING SCENES IN THIS THREAD** (traced, structural — reference only when relevant, never interpret what they mean emotionally):\n${sceneLines.join('\n')}`;
        }
        logger.info({ userId, threadId, idleDays, scenes: scenes.length }, 'Return-to-thread context injected');
      } catch (err) {
        logger.warn({ err, threadId }, 'Recurring scene lookup failed, continuing without');
      }
    } catch (err) {
      logger.warn({ err, threadId }, 'Return-to-thread context lookup failed, continuing without');
    }
    return context;
  }

  private buildComposerEntitiesContext(
    composerEntities?: Array<{ id: string; name: string; type: string; status?: string }>
  ): string {
    if (!composerEntities?.length) return '';
    const lines = composerEntities.map((e) => {
      const tag =
        e.type === 'character' ? 'person'
          : e.type === 'location' ? 'place'
            : e.type === 'organization' ? 'group'
              : e.type === 'skill' ? 'skill'
                : e.type === 'event' ? 'event'
                  : e.type;
      const tier = e.status === 'suggestion' ? 'suggestion' : 'confirmed book entity';
      return `- ${e.name} (${tag}, ${tier}, id: ${e.id})`;
    });
    return `\n\n**COMPOSER ENTITIES**: The user referenced these entities while typing. Load context by stable id before responding:\n${lines.join('\n')}\nConfirmed entities are in their Lore Books. Suggestions are detected but not yet added — treat names as known references, do not re-extract as new entities.`;
  }

  private buildThreadEntitiesContext(
    threadEntities?: Array<{ id: string; name: string; type: string }>,
    focusedEntityId?: string
  ): string {
    if (!threadEntities?.length) return '';
    const lines = threadEntities.map((e) => {
      const tag =
        e.type === 'character' ? 'person'
          : e.type === 'location' ? 'place'
            : 'organization';
      const focus = focusedEntityId === e.id ? ' ← current focus' : '';
      return `- ${e.name} (${tag})${focus}`;
    });
    return `\n\n**THREAD CONFIRMED ENTITIES**: This conversation has established context with:\n${lines.join('\n')}\nBuild on what is already known about these entities from prior thread messages and their records. Do not treat them as newly discovered unless the user introduces genuinely new information.`;
  }

  /** Persist user message before routing, retrieval, or generation (Chat Trust Recovery). */
  private async persistUserMessageEarly(
    userId: string,
    sessionId: string,
    message: string,
    conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>,
    entityContext?: { type: string; id: string }
  ): Promise<string | undefined> {
    if (isTrivialMessage(message)) {
      const { data: savedMessage, error: saveError } = await supabaseAdmin
        .from('chat_messages')
        .insert({
          user_id: userId,
          session_id: sessionId,
          role: 'user',
          content: message,
          metadata: { trivial: true },
        })
        .select('id')
        .single();
      if (saveError || !savedMessage?.id) {
        logger.warn({ error: saveError, userId, sessionId }, 'Failed to persist trivial user message');
        return undefined;
      }
      await supabaseAdmin
        .from('conversation_sessions')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', sessionId)
        .eq('user_id', userId);
      return savedMessage.id;
    }

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

    if (saveError || !savedMessage?.id) {
      logger.error({ error: saveError, userId, sessionId }, 'Failed to persist user message before routing');
      throw new Error('Failed to save your message. Please try again.');
    }

    await supabaseAdmin
      .from('conversation_sessions')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', sessionId)
      .eq('user_id', userId);

    if (!entityContext) {
      ingestionQueue.enqueue(
        {
          userId,
          chatMessageId: savedMessage.id,
          sessionId,
          conversationHistory,
        },
        'NORMAL'
      );
    }

    return savedMessage.id;
  }

  async chatStream(
    userId: string,
    message: string,
    conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }> = [],
    entityContext?: { type: 'CHARACTER' | 'LOCATION' | 'PERCEPTION' | 'MEMORY' | 'ENTITY' | 'GOSSIP' | 'ROMANTIC_RELATIONSHIP'; id: string },
    currentContext?: CurrentContext,
    soulProfileContext?: SoulProfileContext,
    threadId?: string,
    threadEntities?: Array<{ id: string; name: string; type: 'character' | 'location' | 'organization' }>,
    composerEntities?: Array<{ id: string; name: string; type: string }>
  ): Promise<StreamingChatResponse> {
    // Use the UI thread as the session so messages, recall scoping, and
    // ingestion all stay attached to the thread the user is actually in.
    const sessionId = threadId ?? await this.getOrCreateChatSession(userId);

    let entryId: string | undefined;
    try {
      entryId = await this.persistUserMessageEarly(
        userId,
        sessionId,
        message,
        conversationHistory,
        entityContext
      );
    } catch (persistErr) {
      logger.error({ err: persistErr, userId, sessionId }, 'User message early persist failed');
      throw persistErr;
    }

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

    // Return-to-thread orientation — computed BEFORE mode routing so that
    // mode-handled responses (e.g. the experience-ingestion ack) are also
    // continuity-aware, not just the full conversational path.
    const returnToThreadContext = currentContext?.threadId
      ? await this.buildReturnToThreadContext(userId, currentContext.threadId)
      : '';
    const workingMemoryPrimary = process.env.WORKING_MEMORY_PRIMARY !== 'false';

    // =====================================================
    // SPRINT AK — Conversation intelligence (before AH gates)
    // =====================================================
    if (!workingMemoryPrimary) try {
      const { routeConversationIntelligence } = await import('./chat/conversationIntelligenceRouter');
      const { formatModeResponse } = await import('./modeRouter/responseFormatter');

      const akResult = await routeConversationIntelligence(userId, message, {
        conversationHistory: conversationHistory.map((m) => ({ role: m.role, content: m.content })),
        threadId: threadId ?? currentContext?.threadId,
      });

      if (akResult.handled) {
        return formatModeResponse(
          {
            content: akResult.content,
            response_mode: akResult.response_mode,
            confidence: akResult.confidence,
            metadata: { conversation_intelligence: true, ...akResult.metadata },
          },
          'FOUNDATION_RECALL'
        );
      }
    } catch (err) {
      logger.warn({ err, userId }, 'Sprint AK conversation intelligence failed, continuing');
    }

    // =====================================================
    // SPRINT AH — Trust & Recall gates (before mode router)
    // =====================================================
    try {
      const { detectTestingMode } = await import('./chat/testingModeDetector');
      const { getMemoryFormationStatus } = await import('./chat/memoryFormationStatusService');
      const { detectRecallFailure } = await import('./chat/testingModeDetector');
      const { buildDiagnosticRecall } = await import('./chat/failureAwareHandler');
      const { formatModeResponse } = await import('./modeRouter/responseFormatter');
      const { matchesThreadRecallQuery, buildThreadRecall } = await import('./chat/threadRecallService');

      const testingMode = detectTestingMode(message);
      if (testingMode === 'memory_formation') {
        const status = await getMemoryFormationStatus(userId, message, {
          threadId: threadId ?? currentContext?.threadId,
        });
        return formatModeResponse(
          {
            content: status.content,
            response_mode: 'DIAGNOSTIC',
            confidence: 0.95,
            metadata: { testing_mode: testingMode, entity_name: status.entityName },
          },
          'FOUNDATION_RECALL'
        );
      }

      if (detectRecallFailure(message)) {
        const diagnostic = await buildDiagnosticRecall(userId, message, {
          conversationHistory: conversationHistory.map((m) => ({ role: m.role, content: m.content })),
          threadId: threadId ?? currentContext?.threadId,
        });
        return formatModeResponse(
          {
            content: diagnostic,
            response_mode: 'DIAGNOSTIC',
            confidence: 0.9,
            metadata: { recall_failure_recovery: true },
          },
          'FOUNDATION_RECALL'
        );
      }

      if (matchesThreadRecallQuery(message) && conversationHistory.length > 0) {
        const thread = await buildThreadRecall(userId, message, {
          conversationHistory: conversationHistory.map((m) => ({ role: m.role, content: m.content })),
          threadId: threadId ?? currentContext?.threadId,
        });
        if (thread.hasContent) {
          return formatModeResponse(
            {
              content: thread.content,
              response_mode: 'THREAD_RECALL',
              confidence: thread.confidence,
              metadata: { recall_intent: 'thread', thread_first: true },
            },
            'FOUNDATION_RECALL'
          );
        }
      }

      if (!workingMemoryPrimary && (testingMode === 'recall_check' || testingMode === 'system_state' || testingMode === 'general_diagnostic')) {
        const { executeExplicitRecall } = await import('./chat/explicitRecallService');
        const recall = await executeExplicitRecall(
          userId,
          message,
          conversationHistory.map((m) => ({ role: m.role, content: m.content })),
          { threadId: threadId ?? currentContext?.threadId }
        );
        if (recall.response_mode !== 'SILENCE') {
          return formatModeResponse(
            {
              content: recall.content,
              response_mode: 'DIAGNOSTIC',
              confidence: recall.confidence,
              metadata: { testing_mode: testingMode, ...recall.metadata },
            },
            'FOUNDATION_RECALL'
          );
        }
      }
    } catch (err) {
      logger.warn({ err, userId }, 'Sprint AH recall gates failed, continuing');
    }

    // =====================================================
    // MODE ROUTER (FIRST GATE)
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
      if (
        routing.mode !== 'UNKNOWN' &&
        !(workingMemoryPrimary && (routing.mode === 'MEMORY_RECALL' || routing.mode === 'FOUNDATION_RECALL'))
      ) {
        const messageId = entryId;

        // Handle mode — continuityContext keeps mode-handled replies oriented
        // when the user returns to a thread after a gap.
        const handlerResponse = await modeHandlers.handleMode(
          routing.mode,
          userId,
          message,
          {
            messageId,
            conversationHistory,
            continuityContext: returnToThreadContext || undefined,
            threadId: threadId ?? currentContext?.threadId,
          }
        );

        // Assistant persistence handled by chat.ts persistAssistant
        return formatModeResponse(handlerResponse, routing.mode);
      }
    } catch (error) {
      logger.warn({ error, userId, message }, 'Mode routing failed, falling back to normal chat');
      // Fall through to existing chat flow
    }

    // ---- RECALL GATE: Foundation lore before journal vector search ----
    if (!workingMemoryPrimary) try {
      const { matchesFoundationRecallQuery } = await import('./chat/recallIntentPatterns');
      if (matchesFoundationRecallQuery(message)) {
        const { executeExplicitRecall } = await import('./chat/explicitRecallService');
        const { formatModeResponse } = await import('./modeRouter/responseFormatter');
        const foundation = await executeExplicitRecall(
          userId,
          message,
          conversationHistory.map((m) => ({ role: m.role, content: m.content })),
          { threadId: threadId ?? currentContext?.threadId }
        );
        if (foundation.response_mode !== 'SILENCE') {
          return formatModeResponse(
            {
              content: foundation.content,
              response_mode: foundation.response_mode,
              confidence: foundation.confidence,
              metadata: foundation.metadata,
            },
            'FOUNDATION_RECALL'
          );
        }
      }

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

    // Detect groups in conversation (fire-and-forget). Routes through the
    // candidate service, which detects, dedups, and upserts review candidates.
    import('./groupCandidateService').then(({ groupCandidateService }) => {
      const conversationTexts = conversationHistory.map(m => m.content);
      void groupCandidateService
        .processChatMessage(userId, message, undefined, conversationTexts)
        .catch(err => logger.debug({ err, userId }, 'Group detection failed'));
    }).catch(err => {
      logger.debug({ err }, 'Failed to import group candidate service');
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

          // Only prompt when the user actually typed this name — never on substring
          // false positives or names the assistant introduced from RAG.
          if (
            messageReferencesMention(message, firstAmbiguity.mention_text) &&
            entityAmbiguityService.shouldPromptDisambiguation(
              firstAmbiguity,
              detectedIntent === 'VENTING' ? 'VENTING' : 'QUESTION'
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

    const { entityAnalytics, entityConfidence, analyticsGate } = await loadEntityAnalyticsForContext(
      userId,
      entityContext ? { type: entityContext.type, id: entityContext.id } : undefined
    );

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

    // Return-to-thread orientation: computed once before mode routing (so the
    // ingestion-ack path gets it too) and reused here for the main prompt.
    // returnToThreadContext is defined above the MODE ROUTER block.

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
      confirmedSkills: (ragPacket as any).confirmedSkills ?? [],
      entityDossierBlock: (ragPacket as { entityDossierBlock?: string | null }).entityDossierBlock ?? null,
      entityArcNarrativeBlock: ragPacket.entityArcNarrativeBlock ?? null,
      knowledgeGapBlock: (ragPacket as { knowledgeGapBlock?: string | null }).knowledgeGapBlock ?? null,
      foundationRecallBlock: (ragPacket as any).foundationRecallBlock ?? '',
      foundationRelationships: (ragPacket as any).foundationRelationships ?? [],
      foundationTimeline: (ragPacket as any).foundationTimeline ?? [],
      workingMemory: (ragPacket as any).workingMemory ?? null,
      workingMemoryPacket: (ragPacket as any).workingMemoryPacket ?? null,
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

    const threadEntitiesContext = this.buildThreadEntitiesContext(threadEntities, entityContext?.id);
    if (threadEntitiesContext) {
      systemPrompt += threadEntitiesContext;
    }

    const composerEntitiesContext = this.buildComposerEntitiesContext(composerEntities);
    if (composerEntitiesContext) {
      systemPrompt += composerEntitiesContext;
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
        config.chatModel,
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

    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: 'system' as const, content: finalSystemPrompt },
      ...truncatedHistory.map((turn) => ({
        role: turn.role as 'user' | 'assistant',
        content: turn.content,
      })),
      { role: 'user' as const, content: message }
    ];

    // Create streaming response — flagship tier: this is the reply the user reads.
    // Defaults to Chat Completions. Set OPENAI_CHAT_USE_RESPONSES=true to opt into
    // the Responses API adapter while preserving the existing SSE route shape.
    const stream = await createOpenAIChatStream({
      model: config.chatModel,
      temperature: 0.7,
      messages,
      userId,
    });

    // User message already persisted at stream start (entryId)
    const timelineUpdates: string[] = [];

    if (entryId && !isTrivialMessage(message)) {
      epiphanySessionManager.feedEntry(userId, {
        id: entryId,
        content: message,
        date: new Date().toISOString(),
      }).catch(err => logger.warn({ err, userId }, 'epiphany feed failed'));

      memoirService.autoUpdateMemoir(userId).catch(err => {
        logger.warn({ err }, 'Failed to auto-update memoir after chat');
      });

      const { mainLifestoryService } = await import('./mainLifestoryService');
      mainLifestoryService.updateAfterChatEntry(userId).catch(err => {
        logger.warn({ err }, 'Failed to update main lifestory after chat');
      });

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

    // Resolve entities from character/location/org books + omega_entities (not legacy people_places)
    const displayEntities = await resolveMessageEntitiesForDisplay(userId, message);
    const characterIds = displayEntities.filter((e) => e.type === 'character').map((e) => e.id);
    const mentionedEntities = displayEntities.map(({ id, name, type, confidence, provenance, mentionStatus }) => ({
      id,
      name,
      type,
      confidence,
      provenance,
      mentionStatus,
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

    // Enrich named places mentioned in this message (type, tags, significance)
    const { placeEnrichmentService } = await import('./placeEnrichmentService');
    placeEnrichmentService.enrichMentionedInText(userId, message)
      .catch(err => {
        logger.debug({ err }, 'Failed to enrich mentioned places from conversation');
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

    const suggestedActions = buildSuggestedActions({
      message,
      sources,
      mentionedEntities,
      timelineUpdates,
      memorySuggestion,
      disambiguationPrompt,
    });

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
        suggestedActions,
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
      confirmedSkills: (ragPacket as any).confirmedSkills ?? [],
      entityDossierBlock: (ragPacket as { entityDossierBlock?: string | null }).entityDossierBlock ?? null,
      entityArcNarrativeBlock: ragPacket.entityArcNarrativeBlock ?? null,
      knowledgeGapBlock: (ragPacket as { knowledgeGapBlock?: string | null }).knowledgeGapBlock ?? null,
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
      model: config.chatModel,
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

    // Save assistant message — awaited for durability (non-stream path)
    try {
      const { data: assistantRow, error: assistantErr } = await supabaseAdmin
        .from('chat_messages')
        .insert({
          user_id: userId,
          session_id: sessionId,
          role: 'assistant',
          content: answer,
          metadata: assistantMetadata,
        })
        .select('id')
        .single();

      if (assistantErr) {
        logger.error({ err: assistantErr, userId, sessionId }, 'Failed to save assistant response');
      } else if (assistantRow?.id) {
        logger.debug({ userId, sessionId }, 'Saved assistant response');

        await supabaseAdmin
          .from('conversation_sessions')
          .update({ updated_at: new Date().toISOString() })
          .eq('id', sessionId)
          .eq('user_id', userId);

        if (!entityContext) {
          ingestionQueue.enqueue({
            userId,
            chatMessageId: assistantRow.id,
            sessionId,
            conversationHistory,
          }, 'LOW');
        }
      }
    } catch (err) {
      logger.error({ err, userId, sessionId }, 'Assistant persistence threw (non-stream)');
    }
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

        // Enqueue ingestion — tracked by pipelineRunService (matches chatStream path).
        // Skip when entityContext is set: ingestMessageWithContext() fires separately
        // and enqueueing here too would double-ingest the same content.
        if (!entityContext) {
          ingestionQueue.enqueue({
            userId,
            chatMessageId: savedMessage.id,
            sessionId,
            conversationHistory,
          }, 'NORMAL');
        }
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

    // Resolve entities from character/location/org books + omega_entities (not legacy people_places)
    const displayEntities = await resolveMessageEntitiesForDisplay(userId, message);
    const characterIds = displayEntities.filter((e) => e.type === 'character').map((e) => e.id);
    const mentionedEntities = displayEntities.map(({ id, name, type, confidence, provenance, mentionStatus }) => ({
      id,
      name,
      type,
      confidence,
      provenance,
      mentionStatus,
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

    // Detect groups in conversation (fire-and-forget). Routes through the
    // candidate service, which detects, dedups, and upserts review candidates.
    import('./groupCandidateService').then(({ groupCandidateService }) => {
      const conversationTexts = conversationHistory.map(m => m.content);
      void groupCandidateService
        .processChatMessage(userId, message, undefined, conversationTexts)
        .catch(err => logger.debug({ err, userId }, 'Group detection failed'));
    }).catch(err => {
      logger.debug({ err }, 'Failed to import group candidate service');
    });

    // Ingest message with entity context (fire-and-forget)
    if (entityContext) {
      this.ingestMessageWithContext(userId, message, conversationHistory, entityContext).catch(err => {
        logger.warn({ err, userId, entityContext }, 'Failed to ingest message with entity context (non-blocking)');
      });
    }

    const suggestedActions = buildSuggestedActions({
      message,
      sources,
      mentionedEntities,
      timelineUpdates,
      memorySuggestion,
      disambiguationPrompt: null,
    });

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
      memorySuggestion: memorySuggestion || undefined,
      suggestedActions,
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
