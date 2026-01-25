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
    }
  ): Promise<ModeHandlerResponse> {
    switch (mode) {
      case 'EMOTIONAL_EXISTENTIAL':
        return await this.handleEmotionalExistential(userId, message);
      
      case 'MEMORY_RECALL':
        return await this.handleMemoryRecall(userId, message);
      
      case 'NARRATIVE_RECALL':
        return await this.handleNarrativeRecall(userId, message);
      
      case 'EXPERIENCE_INGESTION':
        return await this.handleExperienceIngestion(userId, message, options?.messageId);
      
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
        content: "I hear you. What's making you think that right now?",
        response_mode: 'EMOTIONAL_SUPPORT',
        confidence: 0.5,
      };
    }
  }

  /**
   * Mode 2: Memory Recall (Factual)
   * Hard rule: If it doesn't know, say exactly that.
   */
  private async handleMemoryRecall(
    userId: string,
    message: string
  ): Promise<ModeHandlerResponse> {
    try {
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

      // If low confidence, be explicit
      if (recallResult.confidence < 0.5) {
        return {
          content: "I don't have a clear record of that. If you want, you can tell me now and I'll remember it.",
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
        content: "I don't have a clear record of that. If you want, you can tell me now and I'll remember it.",
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
          content: `I don't have a record of "${storyName}". If you want, you can tell me about it now.`,
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
        content: "I don't have a clear record of that story. If you want, you can tell me about it now.",
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
    messageId?: string
  ): Promise<ModeHandlerResponse> {
    try {
      // Fire-and-forget: Extract and store experience structure
      if (messageId) {
        const { eventExtractionService } = await import('../eventExtraction/eventExtractionService');
        eventExtractionService.extractEventStructure(userId, message, messageId).catch(err => {
          logger.warn({ err }, 'Experience extraction failed (non-blocking)');
        });
      }

      // Check if it's a dump (mark experience as open)
      const isDump = message.length > 500 || /(here's everything|here's what happened|dumping|let me tell you|here's the whole)/i.test(message);
      
      // Minimal acknowledgment
      return {
        content: isDump 
          ? "Got it. I'm capturing everything. Take your time." 
          : "I've recorded this experience.",
        response_mode: 'INGESTION_ACK',
        confidence: 1.0,
        metadata: {
          processing: 'async',
          is_dump: isDump,
        },
      };
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

      // Minimal ack so the user sees a response (fully empty looks like "no reply")
      return {
        content: 'Noted.',
        response_mode: 'SILENT_LOG',
        confidence: 0.9,
        metadata: {
          processing: 'async',
        },
      };
    } catch (error) {
      logger.error({ err: error, userId }, 'Failed to handle action log mode');
      return {
        content: 'Noted.',
        response_mode: 'SILENT_LOG',
        confidence: 0.8,
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
      
      if (!data || !data.created_at) {
        return null;
      }
      
      return new Date(data.created_at);
    } catch (error) {
      logger.debug({ err: error, messageId }, 'Failed to get message timestamp');
      return null;
    }
  }
}

export const modeHandlers = new ModeHandlers();
