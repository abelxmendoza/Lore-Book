/**
 * Mode Handlers
 * 
 * Handlers for each of the 5 chat modes.
 * Each handler knows exactly what to do for its mode.
 */

import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';
import type { ChatMode } from './modeRouterService';
import type { StreamingChatResponse } from '../omegaChatService';

export interface ModeHandlerResponse {
  content: string;
  response_mode: string;
  confidence?: number;
  metadata?: Record<string, unknown>;
}

class ModeHandlers {
  /**
   * Handle message based on mode
   */
  async handleMode(
    mode: ChatMode,
    userId: string,
    message: string,
    options?: {
      messageId?: string;
      conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
      continuityContext?: string;
      threadId?: string;
    }
  ): Promise<ModeHandlerResponse> {
    switch (mode) {
      case 'EMOTIONAL_EXISTENTIAL':
        return await this.handleEmotionalExistential(userId, message);
      
      case 'MEMORY_RECALL':
        return await this.handleMemoryRecall(userId, message, options?.conversationHistory, options?.threadId);
      
      case 'NARRATIVE_RECALL':
        return await this.handleNarrativeRecall(userId, message);

      case 'NARRATIVE_STORY':
        return await this.handleNarrativeStory(userId, message);

      case 'FOUNDATION_RECALL':
        return await this.handleFoundationRecall(userId, message, options?.conversationHistory, options?.threadId);
      
      case 'EXPERIENCE_INGESTION':
        return await this.handleExperienceIngestion(userId, message, options?.messageId, options?.continuityContext);
      
      case 'ACTION_LOG':
        return await this.handleActionLog(userId, message, options);

      case 'NEEDS_CLARIFICATION':
        return await this.handleNeedsClarification(message);

      case 'MIXED':
        return {
          content: "I'm not sure if you're asking me to remember something, sharing a thought, or telling me about something that happened. Can you clarify?",
          response_mode: 'DISAMBIGUATION',
          confidence: 0.5,
        };
      
      case 'UNKNOWN':
      default:
        throw new Error('UNKNOWN mode should fall through to normal chat flow');
    }
  }

  /**
   * Mode 1: Emotional/Existential
   * NO memory check. Just classification + response.
   */
  private async handleEmotionalExistential(
    userId: string,
    message: string
  ): Promise<ModeHandlerResponse> {
    try {
      // Use thought classification service
      const { thoughtOrchestrationService } = await import('../thoughtOrchestration/thoughtOrchestrationService');
      const result = await thoughtOrchestrationService.processThought(userId, message);

      // Response posture already determined
      return {
        content: result.response.text,
        response_mode: 'EMOTIONAL_SUPPORT',
        confidence: result.classification.confidence,
        metadata: {
          thought_type: result.classification.type,
          posture: result.response.posture,
          insecurity_matches: result.insecurity_matches.length,
        },
      };
    } catch (error) {
      logger.error({ err: error, userId }, 'Failed to handle emotional/existential mode');
      // Fallback response
      return {
        content: "That's a lot to be carrying. What's sitting heaviest right now?",
        response_mode: 'EMOTIONAL_SUPPORT',
        confidence: 0.5,
      };
    }
  }

  /**
   * Mode 2b: Foundation Recall — explicit "Recall …" commands
   */
  private async handleFoundationRecall(
    userId: string,
    message: string,
    conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>,
    threadId?: string
  ): Promise<ModeHandlerResponse> {
    try {
      const { executeExplicitRecall } = await import('../chat/explicitRecallService');
      const result = await executeExplicitRecall(
        userId,
        message,
        conversationHistory?.map((m) => ({ role: m.role, content: m.content })) ?? [],
        { threadId: options?.threadId }
      );

      return {
        content: result.content,
        response_mode: result.response_mode,
        confidence: result.confidence,
        metadata: result.metadata,
      };
    } catch (error) {
      logger.error({ err: error, userId }, 'Failed to handle foundation recall mode');
      return {
        content: "Something went wrong pulling that up — what were you trying to recall?",
        response_mode: 'SILENCE',
        confidence: 0.5,
      };
    }
  }

