/**
 * Event Extraction Service
 * 
 * Extracts structured event data from journaling messages.
 * Creates event_records, narrative_accounts, event_emotions, event_cognitions, event_identity_impacts
 */

import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';
import { openai } from '../openaiClient';

export interface ExtractedEvent {
  event_date: string;
  event_date_end?: string;
  location_ids: string[];
  participant_ids: string[];
  tags: string[];
  narrative_text: string;
  emotions: Array<{
    emotion: string;
    intensity: number;
    timestamp_offset?: number;
  }>;
  cognitions: Array<{
    cognition_type: 'belief' | 'insecurity_triggered' | 'realization' | 'question' | 'doubt';
    content: string;
  }>;
  identity_impacts: Array<{
    impact_type: 'reinforced' | 'challenged' | 'shifted' | 'clarified';
    identity_aspect?: string;
  }>;
}

class EventExtractionService {
  /**
   * Extract event structure from journaling message
   * Fire-and-forget, non-blocking
   */
  async extractEventStructure(
    userId: string,
    message: string,
    messageId: string
  ): Promise<void> {
    try {
      // Extract structured data using LLM
      const extracted = await this.extractWithLLM(message);

      // Check if message contains multiple actions that should be extracted
      const actions = this.extractActionsFromNarrative(message);

      // Create event record (experience)
      const isDump = message.length > 500 || this.isDumpLanguage(message);
      const eventRecordId = await this.createEventRecord(userId, extracted, messageId, isDump);

      // If actions found, log them attached to this experience
      if (actions.length > 0) {
        const { actionLoggingService } = await import('../actionLogging/actionLoggingService');
        type ActionContext = import('../actionLogging/actionLoggingService').ActionContext;
        
        // Get message timestamp for context
        const messageTimestamp = await this.getMessageTimestamp(messageId);
        
        // Build context with experience ID and message timestamp
        const context: ActionContext = {
          messageTimestamp: messageTimestamp || undefined,
          experienceId: eventRecordId,
        };
        
        for (const action of actions) {
          try {
            await actionLoggingService.logAction(userId, action.text, messageId, context);
          } catch (err) {
            logger.warn({ err, action: action.text }, 'Failed to log action from narrative (non-blocking)');
          }
        }
      }

      // Create narrative account (at_the_time perspective)
      await this.createNarrativeAccount(userId, eventRecordId, extracted.narrative_text, messageId);

      // Create emotion records
      for (const emotion of extracted.emotions) {
        await this.createEmotionRecord(userId, eventRecordId, emotion, messageId);
      }

      // Create cognition records
      for (const cognition of extracted.cognitions) {
        await this.createCognitionRecord(userId, eventRecordId, cognition, messageId);
      }

      // Create identity impact records and link to identity dimensions
      for (const impact of extracted.identity_impacts) {
        await this.createIdentityImpactRecord(userId, eventRecordId, impact, messageId);
        
        // Link experience to identity dimensions (fire-and-forget)
        this.linkExperienceToIdentityDimensions(userId, eventRecordId, impact).catch(err => {
          logger.debug({ err, eventRecordId }, 'Failed to link experience to identity dimensions');
        });
      }

      logger.debug({ userId, eventRecordId, actionsCount: actions.length }, 'Event structure extracted and stored');
    } catch (error) {
      logger.error({ err: error, userId, messageId }, 'Failed to extract event structure');
      throw error;
    }
  }

