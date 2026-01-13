/**
 * LORE-KEEPER CONVERSATIONAL ORCHESTRATION LAYER (COL)
 * Service for orchestrating chatbot responses with memory awareness
 */

import OpenAI from 'openai';
import { supabaseAdmin } from './supabaseClient';
import { logger } from '../logger';
import { config } from '../config';
import { embeddingService } from './embeddingService';
import { omegaMemoryService } from './omegaMemoryService';
import { perspectiveService } from './perspectiveService';
import { insightReflectionService } from './insightReflectionService';
import { memoryReviewQueueService } from './memoryReviewQueueService';
import { decisionMemoryService } from './decisionMemoryService';
import { predictiveContinuityService } from './predictiveContinuityService';
import { goalValueAlignmentService } from './goalValueAlignmentService';
import { privacyScopeService } from './privacyScopeService';
import { conversationIngestionPipeline } from './conversationCentered/ingestionPipeline';
import { intentDetectionService } from './intentDetectionService';
import { expressionRoutingService } from './expressionRoutingService';
import { responseShapingService } from './responseShapingService';
import { memoryRecallEngine } from './memoryRecall/memoryRecallEngine';
import { isRecallQuery, shouldForceArchivist } from './memoryRecall/recallDetector';
import { formatRecallChatResponse } from './memoryRecall/recallChatFormatter';
import type {
  ChatContext,
  ChatMessage,
  ChatResponse,
  ChatSession,
  MessageInput,
  UserIntent,
  ResponseMode,
} from '../types/conversationalOrchestration';

const openai = new OpenAI({ apiKey: config.openAiKey });
const MIN_CONFIDENCE_THRESHOLD = 0.5;

export class ConversationalOrchestrationService {
  /**
   * Handle user message and generate response
   */
  async handleUserMessage(
    userId: string,
    message: string,
    sessionId?: string
  ): Promise<ChatResponse> {
    try {
      // Get or create session
      const session = await this.getOrCreateSession(userId, sessionId);

      // Get or create context
      const context = await this.getOrCreateContext(userId, session.session_id);

      // Save user message
      const userMessageId = await this.saveMessage(userId, session.session_id, 'user', message);

      // Fire-and-forget: Ingest message into conversation-centered pipeline
      // This is async and non-blocking - failures are logged but don't affect chat UX
      this.ingestUserMessageAsync(userId, userMessageId, session.session_id, message).catch(
        err => {
          logger.warn(
            { error: err, userId, messageId: userMessageId },
            'Conversation ingestion failed (non-blocking)'
          );
        }
      );

      // ---- RECALL GATE: Check if this is a recall query ----
      if (isRecallQuery(message)) {
        const forcedPersona = shouldForceArchivist(message) ? 'ARCHIVIST' : undefined;

        try {
          const recallResult = await memoryRecallEngine.executeRecall({
            raw_text: message,
            user_id: userId,
            persona: forcedPersona || 'DEFAULT',
          });

          // Handle silence response
          if (recallResult.silence) {
            const silenceResponse: ChatResponse = {
              content: recallResult.silence.message,
              response_mode: 'SILENCE',
              confidence: 1.0,
              disclaimer: recallResult.silence.reason,
            };

            // Save assistant message
            await this.saveMessage(
              userId,
              session.session_id,
              'assistant',
              silenceResponse.content,
              silenceResponse.response_mode,
              silenceResponse.citations,
              silenceResponse.confidence
            );

            return silenceResponse;
          }

          // Format recall response
          const recallResponse = formatRecallChatResponse(recallResult, forcedPersona);

          // Save assistant message
          await this.saveMessage(
            userId,
            session.session_id,
            'assistant',
            recallResponse.content,
            recallResponse.response_mode,
            recallResponse.citations,
            recallResponse.confidence
          );

          logger.debug(
            { userId, recallType: recallResult.entries.length, confidence: recallResult.confidence },
            'Memory recall executed in chat'
          );

          return recallResponse;
        } catch (error) {
          logger.error({ error, userId, message }, 'Failed to execute memory recall, falling back to normal chat');
          // Fall through to normal chat flow
        }
      }

      // Classify intent
      const intent = await this.classifyIntent(message);

      // Update context with intent
      await this.updateContext(userId, session.session_id, { user_intent: intent });

      // Route to appropriate handler
      let response: ChatResponse;

      switch (intent) {
        case 'QUESTION':
          response = await this.answerQuestion(message, context);
          break;
        case 'REFLECTION':
          response = await this.reflectWithInsights(context);
          break;
        case 'DECISION_SUPPORT':
          response = await this.supportDecision(context);
          break;
        case 'MEMORY_REVIEW':
          response = await this.surfaceMRQ(context);
          break;
        case 'CLARIFICATION':
        default:
          response = await this.respondWithUncertainty();
      }

      // Check for memory change intent
      const memoryChangeIntent = await this.detectMemoryChangeIntent(message);
      if (memoryChangeIntent) {
        const proposalResponse = await this.proposeMemoryChange(userId, message, context);
        if (proposalResponse) {
          // Merge MRQ prompt into response
          response = {
            ...response,
            response_mode: 'MRQ_PROMPT',
            mrq_proposal_id: proposalResponse.mrq_proposal_id,
            content: response.content + '\n\n' + proposalResponse.content,
          };
        }
      }

      // Save assistant response
      const assistantMessageId = await this.saveMessage(
        userId,
        session.session_id,
        'assistant',
        response.content,
        response.response_mode,
        response.citations,
        response.confidence
      );

      // Fire-and-forget: Ingest AI response (lower priority, but still useful)
      // AI responses are processed with lower confidence and marked as interpretations
      const { conversationIngestionPipeline } = await import('./conversationCentered/ingestionPipeline');
      conversationIngestionPipeline
        .ingestFromChatMessage(
          userId,
          assistantMessageId,
          session.session_id,
          await this.getRecentMessages(userId, session.session_id, 10)
        )
        .catch(err => {
          logger.warn(
            { error: err, userId, messageId: assistantMessageId },
            'AI message ingestion failed (non-blocking)'
          );
        });

      return response;
    } catch (error) {
      logger.error({ err: error, userId, message }, 'Failed to handle user message');
      return this.respondWithUncertainty();
    }
  }