  /**
   * Mode 2: Memory Recall (Factual)
   * Foundation lore first when the query matches structured recall patterns.
   */
  private async handleMemoryRecall(
    userId: string,
    message: string,
    conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>,
    threadId?: string
  ): Promise<ModeHandlerResponse> {
    try {
      const { matchesFoundationRecallQuery } = await import('../chat/recallIntentPatterns');
      if (matchesFoundationRecallQuery(message)) {
        const { executeExplicitRecall } = await import('../chat/explicitRecallService');
        const foundation = await executeExplicitRecall(
          userId,
          message,
          conversationHistory?.map((m) => ({ role: m.role, content: m.content })) ?? [],
          { threadId: options?.threadId }
        );
        if (foundation.response_mode !== 'SILENCE') {
          return {
            content: foundation.content,
            response_mode: foundation.response_mode,
            confidence: foundation.confidence,
            metadata: foundation.metadata,
          };
        }
      }

      const { memoryRecallEngine } = await import('../memoryRecall/memoryRecallEngine');
      
      const recallResult = await memoryRecallEngine.executeRecall({
        raw_text: message,
        user_id: userId,
        persona: 'ARCHIVIST', // Facts only
      });

      // Handle silence (doesn't know)
      if (recallResult.silence) {
        return {
          content: recallResult.silence.message,
          response_mode: 'SILENCE',
          confidence: 1.0,
          metadata: {
            reason: recallResult.silence.reason,
          },
        };
      }

      // Surface journal fragments even when confidence is low — never hide matches
      if (recallResult.confidence < 0.5 && recallResult.entries.length === 0) {
        const { executeExplicitRecall } = await import('../chat/explicitRecallService');
        const { buildDiagnosticRecall } = await import('../chat/failureAwareHandler');
        const foundation = await executeExplicitRecall(
          userId,
          message,
          conversationHistory?.map((m) => ({ role: m.role, content: m.content })) ?? [],
          { threadId }
        );
        if (foundation.response_mode !== 'SILENCE') {
          return {
            content: foundation.content,
            response_mode: foundation.response_mode,
            confidence: foundation.confidence,
            metadata: foundation.metadata,
          };
        }
        if ((conversationHistory?.length ?? 0) > 0) {
          const diagnostic = await buildDiagnosticRecall(userId, message, {
            conversationHistory: conversationHistory?.map((m) => ({ role: m.role, content: m.content })) ?? [],
            threadId,
          });
          return {
            content: diagnostic,
            response_mode: 'DIAGNOSTIC',
            confidence: 0.7,
            metadata: { recall_confidence: recallResult.confidence },
          };
        }
        return {
          content: "I don't have stored memories matching that yet. Tell me more and I'll add it to your record.",
          response_mode: 'LOW_CONFIDENCE_RECALL',
          confidence: recallResult.confidence,
          metadata: {
            recall_confidence: recallResult.confidence,
          },
        };
      }

      // Format recall response
      const { formatRecallChatResponse } = await import('../memoryRecall/recallChatFormatter');
      const formatted = formatRecallChatResponse(recallResult, 'ARCHIVIST');
      
      return {
        content: formatted.content || 'I found some memories related to that.',
        response_mode: formatted.response_mode || 'MEMORY_RECALL',
        confidence: formatted.confidence || recallResult.confidence,
        metadata: {
          recall_sources: formatted.recall_sources,
          recall_meta: formatted.recall_meta,
          confidence_label: formatted.confidence_label,
          disclaimer: formatted.disclaimer,
        },
      };
    } catch (error) {
      logger.error({ err: error, userId }, 'Failed to handle memory recall mode');
      return {
        content: "Something went wrong pulling that up — what were you trying to recall?",
        response_mode: 'SILENCE',
        confidence: 0.5,
      };
    }
  }

