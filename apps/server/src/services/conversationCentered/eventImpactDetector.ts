// =====================================================
// EVENT IMPACT DETECTOR
// Purpose: Detect how events affect the user even if they're not direct participants
// =====================================================

import OpenAI from 'openai';

import { config } from '../../config';
import { logger } from '../../logger';
import { supabaseAdmin } from '../../supabaseClient';

const openai = new OpenAI({ apiKey: config.openAiKey });

export type ImpactType =
  | 'direct_participant'
  | 'indirect_affected'
  | 'related_person_affected'
  | 'observer'
  | 'ripple_effect';

export type EventImpact = {
  eventId: string;
  impactType: ImpactType;
  connectionCharacterId?: string;
  connectionType?: string;
  emotionalImpact?: 'positive' | 'negative' | 'neutral' | 'mixed';
  impactIntensity: number;
  impactDescription: string;
  confidence: number;
  sourceMessageIds: string[];
  sourceJournalEntryIds: string[];
};

export class EventImpactDetector {
  /**
   * Detect how an event impacts the user
   * Called after event assembly
   */
  async detectEventImpact(
    userId: string,
    eventId: string,
    event: {
      people: string[];
      locations: string[];
      title: string;
      summary: string;
    },
    sourceMessages: Array<{ id: string; content: string }>,
    sourceJournalEntries: Array<{ id: string; content: string }>
  ): Promise<EventImpact | null> {
    try {
      // Check if user is direct participant
      const userCharacter = await this.getUserCharacter(userId);
      if (userCharacter && event.people.includes(userCharacter.id)) {
        const impact: EventImpact = {
          eventId,
          impactType: 'direct_participant',
          impactIntensity: 1.0,
          impactDescription: 'You were directly involved in this event',
          confidence: 0.9,
          sourceMessageIds: sourceMessages.map(m => m.id),
          sourceJournalEntryIds: sourceJournalEntries.map(e => e.id),
        };

        await this.saveEventImpact(userId, impact);
        return impact;
      }

      // Check for indirect impacts using LLM
      const impact = await this.analyzeIndirectImpact(
        userId,
        event,
        sourceMessages,
        sourceJournalEntries
      );

      if (impact) {
        impact.eventId = eventId;
        // Save impact to database
        await this.saveEventImpact(userId, impact);
        return impact;
      }

      return null;
    } catch (error) {
      logger.error({ error, userId, eventId }, 'Failed to detect event impact');
      return null;
    }
  }

  /**
   * Analyze indirect impact using LLM
   */
  private async analyzeIndirectImpact(
    userId: string,
    event: { title: string; summary: string; people: string[] },
    sourceMessages: Array<{ id: string; content: string }>,
    sourceJournalEntries: Array<{ id: string; content: string }>
  ): Promise<EventImpact | null> {
    try {
      // Get character names for context
      const characterNames = await this.getCharacterNames(userId, event.people);

      const context = [
        ...sourceMessages.map(m => `Message: ${m.content}`),
        ...sourceJournalEntries.map(e => `Journal: ${e.content}`),
      ].join('\n\n');

      // If no context, skip analysis
      if (!context.trim()) {
        return null;
      }

      const completion = await openai.chat.completions.create({
        model: config.defaultModel,
        temperature: 0.3,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: `Analyze how an event affects the user, even if they weren't directly involved.

Event: "${event.title}"
${event.summary ? `Summary: ${event.summary}` : ''}
People involved: ${characterNames.join(', ') || 'Unknown'}

Context from user's messages/journal:
${context}

Determine:
1. Impact type:
   - "direct_participant": User was directly in the event
   - "indirect_affected": User is affected but not present (emotional impact, consequences)
   - "related_person_affected": Someone close to user is in the event
   - "observer": User talks about it but not affected
   - "ripple_effect": Event creates consequences for user later

2. If "related_person_affected", identify who connects the user (character name)

3. Emotional impact: positive, negative, neutral, or mixed

4. Impact intensity: 0.0-1.0 (how much does this affect the user)

5. Impact description: Brief explanation of how/why this affects the user

Return JSON:
{
  "impactType": "indirect_affected" | "related_person_affected" | "observer" | "ripple_effect",
  "connectionCharacterName": "character name or null",
  "emotionalImpact": "positive" | "negative" | "neutral" | "mixed",
  "impactIntensity": 0.0-1.0,
  "impactDescription": "brief explanation",
  "confidence": 0.0-1.0
}

If no clear impact, return {"impactType": null, "confidence": 0.0}.`,
          },
          {
            role: 'user',
            content: 'Analyze the impact:',
          },
        ],
      });

      const response = completion.choices[0]?.message?.content;
      if (!response) {
        return null;
      }

      const parsed = JSON.parse(response);

      if (!parsed.impactType || parsed.confidence < 0.5) {
        return null;
      }

      // Resolve connection character if provided
      let connectionCharacterId: string | undefined;
      if (parsed.connectionCharacterName) {
        const character = await this.findCharacterByName(userId, parsed.connectionCharacterName);
        connectionCharacterId = character?.id;
      }

