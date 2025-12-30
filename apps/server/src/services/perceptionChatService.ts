import { logger } from '../logger';
import { perceptionService, type CreatePerceptionEntryInput } from './perceptionService';
import { peoplePlacesService } from './peoplePlacesService';
import { openai } from './openaiClient';
import { config } from '../config';

export type PerceptionExtractionResult = {
  perceptions: Array<{
    subject_alias: string;
    subject_person_id?: string;
    content: string;
    source: 'overheard' | 'told_by' | 'rumor' | 'social_media' | 'intuition' | 'assumption';
    source_detail?: string;
    confidence_level: number;
    sentiment?: 'positive' | 'negative' | 'neutral' | 'mixed';
    impact_on_me: string;
    timestamp_heard?: string;
  }>;
  charactersCreated: Array<{ id: string; name: string }>;
  charactersLinked: Array<{ id: string; name: string }>;
  needsFraming: boolean;
};

/**
 * Service for extracting perceptions from chat/gossip conversations
 * Auto-detects perceptions, creates characters, and links information
 */
class PerceptionChatService {
  /**
   * Extract perceptions from a chat message
   * Auto-creates characters if needed and links to existing ones
   */
  async extractPerceptionsFromChat(
    userId: string,
    message: string,
    conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }> = []
  ): Promise<PerceptionExtractionResult> {
    try {
      // Use AI to detect perceptions in the message
      const completion = await openai.chat.completions.create({
        model: config.defaultModel,
        temperature: 0.3,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: `You are analyzing a conversation to extract perceptions (gossip, rumors, things heard about others).

HARD RULE: Lorebook records how I experienced and interpreted my life—not the objective truth of others.

Extract perceptions from the user's message. A perception is:
- Something they heard about someone else (gossip, rumor, secondhand info)
- Something they believe/assumed about someone
- Information from social media, overheard conversations, or told by others
- NOT direct experiences (those are memories/journal entries)

For each perception found, extract:
- subject_alias: The name/alias of the person this is about (REQUIRED - even if anonymized)
- content: The perception content (MUST be framed as "I heard that..." or "I believed that..." not "X did Y")
- source: How they learned this (overheard, told_by, rumor, social_media, intuition, assumption)
- source_detail: Optional detail (e.g., "told by Alex", "Instagram post")
- confidence_level: 0.0-1.0 (default 0.3 for low confidence, higher if more certain)
- sentiment: positive, negative, neutral, or mixed
- impact_on_me: REQUIRED - How did believing this affect my actions, emotions, or decisions? (Key insight lever)
- timestamp_heard: When they heard this (ISO date string, or current time if not specified)

Also detect:
- Any new characters mentioned (people not in their lorebook yet)
- Any existing characters this relates to

Return JSON:
{
  "perceptions": [
    {
      "subject_alias": "name or alias of person",
      "subject_person_id": "uuid if you can match to existing character, otherwise omit",
      "content": "I heard that [subject] did X...",
      "source": "overheard|told_by|rumor|social_media|intuition|assumption",
      "source_detail": "optional detail like 'told by Alex'",
      "confidence_level": 0.3,
      "sentiment": "positive|negative|neutral|mixed",
      "impact_on_me": "How did believing this affect me?",
      "timestamp_heard": "ISO date string"
    }
  ],
  "newCharacters": [
    {
      "name": "character name",
      "description": "brief description",
      "role": "friend|colleague|acquaintance|other"
    }
  ],
  "existingCharacterMatches": [
    {
      "name": "character name from message",
      "suggested_character_id": "uuid if you can match"
    }
  ],
  "needsFraming": true|false
}

IMPORTANT:
- Always frame content as "I heard that..." or "I believed that..." not objective facts
- If content is not perception-framed, set needsFraming: true
- impact_on_me is REQUIRED for every perception
- Default confidence_level to 0.3 (low) unless very certain
- If no perceptions found, return {"perceptions": [], "newCharacters": [], "existingCharacterMatches": [], "needsFraming": false}`
          },
          {
            role: 'user',
            content: `Message: ${message}\n\nConversation context:\n${conversationHistory.map(m => `${m.role}: ${m.content}`).join('\n')}`
          }
        ]
      });

      const parsed = JSON.parse(completion.choices[0]?.message?.content ?? '{}');
      const perceptions = Array.isArray(parsed.perceptions) ? parsed.perceptions : [];
      const newCharacters = Array.isArray(parsed.newCharacters) ? parsed.newCharacters : [];
      const existingCharacterMatches = Array.isArray(parsed.existingCharacterMatches) ? parsed.existingCharacterMatches : [];
      const needsFraming = parsed.needsFraming === true;

      // Get existing characters to match (from characters table)
      const { supabaseAdmin } = await import('./supabaseClient');
      const { data: existingCharactersData } = await supabaseAdmin
        .from('characters')
        .select('id, name')
        .eq('user_id', userId);
      const existingCharacters = (existingCharactersData || []).map(c => ({ id: c.id, name: c.name }));
      const charactersCreated: Array<{ id: string; name: string }> = [];
      const charactersLinked: Array<{ id: string; name: string }> = [];

      // Create new characters in characters table
      for (const newChar of newCharacters) {
        try {
          const { supabaseAdmin } = await import('./supabaseClient');
          const { v4: uuid } = await import('uuid');
          
          const characterId = uuid();
          const now = new Date().toISOString();
          const nameParts = newChar.name.split(' ');
          
          const { data: created, error } = await supabaseAdmin
            .from('characters')
            .insert({
              id: characterId,
              user_id: userId,
              name: newChar.name,
              first_name: nameParts[0] || newChar.name,
              last_name: nameParts.length > 1 ? nameParts.slice(1).join(' ') : null,
              summary: newChar.description || null,
              role: newChar.role || 'other',
              importance_level: 'minor',
              importance_score: 0,
              metadata: { 
                autoCreated: true, 
                createdFrom: 'perception_chat'
              },
              created_at: now,
              updated_at: now
            })
            .select('id, name')
            .single();
          
          if (!error && created) {
            charactersCreated.push({ id: created.id, name: created.name });
            logger.info({ userId, characterId: created.id, name: created.name }, 'Created character from perception chat');
          } else {
            logger.warn({ error, character: newChar }, 'Failed to create character from perception chat');
          }
        } catch (error) {
          logger.warn({ error, character: newChar }, 'Failed to create character from perception chat');
        }
      }

      // Match existing characters
      for (const match of existingCharacterMatches) {
        const found = existingCharacters.find(c => 
          c.name.toLowerCase() === match.name.toLowerCase() ||
          c.id === match.suggested_character_id
        );
        if (found) {
          charactersLinked.push({ id: found.id, name: found.name });
        }
      }

      // Link perceptions to characters
      for (const perception of perceptions) {
        // Try to find character by name
        if (!perception.subject_person_id) {
          const found = existingCharacters.find(c => 
            c.name.toLowerCase() === perception.subject_alias.toLowerCase()
          ) || charactersCreated.find(c => 
            c.name.toLowerCase() === perception.subject_alias.toLowerCase()
          );
          if (found) {
            perception.subject_person_id = found.id;
          }
        }
      }

      return {
        perceptions,
        charactersCreated,
        charactersLinked,
        needsFraming
      };
    } catch (error) {
      logger.error({ error, message }, 'Failed to extract perceptions from chat');
      return {
        perceptions: [],
        charactersCreated: [],
        charactersLinked: [],
        needsFraming: false
      };
    }
  }

  /**
   * Create perception entries from extraction result
   */
  async createPerceptionsFromExtraction(
    userId: string,
    extraction: PerceptionExtractionResult
  ): Promise<Array<{ id: string; subject_alias: string }>> {
    const created: Array<{ id: string; subject_alias: string }> = [];

    for (const perception of extraction.perceptions) {
      try {
        const input: CreatePerceptionEntryInput = {
          subject_alias: perception.subject_alias,
          subject_person_id: perception.subject_person_id,
          content: perception.content,
          source: perception.source,
          source_detail: perception.source_detail,
          confidence_level: perception.confidence_level ?? 0.3,
          sentiment: perception.sentiment,
          timestamp_heard: perception.timestamp_heard || new Date().toISOString(),
          impact_on_me: perception.impact_on_me
        };

        const createdPerception = await perceptionService.createPerceptionEntry(userId, input);
        created.push({ id: createdPerception.id, subject_alias: createdPerception.subject_alias });
        logger.info({ userId, perceptionId: createdPerception.id, subject: perception.subject_alias }, 'Created perception from chat');
      } catch (error) {
        logger.warn({ error, perception }, 'Failed to create perception from extraction');
      }
    }

    return created;
  }
}

export const perceptionChatService = new PerceptionChatService();