  /**
   * Mode 3: Narrative Recall (Complex Stories)
   * Must distinguish: event, perspective, later insight
   */
  private async handleNarrativeRecall(
    userId: string,
    message: string
  ): Promise<ModeHandlerResponse> {
    try {
      const { storyAccountService } = await import('../storyAccount/storyAccountService');
      
      // Extract story/event name from message
      const storyName = storyAccountService.extractStoryName(message);
      
      // Get all accounts of this story
      const accounts = await storyAccountService.getStoryAccounts(userId, storyName);

      if (accounts.length === 0) {
        // Phase 4.5: narrative fallback from journal_entries when story DB is empty
        const { narrativeFromJournalFallback } = await import('../narrativeRecall/narrativeRecallCorrection');
        const fallback = await narrativeFromJournalFallback(userId, storyName);
        if (fallback) {
          return {
            content: fallback.narrative,
            response_mode: 'NARRATIVE_RECALL',
            confidence: 0.8,
            metadata: { story_name: storyName, derived_from: fallback.derived_from },
          };
        }
        return {
          content: `I don't have much on "${storyName}" yet — what happened?`,
          response_mode: 'SILENCE',
          confidence: 1.0,
          metadata: { story_name: storyName },
        };
      }

      // Build multi-layered response
      const response = storyAccountService.buildNarrativeResponse(accounts);
      
      return {
        content: response,
        response_mode: 'NARRATIVE_RECALL',
        confidence: 0.9,
        metadata: {
          accounts_count: accounts.length,
          story_name: storyName,
        },
      };
    } catch (error) {
      logger.error({ err: error, userId }, 'Failed to handle narrative recall mode');
      return {
        content: "Something went wrong pulling that up — what's the story you're thinking of?",
        response_mode: 'SILENCE',
        confidence: 0.5,
      };
    }
  }