  /**
   * Extract structured data using LLM
   */
  private async extractWithLLM(message: string): Promise<ExtractedEvent> {
    const prompt = `Extract structured event data from this journal entry:

"${message}"

Respond with JSON:
{
  "event_date": "ISO date string",
  "event_date_end": "ISO date string or null",
  "location_ids": [],
  "participant_ids": [],
  "tags": ["music", "conflict", "intimacy", "danger", "joy", etc.],
  "narrative_text": "chronological story of what happened",
  "emotions": [
    {
      "emotion": "emotion name",
      "intensity": 0.0-1.0,
      "timestamp_offset": seconds from event start
    }
  ],
  "cognitions": [
    {
      "cognition_type": "belief|insecurity_triggered|realization|question|doubt",
      "content": "the thought or belief"
    }
  ],
  "identity_impacts": [
    {
      "impact_type": "reinforced|challenged|shifted|clarified",
      "identity_aspect": "e.g., 'I am creative'"
    }
  ]
}`;

    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        temperature: 0.3,
        max_tokens: 2000,
      });

      const result = JSON.parse(response.choices[0].message.content || '{}');
      
      // Validate and set defaults
      return {
        event_date: result.event_date || new Date().toISOString(),
        event_date_end: result.event_date_end || undefined,
        location_ids: result.location_ids || [],
        participant_ids: result.participant_ids || [],
        tags: result.tags || [],
        narrative_text: result.narrative_text || message,
        emotions: result.emotions || [],
        cognitions: result.cognitions || [],
        identity_impacts: result.identity_impacts || [],
      };
    } catch (error) {
      logger.warn({ err: error }, 'LLM event extraction failed, using fallback');
      // Fallback: minimal extraction
      return {
        event_date: new Date().toISOString(),
        location_ids: [],
        participant_ids: [],
        tags: [],
        narrative_text: message,
        emotions: [],
        cognitions: [],
        identity_impacts: [],
      };
    }
  }

  /**
   * Create event record
   */
  private async createEventRecord(
    userId: string,
    extracted: ExtractedEvent,
    sourceMessageId: string,
    isOpen: boolean = false
  ): Promise<string> {
    const { data, error } = await supabaseAdmin
      .from('event_records')
      .insert({
        user_id: userId,
        event_date: extracted.event_date,
        event_date_end: extracted.event_date_end,
        location_ids: extracted.location_ids,
        participant_ids: extracted.participant_ids,
        tags: extracted.tags,
        source_message_id: sourceMessageId,
        is_open: isOpen,
        metadata: {},
      })
      .select('id')
      .single();

    if (error) {
      throw error;
    }

    return data.id;
  }

  /**
   * Extract atomic actions from narrative text
   * Pattern: sentences starting with "I [verb]" or "[Person] [verb]"
   */
  private extractActionsFromNarrative(narrative: string): Array<{ text: string; verb: string }> {
    // Common action verbs
    const verbs = [
      'said', 'told', 'asked', 'walked', 'left', 'froze', 'decided', 'felt', 'noticed', 'realized', 
      'thought', 'did', 'laughed', 'looked', 'smiled', 'nodded', 'shook', 'waved', 'hugged', 'kissed', 
      'pushed', 'pulled', 'grabbed', 'dropped', 'threw', 'caught', 'opened', 'closed', 'started', 
      'stopped', 'finished', 'began', 'continued', 'paused', 'waited', 'stood', 'sat', 'lay', 'ran', 
      'jumped', 'fell', 'climbed', 'swam', 'drove', 'rode', 'flew', 'sang', 'danced', 'played', 
      'worked', 'studied', 'read', 'wrote', 'drew', 'painted', 'cooked', 'ate', 'drank', 'slept', 
      'woke', 'dreamed', 'remembered', 'forgot', 'understood', 'learned', 'taught', 'helped', 'hurt', 
      'healed', 'grew', 'changed', 'stayed', 'arrived', 'returned', 'went', 'came', 'met', 'saw', 
      'heard', 'listened', 'watched', 'found', 'lost', 'won', 'bought', 'sold', 'gave', 'received', 
      'took', 'put', 'placed', 'moved', 'remained', 'kept', 'held', 'released', 'let', 'made', 
      'created', 'built', 'destroyed', 'fixed', 'broke', 'cleaned', 'dirtied', 'filled', 'emptied'
    ];
    
    // Pattern: sentences that start with "I [verb]" or "[Person] [verb]"
    const verbPattern = verbs.join('|');
    const actionPattern = new RegExp(`(?:^|\\. )([A-Z][^.]*(?:${verbPattern})[^.]*)`, 'gi');
    const matches = [...narrative.matchAll(actionPattern)];
    
    return matches.map(match => {
      const text = match[1].trim();
      const verbMatch = text.match(new RegExp(`\\b(${verbPattern})\\b`, 'i'));
      return {
        text,
        verb: verbMatch ? verbMatch[1].toLowerCase() : 'noted',
      };
    });
  }

  /**
   * Check if message uses dump language
   */
  private isDumpLanguage(message: string): boolean {
    const dumpPatterns = [
      /here's everything/i,
      /here's what happened/i,
      /dumping/i,
      /let me tell you/i,
      /here's the whole/i,
    ];
    return dumpPatterns.some(pattern => pattern.test(message));
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

  /**
   * Close an experience (for future use)
   */
  async closeExperience(userId: string, experienceId: string): Promise<void> {
    try {
      const { error } = await supabaseAdmin
        .from('event_records')
        .update({
          is_open: false,
          closed_at: new Date().toISOString(),
        })
        .eq('id', experienceId)
        .eq('user_id', userId);

      if (error) {
        throw error;
      }

      logger.debug({ userId, experienceId }, 'Experience closed');
    } catch (error) {
      logger.error({ err: error, userId, experienceId }, 'Failed to close experience');
      throw error;
    }
  }

  /**
   * Create narrative account
   */
  private async createNarrativeAccount(
    userId: string,
    eventRecordId: string,
    narrativeText: string,
    sourceMessageId: string
  ): Promise<void> {
    const { error } = await supabaseAdmin
      .from('narrative_accounts')
      .insert({
        user_id: userId,
        event_record_id: eventRecordId,
        account_type: 'at_the_time',
        narrative_text: narrativeText,
        recorded_at: new Date().toISOString(),
        metadata: {
          source_message_id: sourceMessageId,
        },
      });

    if (error) {
      logger.warn({ err: error }, 'Failed to create narrative account');
    }
  }

  /**
   * Create emotion record
   */
  private async createEmotionRecord(
    userId: string,
    eventRecordId: string,
    emotion: ExtractedEvent['emotions'][0],
    sourceMessageId: string
  ): Promise<void> {
    const { error } = await supabaseAdmin
      .from('event_emotions')
      .insert({
        user_id: userId,
        event_record_id: eventRecordId,
        emotion: emotion.emotion,
        intensity: emotion.intensity,
        timestamp_offset: emotion.timestamp_offset,
        metadata: {
          source_message_id: sourceMessageId,
        },
      });

    if (error) {
      logger.warn({ err: error }, 'Failed to create emotion record');
    }
  }

  /**
   * Create cognition record
   */
  private async createCognitionRecord(
    userId: string,
    eventRecordId: string,
    cognition: ExtractedEvent['cognitions'][0],
    sourceMessageId: string
  ): Promise<void> {
    const { error } = await supabaseAdmin
      .from('event_cognitions')
      .insert({
        user_id: userId,
        event_record_id: eventRecordId,
        cognition_type: cognition.cognition_type,
        content: cognition.content,
        metadata: {
          source_message_id: sourceMessageId,
        },
      });

    if (error) {
      logger.warn({ err: error }, 'Failed to create cognition record');
    }
  }

  /**
   * Create identity impact record
   */
  private async createIdentityImpactRecord(
    userId: string,
    eventRecordId: string,
    impact: ExtractedEvent['identity_impacts'][0],
    sourceMessageId: string
  ): Promise<void> {
    const { error } = await supabaseAdmin
      .from('event_identity_impacts')
      .insert({
        user_id: userId,
        event_record_id: eventRecordId,
        impact_type: impact.impact_type,
        identity_aspect: impact.identity_aspect,
        metadata: {
          source_message_id: sourceMessageId,
        },
      });

    if (error) {
      logger.warn({ err: error }, 'Failed to create identity impact record');
    }
  }

  /**
   * Link experience to identity dimensions based on identity impact
   */
  private async linkExperienceToIdentityDimensions(
    userId: string,
    eventRecordId: string,
    impact: ExtractedEvent['identity_impacts'][0]
  ): Promise<void> {
    try {
      // Get user's identity dimensions
      const { IdentityStorage } = await import('../identityCore/identityStorage');
      const identityStorage = new IdentityStorage();
      const profiles = await identityStorage.getProfiles(userId);
      const latestProfile = profiles[0];

      if (!latestProfile || !latestProfile.dimensions) {
        return; // No dimensions to link
      }

      // Find matching dimension based on identity aspect
      if (impact.identity_aspect) {
        const aspectLower = impact.identity_aspect.toLowerCase();
        const matchingDimensions = latestProfile.dimensions.filter((dim: any) => {
          const dimNameLower = dim.name.toLowerCase();
          // Check if identity aspect mentions dimension name or related concepts
          return aspectLower.includes(dimNameLower) || 
                 this.identityAspectMatchesDimension(aspectLower, dimNameLower);
        });

        // Store link in event metadata (could create separate table later)
        if (matchingDimensions.length > 0) {
          await supabaseAdmin
            .from('event_records')
            .update({
              metadata: {
                identity_dimensions: matchingDimensions.map((d: any) => d.name),
                identity_impact_type: impact.impact_type,
              }
            })
            .eq('id', eventRecordId)
            .then(({ error }) => {
              if (error) {
                logger.debug({ error, eventRecordId }, 'Failed to update event with identity dimensions');
              }
            });
        }
      }
    } catch (error) {
      logger.debug({ error, eventRecordId }, 'Failed to link experience to identity dimensions');
      // Don't throw - this is non-critical
    }
  }

  /**
   * Check if identity aspect text matches a dimension
   */
  private identityAspectMatchesDimension(aspect: string, dimensionName: string): boolean {
    // Simple keyword matching (can be enhanced with embeddings)
    const dimensionKeywords: Record<string, string[]> = {
      'warrior': ['fight', 'strength', 'battle', 'overcome', 'defend'],
      'creator': ['create', 'build', 'make', 'art', 'design', 'craft'],
      'explorer': ['explore', 'discover', 'learn', 'curious', 'adventure'],
      'guardian': ['protect', 'care', 'help', 'support', 'nurture'],
      'sage': ['wisdom', 'knowledge', 'teach', 'understand', 'insight'],
      'lover': ['love', 'connection', 'intimacy', 'passion', 'affection'],
      'hero': ['save', 'rescue', 'help others', 'impact', 'difference'],
      'seeker': ['search', 'find', 'quest', 'purpose', 'meaning'],
    };

    const keywords = dimensionKeywords[dimensionName.toLowerCase()] || [];
    return keywords.some(keyword => aspect.includes(keyword));
  }
}

export const eventExtractionService = new EventExtractionService();
