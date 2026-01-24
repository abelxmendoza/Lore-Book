/**
 * Action Logging Service
 * 
 * Logs atomic actions (verb-forward moments) and optionally attaches them to open experiences.
 */

import { randomUUID } from 'crypto';

import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';
import { timeEngine } from '../timeEngine';
import type { TimePrecision } from '../timeEngine';

export interface ExtractedAction {
  timestamp: string;
  verb: string;
  target?: string;
  content?: string;
  emotion?: string;
  location_id?: string;
  participant_ids?: string[];
  metadata?: {
    timestamp_source: 'explicit' | 'experience' | 'relative' | 'message' | 'conversation_context' | 'default';
    timestamp_confidence: number;
    timestamp_precision: TimePrecision;
    original_text?: string;
    note?: string;
    experience_id?: string;
  };
}

export interface ActionContext {
  messageTimestamp?: Date;
  experienceId?: string;
  conversationHistory?: Array<{ role: string; content: string; timestamp?: Date }>;
}

class ActionLoggingService {
  /**
   * Log an atomic action
   * Non-blocking, fire-and-forget
   */
  async logAction(
    userId: string,
    message: string,
    messageId: string,
    context?: ActionContext
  ): Promise<string> {
    try {
      // Check for open experience if not provided in context
      const activeExperienceId = context?.experienceId || await this.findOpenExperience(userId);
      
      // Build full context with experience ID
      const fullContext: ActionContext = {
        ...context,
        experienceId: activeExperienceId,
      };
      
      // Extract action structure with context
      const extracted = await this.extractAction(message, fullContext);
      
      // Create action record
      const { data, error } = await supabaseAdmin
        .from('actions')
        .insert({
          user_id: userId,
          timestamp: extracted.timestamp,
          verb: extracted.verb,
          target: extracted.target,
          content: extracted.content,
          emotion: extracted.emotion,
          location_id: extracted.location_id,
          participant_ids: extracted.participant_ids || [],
          experience_id: activeExperienceId,
          source_message_id: messageId,
          metadata: extracted.metadata || {},
        })
        .select('id')
        .single();
      
      if (error) {
        throw error;
      }
      
      logger.debug({ 
        userId, 
        actionId: data.id, 
        experienceId: activeExperienceId,
        timestampSource: extracted.metadata?.timestamp_source,
        timestampConfidence: extracted.metadata?.timestamp_confidence,
      }, 'Action logged');

      // Extract identity signals from action (fire-and-forget)
      this.extractIdentityFromAction(userId, message, data.id, extracted).catch(err => {
        logger.debug({ err, actionId: data.id }, 'Failed to extract identity from action');
      });

      return data.id;
    } catch (error) {
      logger.error({ err: error, userId, messageId }, 'Failed to log action');
      throw error;
    }
  }
  