  /**
   * Classify user intent
   */
  private async classifyIntent(message: string): Promise<UserIntent> {
    try {
      const completion = await openai.chat.completions.create({
        model: config.defaultModel || 'gpt-4o-mini',
        temperature: 0.1,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: `You are an intent classifier. Classify user messages into one of these intents:

- QUESTION: User is asking a factual question
- REFLECTION: User wants to reflect on patterns or insights
- CLARIFICATION: User is asking for clarification
- DECISION_SUPPORT: User wants help making a decision
- MEMORY_REVIEW: User wants to review pending memories

Return JSON:
{
  "intent": "QUESTION" | "REFLECTION" | "CLARIFICATION" | "DECISION_SUPPORT" | "MEMORY_REVIEW",
  "confidence": 0.0-1.0
}`
          },
          {
            role: 'user',
            content: message
          }
        ]
      });

      const response = JSON.parse(completion.choices[0]?.message?.content || '{}');
      return (response.intent || 'QUESTION') as UserIntent;
    } catch (error) {
      logger.error({ err: error }, 'Failed to classify intent');
      return 'QUESTION';
    }
  }

  /**
   * Answer a question (factual, safe)
   */
  private async answerQuestion(message: string, context: ChatContext): Promise<ChatResponse> {
    try {
      // Resolve entities from message
      const entities = await this.resolveEntitiesFromMessage(message, context.user_id);

      if (entities.length === 0) {
        return this.respondWithUncertainty();
      }

      // Get ranked claims for entities
      const allClaims: any[] = [];
      for (const entity of entities) {
        const claims = await omegaMemoryService.rankClaims(entity.id);
        allClaims.push(...claims);
      }

      if (allClaims.length === 0) {
        return this.respondWithUncertainty();
      }

      // Check confidence
      const avgConfidence = allClaims.reduce((sum, c) => sum + (c.confidence || 0.6), 0) / allClaims.length;
      if (avgConfidence < MIN_CONFIDENCE_THRESHOLD) {
        return {
          content: "I don't have enough reliable information to answer that yet.",
          response_mode: 'UNCERTAINTY_NOTICE',
          confidence: avgConfidence,
        };
      }

      // Check for multiple perspectives
      const hasMultiplePerspectives = await this.hasMultiplePerspectives(allClaims, context.user_id);

      if (hasMultiplePerspectives) {
        return await this.summarizeByPerspective(allClaims, entities, context.user_id);
      }

      // Generate factual summary
      return await this.generateFactualSummary(allClaims, entities, message);
    } catch (error) {
      logger.error({ err: error }, 'Failed to answer question');
      return this.respondWithUncertainty();
    }
  }

  /**
   * Check stability and gate response if needed
   */
  private async checkStabilityAndGate(userId: string): Promise<ChatResponse | null> {
    try {
      // Get recent events for stability check
      const { data: recentEvents } = await supabaseAdmin
        .from('resolved_events')
        .select('confidence')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(10);

      const stabilityContext = {
        events: (recentEvents || []).map(e => ({ confidence: e.confidence || 0.5 })),
        hasContradictions: false, // Could check for contradictions here
        newEntities: [],
        patternStrength: 0, // Could calculate pattern strength here
      };

      const silenceResponse = stabilityDetectionService.gateResponse(stabilityContext);

      if (silenceResponse) {
        return {
          content: silenceResponse.message,
          response_mode: 'SILENCE',
          confidence: 1.0, // High confidence in silence
          metadata: {
            why: silenceResponse.why,
            stability_state: silenceResponse.stability_state,
          },
        };
      }

      return null; // Allow normal response
    } catch (error) {
      logger.warn({ error, userId }, 'Failed to check stability, allowing normal response');
      return null; // Fail open - allow normal response
    }
  }

  /**
   * Reflect with insights
   */
  private async reflectWithInsights(context: ChatContext): Promise<ChatResponse> {
    try {
      const insights = await insightReflectionService.getInsights(context.user_id, {
        dismissed: false,
        limit: 5,
      });

      if (insights.length === 0) {
        return {
          content: "I don't have any insights to share yet. Try asking me questions about your memories first.",
          response_mode: 'INSIGHT_REFLECTION',
        };
      }

      const formatted = await this.formatInsights(insights);

      // Also get predictions if available
      const predictions = await predictiveContinuityService.getPredictions(context.user_id, {
        dismissed: false,
        limit: 3,
      });

      let fullFormatted = formatted;
      if (predictions.length > 0) {
        const predictionsText = await this.formatPredictions(predictions);
        fullFormatted += '\n\n' + predictionsText;
      }

      // Also get goal alignment if available
      const goals = await goalValueAlignmentService.getActiveGoals(context.user_id);
      if (goals.length > 0) {
        const alignmentText = await this.formatGoalAlignment(context.user_id, goals);
        if (alignmentText) {
          fullFormatted += '\n\n' + alignmentText;
        }
      }

      return {
        content: fullFormatted,
        response_mode: 'INSIGHT_REFLECTION',
        related_insights: insights.map(i => i.id),
        disclaimer: 'These are observations and probabilistic projections, not facts or advice.',
      };
    } catch (error) {
      logger.error({ err: error }, 'Failed to reflect with insights');
      return this.respondWithUncertainty();
    }
  }

  /**
   * Support decision making (non-prescriptive)
   */
  private async supportDecision(context: ChatContext): Promise<ChatResponse> {
    try {
      const relevantInsights = await this.getDecisionRelevantInsights(context);
      const pastDecisions = await decisionMemoryService.getSimilarPastDecisions(
        context.user_id,
        {
          entity_ids: context.active_entity_ids,
        }
      );

      const synthesized = await this.synthesizeDecisionContext(
        relevantInsights,
        pastDecisions,
        context
      );

      return {
        content: synthesized,
        response_mode: 'INSIGHT_REFLECTION',
        related_insights: relevantInsights.map(i => i.id),
        disclaimer: "I'm not telling you what to do — just showing patterns.",
      };
    } catch (error) {
      logger.error({ err: error }, 'Failed to support decision');
      return this.respondWithUncertainty();
    }
  }

  /**
   * Surface MRQ items
   */
  private async surfaceMRQ(context: ChatContext): Promise<ChatResponse> {
    try {
      const pendingMRQ = await memoryReviewQueueService.getPendingMRQ(context.user_id);

      if (pendingMRQ.length === 0) {
        return {
          content: "You don't have any pending memory proposals to review.",
          response_mode: 'MRQ_PROMPT',
        };
      }

      const formatted = await this.formatMRQItems(pendingMRQ);

      return {
        content: formatted,
        response_mode: 'MRQ_PROMPT',
      };
    } catch (error) {
      logger.error({ err: error }, 'Failed to surface MRQ');
      return this.respondWithUncertainty();
    }
  }

  /**
   * Detect memory change intent
   */
  private async detectMemoryChangeIntent(message: string): Promise<boolean> {
    try {
      const completion = await openai.chat.completions.create({
        model: config.defaultModel || 'gpt-4o-mini',
        temperature: 0.1,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: `You are a memory intent detector. Determine if the user is proposing a new memory or fact to remember.

Return JSON:
{
  "proposes_memory": boolean,
  "confidence": 0.0-1.0,
  "reason": "brief explanation"
}

Examples of memory proposals:
- "Remember that I like coffee"
- "I'm a software engineer"
- "I live in Seattle"

Examples of NOT memory proposals:
- "What do I like?"
- "Tell me about myself"
- "Show me my memories"`
          },
          {
            role: 'user',
            content: message
          }
        ]
      });

      const response = JSON.parse(completion.choices[0]?.message?.content || '{}');
      return response.proposes_memory === true && (response.confidence || 0) >= 0.7;
    } catch (error) {
      logger.error({ err: error }, 'Failed to detect memory change intent');
      return false;
    }
  }

  /**
   * Propose memory change (gated through MRQ)
   */
  private async proposeMemoryChange(
    userId: string,
    message: string,
    context: ChatContext
  ): Promise<ChatResponse | null> {
    try {
      // Extract entity and claim from message
      const extraction = await this.extractMemoryFromMessage(message, userId);

      if (!extraction) {
        return null;
      }

      // Create proposal through MRQ
      const { proposal } = await memoryReviewQueueService.ingestMemory(
        userId,
        {
          id: '',
          text: extraction.claim_text,
          confidence: extraction.confidence || 0.6,
          sentiment: extraction.sentiment,
          metadata: {
            temporal_context: extraction.temporal_context,
          },
        },
        extraction.entity,
        extraction.perspective_id || null,
        message
      );

      // Update context
      await this.updateContext(userId, context.session_id, {
        unresolved_mrq_ids: [...context.unresolved_mrq_ids, proposal.id],
      });

      return {
        content: "I can remember this if you want. I've queued it for review.",
        response_mode: 'MRQ_PROMPT',
        mrq_proposal_id: proposal.id,
      };
    } catch (error) {
      logger.error({ err: error, userId, message }, 'Failed to propose memory change');
      return null;
    }
  }

  /**
   * Generate factual summary
   */
  private async generateFactualSummary(
    claims: any[],
    entities: any[],
    question: string
  ): Promise<ChatResponse> {
    try {
      const topClaims = claims.slice(0, 5);
      const entityNames = entities.map(e => e.primary_name).join(', ');

      const completion = await openai.chat.completions.create({
        model: config.defaultModel || 'gpt-4o-mini',
        temperature: 0.3,
        messages: [
          {
            role: 'system',
            content: `You are a factual summarization system. Answer questions based ONLY on the provided claims. Do NOT invent new facts.

Rules:
- Only use information from the provided claims
- Cite claim IDs when referencing specific information
- If information is missing, say so
- Be concise and accurate`
          },
          {
            role: 'user',
            content: `Question: ${question}

Entities: ${entityNames}

Claims:
${JSON.stringify(topClaims.map(c => ({ id: c.id, text: c.text, confidence: c.confidence })), null, 2)}

Answer the question using ONLY the information from these claims.`
          }
        ]
      });

      const avgConfidence = claims.reduce((sum, c) => sum + (c.confidence || 0.6), 0) / claims.length;

      return {
        content: completion.choices[0]?.message?.content || 'Unable to generate summary.',
        response_mode: 'FACTUAL_SUMMARY',
        citations: topClaims.map(c => c.id),
        confidence: avgConfidence,
      };
    } catch (error) {
      logger.error({ err: error }, 'Failed to generate factual summary');
      return this.respondWithUncertainty();
    }
  }

  /**
   * Summarize by perspective
   */
  private async summarizeByPerspective(
    claims: any[],
    entities: any[],
    userId: string
  ): Promise<ChatResponse> {
    try {
      // Get perspective claims for top claims
      const perspectiveSummaries: string[] = [];

      for (const claim of claims.slice(0, 3)) {
        const pClaims = await perspectiveService.getPerspectiveClaims(claim.id, userId);
        if (pClaims.length > 1) {
          const perspectives = pClaims.map(pc => pc.perspective_id).join(', ');
          perspectiveSummaries.push(`Claim "${claim.text}" has ${pClaims.length} perspectives: ${perspectives}`);
        }
      }

      const summary = perspectiveSummaries.length > 0
        ? `Different perspectives exist here:\n\n${perspectiveSummaries.join('\n')}`
        : 'Multiple perspectives available.';

      return {
        content: summary,
        response_mode: 'PERSPECTIVE_SUMMARY',
        citations: claims.map(c => c.id),
        disclaimer: 'Different perspectives exist here.',
      };
    } catch (error) {
      logger.error({ err: error }, 'Failed to summarize by perspective');
      return this.generateFactualSummary(claims, entities, '');
    }
  }

  /**
   * Format insights for display
   */
  private async formatInsights(insights: any[]): Promise<string> {
    const formatted = insights.map(insight => {
      return `**${insight.title}**\n${insight.description}\n(Confidence: ${(insight.confidence * 100).toFixed(0)}%)`;
    }).join('\n\n');

    return `Here are some insights I've found:\n\n${formatted}`;
  }

  /**
   * Format predictions for display
   */
  private async formatPredictions(predictions: any[]): Promise<string> {
    const formatted = predictions.map(prediction => {
      return `**${prediction.title}**\n${prediction.description}\n(Probability: ${(prediction.probability * 100).toFixed(0)}%, Confidence: ${(prediction.confidence * 100).toFixed(0)}%)`;
    }).join('\n\n');

    return `Here are some possible trajectories based on past patterns:\n\n${formatted}`;
  }

  /**
   * Format goal alignment for display
   */
  private async formatGoalAlignment(userId: string, goals: any[]): Promise<string> {
    try {
      const snapshots = await goalValueAlignmentService.getLatestAlignmentSnapshots(
        userId,
        goals.map(g => g.id)
      );

      if (snapshots.length === 0) {
        return '';
      }

      const formatted = goals.map(goal => {
        const snapshot = snapshots.find(s => s.goal_id === goal.id);
        if (!snapshot) {
          return null;
        }

        const alignmentPercent = ((snapshot.alignment_score + 1) / 2 * 100).toFixed(0);
        return `**${goal.title}**\nAlignment: ${alignmentPercent}% (Confidence: ${(snapshot.confidence * 100).toFixed(0)}%)`;
      }).filter(Boolean).join('\n\n');

      return formatted ? `Goal Alignment:\n\n${formatted}\n\nAlignment reflects observed patterns, not intent.` : '';
    } catch (error) {
      logger.error({ err: error }, 'Failed to format goal alignment');
      return '';
    }
  }

  /**
   * Format MRQ items
   */
  private async formatMRQItems(items: any[]): Promise<string> {
    const formatted = items.slice(0, 5).map(item => {
      return `- "${item.claim_text}" (Risk: ${item.risk_level}, Confidence: ${(item.confidence * 100).toFixed(0)}%)`;
    }).join('\n');

    return `You have ${items.length} pending memory proposals:\n\n${formatted}\n\nReview them in the Memory Review Queue.`;
  }

  /**
   * Resolve entities from message
   */
  private async resolveEntitiesFromMessage(message: string, userId: string): Promise<any[]> {
    try {
      // Use LLM to extract entity mentions
      const completion = await openai.chat.completions.create({
        model: config.defaultModel || 'gpt-4o-mini',
        temperature: 0.1,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: `Extract entity names mentioned in the message.

Return JSON:
{
  "entities": ["entity name 1", "entity name 2"]
}`
          },
          {
            role: 'user',
            content: message
          }
        ]
      });

      const response = JSON.parse(completion.choices[0]?.message?.content || '{}');
      const entityNames = response.entities || [];

      // Find entities in database
      const entities: any[] = [];
      for (const name of entityNames) {
        const userEntities = await omegaMemoryService.getEntities(userId);
        const match = userEntities.find(e =>
          e.primary_name.toLowerCase().includes(name.toLowerCase()) ||
          e.aliases.some((a: string) => a.toLowerCase().includes(name.toLowerCase()))
        );
        if (match) {
          entities.push(match);
        }
      }

      return entities;
    } catch (error) {
      logger.error({ err: error }, 'Failed to resolve entities from message');
      return [];
    }
  }

  /**
   * Check if claims have multiple perspectives
   */
  private async hasMultiplePerspectives(claims: any[], userId: string): Promise<boolean> {
    try {
      for (const claim of claims.slice(0, 3)) {
        const pClaims = await perspectiveService.getPerspectiveClaims(claim.id, userId);
        if (pClaims.length > 1) {
          return true;
        }
      }
      return false;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get decision-relevant insights
   */
  private async getDecisionRelevantInsights(context: ChatContext): Promise<any[]> {
    // Get insights related to active entities
    const insights = await insightReflectionService.getInsights(context.user_id, {
      dismissed: false,
      limit: 10,
    });

    return insights.filter(insight =>
      insight.related_entity_ids.some((id: string) => context.active_entity_ids.includes(id))
    );
  }

  /**
   * Get related decision memory (now uses decisionMemoryService)
   * Kept for backward compatibility
   */
  private async getRelatedDecisionMemory(context: ChatContext): Promise<any[]> {
    const decisions = await decisionMemoryService.getSimilarPastDecisions(
      context.user_id,
      {
        entity_ids: context.active_entity_ids,
      }
    );
    return decisions;
  }

  /**
   * Synthesize decision context
   */
  private async synthesizeDecisionContext(
    insights: any[],
    pastDecisions: any[],
    context: ChatContext
  ): Promise<string> {
    try {
      const completion = await openai.chat.completions.create({
        model: config.defaultModel || 'gpt-4o-mini',
        temperature: 0.3,
        messages: [
          {
            role: 'system',
            content: `You are a decision support system. Synthesize insights and past patterns to help with decision-making. Be non-prescriptive - show patterns, don't tell them what to do.`
          },
          {
            role: 'user',
            content: `Synthesize these insights and past patterns to help with decision-making:

Insights:
${JSON.stringify(insights.map(i => ({ title: i.title, description: i.description })), null, 2)}

Past Patterns:
${JSON.stringify(pastDecisions.map(d => ({ text: d.text })), null, 2)}

Provide a helpful synthesis that shows patterns without being prescriptive.`
          }
        ]
      });

      return completion.choices[0]?.message?.content || 'Unable to synthesize decision context.';
    } catch (error) {
      logger.error({ err: error }, 'Failed to synthesize decision context');
      return 'I can help you think through this decision based on your past patterns.';
    }
  }

  /**
   * Extract memory from message
   */
  private async extractMemoryFromMessage(message: string, userId: string): Promise<{
    entity: any;
    claim_text: string;
    confidence?: number;
    sentiment?: string;
    temporal_context?: any;
    perspective_id?: string;
  } | null> {
    try {
      const completion = await openai.chat.completions.create({
        model: config.defaultModel || 'gpt-4o-mini',
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: `Extract memory information from the message.

Return JSON:
{
  "entity_name": "entity name or 'self'",
  "claim_text": "the claim to remember",
  "confidence": 0.0-1.0,
  "sentiment": "POSITIVE" | "NEGATIVE" | "NEUTRAL" | "MIXED" | null
}`
          },
          {
            role: 'user',
            content: message
          }
        ]
      });

      const response = JSON.parse(completion.choices[0]?.message?.content || '{}');

      if (!response.entity_name || !response.claim_text) {
        return null;
      }

      // Find or create entity
      const entities = await omegaMemoryService.getEntities(userId);
      let entity = entities.find(e =>
        e.primary_name.toLowerCase() === response.entity_name.toLowerCase() ||
        e.aliases.some((a: string) => a.toLowerCase() === response.entity_name.toLowerCase())
      );

      if (!entity && response.entity_name.toLowerCase() === 'self') {
        // Use first entity or create a default
        entity = entities[0] || null;
      }

      if (!entity) {
        return null;
      }

      // Get default perspective
      const perspectives = await perspectiveService.getOrCreateDefaultPerspectives(userId);
      const selfPerspective = perspectives.find(p => p.type === 'SELF');

      return {
        entity,
        claim_text: response.claim_text,
        confidence: response.confidence || 0.6,
        sentiment: response.sentiment,
        perspective_id: selfPerspective?.id,
      };
    } catch (error) {
      logger.error({ err: error }, 'Failed to extract memory from message');
      return null;
    }
  }

  /**
   * Respond with uncertainty
   */
  private respondWithUncertainty(): ChatResponse {
    return {
      content: "I'm not sure how to help with that. Could you rephrase or ask something else?",
      response_mode: 'UNCERTAINTY_NOTICE',
      confidence: 0.0,
    };
  }

  /**
   * Get or create session
   */
  private async getOrCreateSession(userId: string, sessionId?: string): Promise<ChatSession> {
    if (sessionId) {
      const { data } = await supabaseAdmin
        .from('chat_sessions')
        .select('*')
        .eq('user_id', userId)
        .eq('session_id', sessionId)
        .single();

      if (data) {
        return data;
      }
    }

    const newSessionId = sessionId || crypto.randomUUID();
    const { data, error } = await supabaseAdmin
      .from('chat_sessions')
      .insert({
        user_id: userId,
        session_id: newSessionId,
      })
      .select()
      .single();

    if (error) {
      throw error;
    }

    return data;
  }

  /**
   * Get or create context
   */
  private async getOrCreateContext(userId: string, sessionId: string): Promise<ChatContext> {
    const { data: existing } = await supabaseAdmin
      .from('chat_contexts')
      .select('*')
      .eq('user_id', userId)
      .eq('session_id', sessionId)
      .single();

    if (existing) {
      return existing;
    }

    const { data, error } = await supabaseAdmin
      .from('chat_contexts')
      .insert({
        user_id: userId,
        session_id: sessionId,
      })
      .select()
      .single();

    if (error) {
      throw error;
    }

    return data;
  }

  /**
   * Update context
   */
  private async updateContext(
    userId: string,
    sessionId: string,
    updates: Partial<ChatContext>
  ): Promise<void> {
    await supabaseAdmin
      .from('chat_contexts')
      .update(updates)
      .eq('user_id', userId)
      .eq('session_id', sessionId);
  }

  /**
   * Save message and return message ID
   */
  private async saveMessage(
    userId: string,
    sessionId: string,
    role: 'user' | 'assistant' | 'system',
    content: string,
    responseMode?: ResponseMode,
    citations?: string[],
    confidence?: number
  ): Promise<string> {
    const { data: message, error } = await supabaseAdmin
      .from('chat_messages')
      .insert({
        user_id: userId,
        session_id: sessionId,
        role,
        content,
        response_mode: responseMode,
        citations: citations || [],
        confidence,
      })
      .select('id')
      .single();

    if (error) {
      throw error;
    }

    return message.id;
  }

  /**
   * Ingest user message asynchronously (fire-and-forget)
   */
  private async ingestUserMessageAsync(
    userId: string,
    messageId: string,
    sessionId: string,
    messageText: string
  ): Promise<void> {
    // Get recent conversation history for context
    const recentMessages = await this.getRecentMessages(userId, sessionId, 10);

    // Ingest through pipeline
    await conversationIngestionPipeline.ingestFromChatMessage(
      userId,
      messageId,
      sessionId,
      recentMessages
    );
  }

  /**
   * Get recent messages for conversation context
   */
  private async getRecentMessages(
    userId: string,
    sessionId: string,
    limit: number = 10
  ): Promise<Array<{ role: 'user' | 'assistant'; content: string }>> {
    try {
      const { data: messages } = await supabaseAdmin
        .from('chat_messages')
        .select('role, content')
        .eq('user_id', userId)
        .eq('session_id', sessionId)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (!messages) {
        return [];
      }

      return messages
        .reverse()
        .map(msg => ({
          role: msg.role as 'user' | 'assistant',
          content: msg.content,
        }));
    } catch (error) {
      logger.warn({ error, userId, sessionId }, 'Failed to get recent messages for context');
      return [];
    }
  }

  /**
   * Get chat history
   */
  async getChatHistory(userId: string, sessionId: string, limit: number = 50): Promise<ChatMessage[]> {
    try {
      const { data, error } = await supabaseAdmin
        .from('chat_messages')
        .select('*')
        .eq('user_id', userId)
        .eq('session_id', sessionId)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) {
        throw error;
      }

      return (data || []).reverse(); // Return in chronological order
    } catch (error) {
      logger.error({ err: error, userId, sessionId }, 'Failed to get chat history');
      throw error;
    }
  }
}

export const conversationalOrchestrationService = new ConversationalOrchestrationService();