  /**
   * Mode 4: Experience Ingestion
   * Creates lived experiences (macro: duration, context, narrative arc)
   */
  private async handleExperienceIngestion(
    userId: string,
    message: string,
    messageId?: string,
    continuityContext?: string
  ): Promise<ModeHandlerResponse> {
    try {
      // Fire-and-forget: Extract and store experience structure
      if (messageId) {
        const { eventExtractionService } = await import('../eventExtraction/eventExtractionService');
        eventExtractionService.extractEventStructure(userId, message, messageId).catch(err => {
          logger.warn({ err }, 'Experience extraction failed (non-blocking)');
        });
      }

      // Check if it's a dump (large multi-part share)
      const isDump = message.length > 500 || /(here's everything|here's what happened|dumping|let me tell you|here's the whole)/i.test(message);

      // Use LLM for a warm, contextual acknowledgment
      try {
        const { openai } = await import('../../lib/openai');
        const { config } = await import('../../config');
        const basePrompt = isDump
          ? `You are LoreBook, a personal lore and memory AI. The user just shared a detailed experience. Acknowledge it warmly in 2-3 sentences — reflect something specific back from what they shared, confirm you've saved it to their lore, and optionally ask one light follow-up question. Be natural and conversational, not robotic.`
          : `You are LoreBook, a personal lore and memory AI. The user just shared a moment or experience from their life. Respond warmly in 1-2 sentences — reflect something specific back from what they shared, and confirm you've captured it. Be natural, curious, and conversational. You may ask a brief follow-up if it feels natural.`;
        // Returning to an idle thread: orient quietly to the resumed context
        const systemPrompt = continuityContext ? `${basePrompt}${continuityContext}` : basePrompt;
        const completion = await openai.chat.completions.create({
          model: config.chatModel,
          temperature: 0.75,
          max_tokens: 120,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: message },
          ],
        });
        const ackText = completion.choices[0]?.message?.content?.trim() || "Got it, I've captured this moment.";
        return {
          content: ackText,
          response_mode: 'INGESTION_ACK',
          confidence: 1.0,
          metadata: { processing: 'async', is_dump: isDump },
        };
      } catch {
        return {
          content: isDump
            ? "Got it — I'm capturing everything you shared. Take your time."
            : "Captured. I've added this to your lore.",
          response_mode: 'INGESTION_ACK',
          confidence: 0.9,
          metadata: { processing: 'async', is_dump: isDump },
        };
      }
    } catch (error) {
      logger.error({ err: error, userId }, 'Failed to handle experience ingestion mode');
      return {
        content: "Got it. I'm capturing this.",
        response_mode: 'INGESTION_ACK',
        confidence: 0.8,
      };
    }
  }

  /**
   * NEEDS_CLARIFICATION: Ambiguous milestone/achievement.
   * Ask what they mean before ingesting. No save, no ingest—client has it in conversationHistory.
   */
  private async handleNeedsClarification(message: string): Promise<ModeHandlerResponse> {
    const text = message.toLowerCase();
    // Try to extract "X" from "got X working" / "have X working" / "finally got X working"
    const gotMatch = text.match(/(?:got|have|got it) (\S+(?:\s+\S+){0,4}?) (?:working|to work)/i);
    const phrase = gotMatch ? gotMatch[1].trim() : null;

    let content: string;
    if (phrase) {
      if (/\b(chat|app|lorebook|lore book)\b/i.test(phrase)) {
        content = `What do you mean by getting ${phrase} working? Are you talking about getting Lore Book to respond, or something else you did?`;
      } else {
        content = `What do you mean by getting ${phrase} working? Are you talking about something in the app, or something you did or achieved?`;
      }
    } else {
      content = "What do you mean? Are you talking about the app, or something you did or achieved?";
    }

    return {
      content,
      response_mode: 'CLARIFY',
      confidence: 0.9,
      metadata: { clarification: true },
    };
  }

  /**
   * Mode 5: Action Log
   * Logs atomic actions (micro: verb-forward, instant)
   * Silent - no user interruption
   */
  private async handleActionLog(
    userId: string,
    message: string,
    options?: {
      messageId?: string;
      conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
    }
  ): Promise<ModeHandlerResponse> {
    try {
      // Fire-and-forget: Log the action (silently, no response needed)
      if (options?.messageId) {
        const { actionLoggingService } = await import('../actionLogging/actionLoggingService');
        type ActionContext = import('../actionLogging/actionLoggingService').ActionContext;
        
        // Get message timestamp
        const messageTimestamp = await this.getMessageTimestamp(options.messageId);
        
        // Build context with timestamps from conversation history
        // Note: conversation history doesn't have timestamps, but we can infer from message order
        const conversationHistory = options.conversationHistory?.map((msg, index) => ({
          role: msg.role,
          content: msg.content,
          timestamp: messageTimestamp 
            ? new Date(messageTimestamp.getTime() - ((options.conversationHistory!.length - index) * 60000))
            : undefined,
        })) || [];
        
        const context: ActionContext = {
          messageTimestamp: messageTimestamp || undefined,
          conversationHistory,
        };
        
        // logAction will find open experience internally if not provided
        actionLoggingService.logAction(userId, message, options.messageId, context).catch(err => {
          logger.warn({ err }, 'Action logging failed (non-blocking)');
        });
      }

      // Ask the AI for a brief, warm acknowledgment instead of a dead "Noted."
      try {
        const { openai } = await import('../../lib/openai');
        const { config } = await import('../../config');
        const ackCompletion = await openai.chat.completions.create({
          model: config.chatModel,
          temperature: 0.7,
          max_tokens: 80,
          messages: [
            {
              role: 'system',
              content: 'You are LoreBook, a lore-aware AI assistant. The user just logged a quick note or action. Acknowledge it briefly and warmly in 1-2 sentences. You may ask a light follow-up question if it would be natural. Do not be robotic.',
            },
            { role: 'user', content: message },
          ],
        });
        const ackText = ackCompletion.choices[0]?.message?.content?.trim() || 'Logged.';
        return {
          content: ackText,
          response_mode: 'SILENT_LOG',
          confidence: 0.9,
          metadata: { processing: 'async' },
        };
      } catch {
        return {
          content: 'Got it, logged.',
          response_mode: 'SILENT_LOG',
          confidence: 0.9,
          metadata: { processing: 'async' },
        };
      }
    } catch (error) {
      logger.error({ err: error, userId }, 'Failed to handle action log mode');
      return {
        content: 'Got it, logged.',
        response_mode: 'SILENT_LOG',
        confidence: 0.8,
      };
    }
  }

  /**
   * NARRATIVE_STORY: Build a narrative from the user's journal entries.
   * Calls StoryOfSelfEngine and returns structured story data + a text summary.
   */
  private async handleNarrativeStory(
    userId: string,
    _message: string
  ): Promise<ModeHandlerResponse> {
    try {
      const { supabaseAdmin: db } = await import('../supabaseClient');
      const { StoryOfSelfEngine } = await import('../storyOfSelf/storyOfSelfEngine');

      // Fetch recent entries (up to 200 for sufficient signal)
      const { data: rows } = await db
        .from('journal_entries')
        .select('*')
        .eq('user_id', userId)
        .order('date', { ascending: false })
        .limit(200);

      const entries = (rows ?? []) as any[];

      if (entries.length === 0) {
        return {
          content: "You're starting to build that story now. As you share — recurring people, places, what you're working on, what matters — LoreBook gradually accumulates the patterns that become your narrative. Share something from your life and it becomes part of your record.",
          response_mode: 'NARRATIVE_STORY',
          confidence: 1.0,
          metadata: { empty: true },
        };
      }

      const engine = new StoryOfSelfEngine();
      const story = await engine.process({ entries });

      // Build readable text summary
      const topThemes = story.themes
        .sort((a, b) => b.strength - a.strength)
        .slice(0, 3)
        .map(t => t.theme.replace(/_/g, ' '))
        .join(', ');

      const tpLines = story.turningPoints
        .slice(0, 3)
        .map(tp => `- **${tp.category}** (${tp.timestamp.substring(0, 7)}): ${tp.description}`)
        .join('\n');

      const arcLines = story.arcs
        .slice(0, 3)
        .map(arc => `**${arc.title}** *(${arc.era})*\n${arc.content}`)
        .join('\n\n');

      const content = [
        story.summary,
        '',
        `**Narrative Mode:** ${story.mode.mode.charAt(0).toUpperCase() + story.mode.mode.slice(1)}`,
        `**Core Themes:** ${topThemes}`,
        '',
        tpLines.length > 0 ? `**Turning Points:**\n${tpLines}` : null,
        '',
        arcLines.length > 0 ? `**Story Arcs:**\n${arcLines}` : null,
        '',
        story.voicePrint ? `*${story.voicePrint}*` : null,
      ]
        .filter(Boolean)
        .join('\n');

      return {
        content,
        response_mode: 'NARRATIVE_STORY',
        confidence: story.coherence.coherenceScore,
        metadata: {
          story,
          entry_count: entries.length,
          coherence_score: story.coherence.coherenceScore,
        },
      };
    } catch (error) {
      logger.error({ err: error, userId }, 'Failed to handle narrative story mode');
      return {
        content: "I wasn't able to build your narrative right now. Try again in a moment.",
        response_mode: 'NARRATIVE_STORY',
        confidence: 0.5,
      };
    }
  }

  /**
   * Get message timestamp from chat_messages table
   */
  private async getMessageTimestamp(messageId: string): Promise<Date | null> {
    try {
      const { data } = await supabaseAdmin
        .from('chat_messages')
        .select('created_at')
        .eq('id', messageId)
        .single();
      
      const row = data as any;
      if (!row?.created_at) {
        return null;
      }

      return new Date(row.created_at);
    } catch (error) {
      logger.debug({ err: error, messageId }, 'Failed to get message timestamp');
      return null;
    }
  }
}

export const modeHandlers = new ModeHandlers();