  /**
   * Extract action structure from message with 6-layer timestamp inference
   * Pattern-based extraction (can be enhanced with LLM later)
   */
  private async extractAction(
    message: string,
    context?: ActionContext
  ): Promise<ExtractedAction> {
    // Common verb patterns for actions
    const verbs = [
      'said', 'told', 'asked', 'walked', 'left', 'froze', 'decided', 'felt', 'noticed', 'realized', 
      'thought', 'did', "didn't", "couldn't", "wouldn't", 'laughed', 'smiled', 'nodded', 'shook', 
      'waved', 'hugged', 'kissed', 'pushed', 'pulled', 'grabbed', 'dropped', 'threw', 'caught', 
      'opened', 'closed', 'started', 'stopped', 'finished', 'began', 'continued', 'paused', 'waited', 
      'stood', 'sat', 'lay', 'ran', 'jumped', 'fell', 'climbed', 'swam', 'drove', 'rode', 'flew', 
      'sang', 'danced', 'played', 'worked', 'studied', 'read', 'wrote', 'drew', 'painted', 'cooked', 
      'ate', 'drank', 'slept', 'woke', 'dreamed', 'remembered', 'forgot', 'understood', 'learned', 
      'taught', 'helped', 'hurt', 'healed', 'grew', 'changed', 'stayed', 'arrived', 'returned', 
      'went', 'came', 'met', 'saw', 'heard', 'listened', 'watched', 'looked', 'found', 'lost', 
      'won', 'bought', 'sold', 'gave', 'received', 'took', 'put', 'placed', 'moved', 'remained', 
      'kept', 'held', 'released', 'let', 'made', 'created', 'built', 'destroyed', 'fixed', 'broke', 
      'cleaned', 'dirtied', 'filled', 'emptied'
    ];
    
    // Build regex pattern
    const verbPattern = new RegExp(`^i (${verbs.join('|')})`, 'i');
    const match = message.match(verbPattern);
    
    if (!match) {
      // Fallback: treat as generic action
      const timestampResult = await this.inferTimestamp(message, context);
      return {
        timestamp: timestampResult.timestamp.toISOString(),
        verb: 'noted',
        content: message,
        metadata: timestampResult.metadata,
      };
    }
    
    const verb = match[1].toLowerCase();
    const rest = message.substring(match[0].length).trim();
    
    // Extract target if present ("I told him...", "I said to Sarah...")
    const targetMatch = rest.match(/^(him|her|them|to \w+|that)/i);
    const target = targetMatch ? targetMatch[0] : undefined;
    
    // Extract content for "said"/"told" verbs
    const contentMatch = rest.match(/["'](.+)["']|that (.+)/i);
    const content = contentMatch ? (contentMatch[1] || contentMatch[2]) : undefined;
    
    // Extract emotion if present ("I felt embarrassed", "I felt happy")
    const emotionMatch = message.match(/felt (\w+)|feeling (\w+)/i);
    const emotion = emotionMatch ? (emotionMatch[1] || emotionMatch[2]) : undefined;
    
    // Infer timestamp using 6-layer system
    const timestampResult = await this.inferTimestamp(message, context);
    
    return {
      timestamp: timestampResult.timestamp.toISOString(),
      verb,
      target,
      content: content || rest,
      emotion,
      metadata: timestampResult.metadata,
    };
  }

  /**
   * 6-Layer Timestamp Inference System
   * Infers timestamp with confidence metadata
   */
  private async inferTimestamp(
    message: string,
    context?: ActionContext
  ): Promise<{
    timestamp: Date;
    metadata: ExtractedAction['metadata'];
  }> {
    // Layer 1: Extract explicit time from message text
    const explicitTime = this.extractExplicitTime(message);
    if (explicitTime && explicitTime.confidence > 0.7) {
      return {
        timestamp: explicitTime.timestamp,
        metadata: {
          timestamp_source: 'explicit',
          timestamp_confidence: explicitTime.confidence,
          timestamp_precision: explicitTime.precision,
          original_text: explicitTime.originalText,
          note: 'Explicit time extracted from message text',
        },
      };
    }

    // Layer 2: If attached to experience, use experience time range
    const experienceId = context?.experienceId;
    if (experienceId) {
      const experienceTime = await this.getExperienceTimeRange(experienceId);
      if (experienceTime) {
        // Use midpoint or start of experience
        const inferredTime = experienceTime.end
          ? new Date((experienceTime.start.getTime() + experienceTime.end.getTime()) / 2)
          : experienceTime.start;
        return {
          timestamp: inferredTime,
          metadata: {
            timestamp_source: 'experience',
            timestamp_confidence: 0.8,
            timestamp_precision: 'minute',
            experience_id: experienceId,
            note: 'Inferred from experience time range',
          },
        };
      }
    }

    // Layer 3: Parse relative time expressions ("just now", "earlier", "yesterday")
    const relativeTime = timeEngine.parseTimestamp(message, undefined, false);
    if (relativeTime.confidence > 0.5 && relativeTime.type === 'relative') {
      return {
        timestamp: relativeTime.timestamp,
        metadata: {
          timestamp_source: 'relative',
          timestamp_confidence: relativeTime.confidence,
          timestamp_precision: relativeTime.precision,
          original_text: relativeTime.originalText,
          note: 'Parsed relative time expression',
        },
      };
    }

    // Layer 4: Use message timestamp (when user sent it)
    if (context?.messageTimestamp) {
      return {
        timestamp: context.messageTimestamp,
        metadata: {
          timestamp_source: 'message',
          timestamp_confidence: 0.6,
          timestamp_precision: 'second',
          note: 'Assumed action happened when message was sent',
        },
      };
    }

    // Layer 5: Use conversation context (previous messages)
    if (context?.conversationHistory && context.conversationHistory.length > 0) {
      const recentMessage = context.conversationHistory[context.conversationHistory.length - 1];
      if (recentMessage.timestamp) {
        // Assume action happened shortly before/after recent message
        const inferredTime = new Date(recentMessage.timestamp);
        inferredTime.setMinutes(inferredTime.getMinutes() - 5); // 5 min before
        return {
          timestamp: inferredTime,
          metadata: {
            timestamp_source: 'conversation_context',
            timestamp_confidence: 0.4,
            timestamp_precision: 'minute',
            note: 'Inferred from conversation flow',
          },
        };
      }
    }

    // Layer 6: Last resort - current time with low confidence
    return {
      timestamp: new Date(),
      metadata: {
        timestamp_source: 'default',
        timestamp_confidence: 0.2,
        timestamp_precision: 'second',
        note: 'No time information found, using current time',
      },
    };
  }

  /**
   * Extract explicit time from message text
   * Uses timeEngine to parse explicit dates/times
   */
  private extractExplicitTime(message: string): {
    timestamp: Date;
    confidence: number;
    precision: TimePrecision;
    originalText?: string;
  } | null {
    // Use timeEngine to extract explicit dates/times
    // Patterns: "yesterday", "last week", "at 3pm", "on Monday", "2 hours ago"
    const temporalRef = timeEngine.parseTimestamp(message, undefined, false);
    if (temporalRef.confidence > 0.7 && temporalRef.type !== 'fuzzy') {
      return {
        timestamp: temporalRef.timestamp,
        confidence: temporalRef.confidence,
        precision: temporalRef.precision,
        originalText: temporalRef.originalText,
      };
    }
    return null;
  }

  /**
   * Get experience time range from event_records
   */
  private async getExperienceTimeRange(experienceId: string): Promise<{
    start: Date;
    end?: Date;
  } | null> {
    try {
      const { data } = await supabaseAdmin
        .from('event_records')
        .select('event_date, event_date_end')
        .eq('id', experienceId)
        .single();
      
      if (!data) return null;
      
      return {
        start: new Date(data.event_date),
        end: data.event_date_end ? new Date(data.event_date_end) : undefined,
      };
    } catch (error) {
      logger.debug({ err: error, experienceId }, 'Failed to get experience time range');
      return null;
    }
  }
  
  /**
   * Find open experience for this user
   */
  private async findOpenExperience(userId: string): Promise<string | null> {
    try {
      const { data } = await supabaseAdmin
        .from('event_records')
        .select('id')
        .eq('user_id', userId)
        .eq('is_open', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
      
      return data?.id || null;
    } catch (error) {
      // No open experience found - that's fine, action can be standalone
      return null;
    }
  }

  /**
   * Extract identity signals from action
   * Detects identity-revealing actions (e.g., "I stood up for myself" → strength signal)
   */
  private async extractIdentityFromAction(
    userId: string,
    message: string,
    actionId: string,
    extracted: ExtractedAction
  ): Promise<void> {
    try {
      // Identity-revealing action patterns
      const identityPatterns = [
        { pattern: /stood up for|defended|protected|fought for/i, type: 'strength' as const, dimension: 'Warrior' },
        { pattern: /created|built|made|designed|crafted/i, type: 'strength' as const, dimension: 'Creator' },
        { pattern: /explored|discovered|learned|tried new/i, type: 'strength' as const, dimension: 'Explorer' },
        { pattern: /helped|supported|cared for|nurtured/i, type: 'strength' as const, dimension: 'Guardian' },
        { pattern: /taught|explained|shared knowledge/i, type: 'strength' as const, dimension: 'Sage' },
        { pattern: /loved|connected|showed affection/i, type: 'strength' as const, dimension: 'Lover' },
        { pattern: /saved|rescued|made a difference/i, type: 'strength' as const, dimension: 'Hero' },
        { pattern: /backed down|gave up|avoided conflict/i, type: 'weakness' as const, dimension: 'Shadow' },
        { pattern: /sabotaged|self-destructed|undermined/i, type: 'shadow' as const, dimension: 'Shadow' },
      ];

      for (const { pattern, type, dimension } of identityPatterns) {
        if (pattern.test(message)) {
          // Create identity signal from action
          const { IdentityStorage } = await import('../identityCore/identityStorage');
          const identityStorage = new IdentityStorage();
          
          const signal = {
            id: randomUUID(),
            type,
            text: message,
            evidence: message,
            timestamp: extracted.timestamp,
            weight: 0.6, // Actions are moderately weighted
            confidence: 0.7,
            memory_id: null, // Action is not a journal entry
            user_id: userId,
          };

          // Save signal
          await identityStorage.saveSignals(userId, [signal]);

          // Link to action in metadata
          await supabaseAdmin
            .from('actions')
            .update({
              metadata: {
                ...extracted.metadata,
                identity_signal_id: signal.id,
                identity_dimension: dimension,
              }
            })
            .eq('id', actionId)
            .then(({ error }) => {
              if (error) {
                logger.debug({ error, actionId }, 'Failed to update action with identity signal');
              }
            });

          logger.debug({ userId, actionId, dimension, signalType: type }, 'Identity signal extracted from action');
          break; // Only extract one signal per action
        }
      }
    } catch (error) {
      logger.debug({ error, actionId }, 'Failed to extract identity from action');
      // Don't throw - this is fire-and-forget
    }
  }
}

export const actionLoggingService = new ActionLoggingService();