      return {
        eventId: '', // Will be set by caller
        impactType: parsed.impactType as ImpactType,
        connectionCharacterId,
        connectionType: this.inferConnectionType(parsed.connectionCharacterName),
        emotionalImpact: parsed.emotionalImpact,
        impactIntensity: parsed.impactIntensity || 0.5,
        impactDescription: parsed.impactDescription || '',
        confidence: parsed.confidence || 0.7,
        sourceMessageIds: sourceMessages.map(m => m.id),
        sourceJournalEntryIds: sourceJournalEntries.map(e => e.id),
      };
    } catch (error) {
      logger.debug({ error }, 'Failed to analyze indirect impact');
      return null;
    }
  }

  /**
   * Get user's character record
   * Checks if there's a character representing the user themselves
   */
  private async getUserCharacter(userId: string): Promise<{ id: string } | null> {
    try {
      // Look for a character that might represent the user
      // Common patterns: user's name, "me", "myself", or character with user_id in metadata
      const { data: characters } = await supabaseAdmin
        .from('characters')
        .select('id, name, metadata')
        .eq('user_id', userId)
        .limit(50); // Check recent characters

      if (!characters || characters.length === 0) {
        return null;
      }

      // Check for self-referential patterns
      const selfPatterns = ['me', 'myself', 'i', 'self'];
      const selfCharacter = characters.find(
        c =>
          selfPatterns.some(pattern => c.name.toLowerCase().includes(pattern)) ||
          c.metadata?.is_self === true ||
          c.metadata?.is_user === true
      );

      return selfCharacter ? { id: selfCharacter.id } : null;
    } catch (error) {
      logger.debug({ error, userId }, 'Failed to get user character');
      return null;
    }
  }

  /**
   * Get character names from IDs
   */
  private async getCharacterNames(userId: string, characterIds: string[]): Promise<string[]> {
    if (characterIds.length === 0) {
      return [];
    }

    try {
      const { data: characters } = await supabaseAdmin
        .from('characters')
        .select('name')
        .eq('user_id', userId)
        .in('id', characterIds);

      return characters?.map(c => c.name) || [];
    } catch (error) {
      logger.debug({ error, characterIds }, 'Failed to get character names');
      return [];
    }
  }

  /**
   * Find character by name
   */
  private async findCharacterByName(userId: string, name: string): Promise<{ id: string } | null> {
    try {
      const { data: character } = await supabaseAdmin
        .from('characters')
        .select('id')
        .eq('user_id', userId)
        .ilike('name', `%${name}%`)
        .limit(1)
        .single();

      return character || null;
    } catch (error) {
      logger.debug({ error, name }, 'Failed to find character by name');
      return null;
    }
  }

  /**
   * Infer connection type from character name/context
   */
  private inferConnectionType(characterName?: string): string | undefined {
    if (!characterName) {
      return undefined;
    }

    // Simple heuristic - could be enhanced with relationship data
    const nameLower = characterName.toLowerCase();
    if (
      nameLower.includes('mom') ||
      nameLower.includes('dad') ||
      nameLower.includes('parent') ||
      nameLower.includes('mother') ||
      nameLower.includes('father') ||
      nameLower.includes('abuela') ||
      nameLower.includes('abuelo') ||
      nameLower.includes('grandma') ||
      nameLower.includes('grandpa') ||
      nameLower.includes('tia') ||
      nameLower.includes('tio') ||
      nameLower.includes('primo') ||
      nameLower.includes('prima')
    ) {
      return 'family';
    }
    if (nameLower.includes('friend') || nameLower.includes('buddy')) {
      return 'friend';
    }
    if (nameLower.includes('colleague') || nameLower.includes('coworker')) {
      return 'colleague';
    }

    return 'unknown';
  }

  /**
   * Save event impact to database
   */
  private async saveEventImpact(userId: string, impact: EventImpact): Promise<void> {
    try {
      await supabaseAdmin
        .from('event_impacts')
        .insert({
          user_id: userId,
          event_id: impact.eventId,
          impact_type: impact.impactType,
          connection_character_id: impact.connectionCharacterId,
          connection_type: impact.connectionType,
          emotional_impact: impact.emotionalImpact,
          impact_intensity: impact.impactIntensity,
          impact_description: impact.impactDescription,
          confidence: impact.confidence,
          source_message_ids: impact.sourceMessageIds,
          source_journal_entry_ids: impact.sourceJournalEntryIds,
        })
        .onConflict('user_id,event_id,impact_type')
        .merge(); // Update if exists
    } catch (error) {
      logger.error({ error, impact }, 'Failed to save event impact');
    }
  }

  /**
   * Get impacts for an event
   */
  async getEventImpacts(userId: string, eventId: string): Promise<EventImpact[]> {
    try {
      const { data: impacts } = await supabaseAdmin
        .from('event_impacts')
        .select('*')
        .eq('user_id', userId)
        .eq('event_id', eventId);

      if (!impacts) {
        return [];
      }

      return impacts.map(impact => ({
        eventId: impact.event_id,
        impactType: impact.impact_type as ImpactType,
        connectionCharacterId: impact.connection_character_id,
        connectionType: impact.connection_type,
        emotionalImpact: impact.emotional_impact as
          | 'positive'
          | 'negative'
          | 'neutral'
          | 'mixed'
          | undefined,
        impactIntensity: impact.impact_intensity,
        impactDescription: impact.impact_description || '',
        confidence: impact.confidence,
        sourceMessageIds: impact.source_message_ids || [],
        sourceJournalEntryIds: impact.source_journal_entry_ids || [],
      }));
    } catch (error) {
      logger.error({ error, userId, eventId }, 'Failed to get event impacts');
      return [];
    }
  }
}

export const eventImpactDetector = new EventImpactDetector();
