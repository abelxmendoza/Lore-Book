// =====================================================
// GYM SOCIAL DETECTOR
// Purpose: Detect social interactions at the gym and update relationships
// =====================================================

import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';
import { characterTimelineBuilder } from './characterTimelineBuilder';
import { romanticRelationshipDetector } from './romanticRelationshipDetector';

export interface GymSocialInteraction {
  person_name: string;
  interaction_type: 'met_new' | 'saw_familiar' | 'conversation' | 'romantic_interest';
  relationship_impact?: 'new_talking_stage' | 'situationship' | 'friendship_update';
  notes?: string;
  confidence: number; // 0-1
}

export class GymSocialDetector {
  /**
   * Detect social interactions in workout-related text
   */
  async detectSocialInteractions(
    userId: string,
    content: string,
    eventId?: string
  ): Promise<GymSocialInteraction[]> {
    try {
      const { openai } = await import('../openaiClient');
      
      const prompt = `Detect social interactions mentioned in this workout/gym-related text. Return JSON only, no markdown.

Text: "${content}"

Look for:
1. Meeting new people (e.g., "met a girl", "met someone named X")
2. Seeing familiar people (e.g., "ran into", "saw my friend", "bumped into")
3. Conversations (e.g., "talked to", "had a conversation with")
4. Romantic interest (e.g., "got her number", "we're talking", "she's cute")
5. Relationship developments (e.g., "talking stage", "situationship", "dating")

For each interaction, determine:
- person_name: The name mentioned (or "unknown" if not given)
- interaction_type: "met_new", "saw_familiar", "conversation", or "romantic_interest"
- relationship_impact: "new_talking_stage", "situationship", or "friendship_update" (if applicable)
- notes: Brief description of the interaction
- confidence: 0.0-1.0 based on how clear the interaction is

Return JSON in this format:
{
  "interactions": [
    {
      "person_name": "name or unknown",
      "interaction_type": "met_new" | "saw_familiar" | "conversation" | "romantic_interest",
      "relationship_impact": "new_talking_stage" | "situationship" | "friendship_update" | null,
      "notes": "description",
      "confidence": 0.0-1.0
    }
  ]
}

If no social interactions found, return {"interactions": []}.`;

      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You are a social interaction detection assistant. Detect social interactions in gym/workout contexts and return only valid JSON.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.2,
        response_format: { type: 'json_object' }
      });

      const result = JSON.parse(response.choices[0].message.content || '{"interactions": []}');
      const interactions: GymSocialInteraction[] = result.interactions || [];

      // Process each interaction
      for (const interaction of interactions) {
        if (interaction.confidence >= 0.5) {
          await this.processInteraction(userId, interaction, eventId);
        }
      }

      return interactions.filter(i => i.confidence >= 0.5);
    } catch (error) {
      logger.error({ error, userId, content }, 'Failed to detect social interactions');
      return [];
    }
  }

  /**
   * Process a social interaction - create/update character and relationships
   */
  private async processInteraction(
    userId: string,
    interaction: GymSocialInteraction,
    eventId?: string
  ): Promise<void> {
    try {
      // Find or create character
      let characterId: string | null = null;

      if (interaction.person_name && interaction.person_name !== 'unknown') {
        // Try to find existing character
        const { data: existing } = await supabaseAdmin
          .from('characters')
          .select('id')
          .eq('user_id', userId)
          .ilike('name', `%${interaction.person_name}%`)
          .limit(1)
          .single();

        if (existing) {
          characterId = existing.id;
        } else {
          // Create new character
          const { data: newCharacter, error: createError } = await supabaseAdmin
            .from('characters')
            .insert({
              user_id: userId,
              name: interaction.person_name,
              relationship_type: interaction.interaction_type === 'romantic_interest' ? 'romantic_interest' : 'acquaintance',
              metadata: {
                first_met_at: 'gym',
                first_met_event_id: eventId,
                interaction_type: interaction.interaction_type
              }
            })
            .select('id')
            .single();

          if (createError) {
            logger.error({ error: createError, interaction }, 'Failed to create character');
            return;
          }

          characterId = newCharacter.id;

          // Add to character timeline
          if (eventId) {
            await characterTimelineBuilder.addEventToTimeline(
              userId,
              characterId,
              eventId,
              'shared_experience',
              true, // user was present
              'participant'
            );
          }
        }

        // Handle romantic relationship detection
        if (interaction.interaction_type === 'romantic_interest' || 
            interaction.relationship_impact === 'new_talking_stage' ||
            interaction.relationship_impact === 'situationship') {
          
          if (characterId) {
            // Detect romantic relationship
            const relationshipContext = {
              content: interaction.notes || `Met ${interaction.person_name} at the gym`,
              people: [characterId],
              timestamp: new Date().toISOString()
            };

            await romanticRelationshipDetector.detectAndSave(
              userId,
              relationshipContext as any
            );
          }
        }

        // Update character relationship if familiar person
        if (interaction.interaction_type === 'saw_familiar' && characterId) {
          // Update last seen
          await supabaseAdmin
            .from('characters')
            .update({
              updated_at: new Date().toISOString(),
              metadata: {
                last_seen_at: 'gym',
                last_seen_event_id: eventId
              }
            })
            .eq('id', characterId);

          // Add to timeline
          if (eventId) {
            await characterTimelineBuilder.addEventToTimeline(
              userId,
              characterId,
              eventId,
              'shared_experience',
              true,
              'participant'
            );
          }
        }
      }
    } catch (error) {
      logger.error({ error, userId, interaction }, 'Failed to process social interaction');
    }
  }

  /**
   * Check if text mentions gym-related social interactions
   */
  detectGymSocialContext(content: string): boolean {
    const lowerContent = content.toLowerCase();
    
    const socialKeywords = [
      'met', 'saw', 'ran into', 'bumped into', 'talked to', 'conversation',
      'girl', 'guy', 'friend', 'number', 'talking stage', 'situationship',
      'dating', 'romantic', 'cute', 'attractive', 'interested'
    ];
    
    const gymKeywords = ['gym', 'workout', 'lifted', 'exercise'];
    
    const hasSocial = socialKeywords.some(keyword => lowerContent.includes(keyword));
    const hasGym = gymKeywords.some(keyword => lowerContent.includes(keyword));
    
    return hasSocial && hasGym;
  }
}

export const gymSocialDetector = new GymSocialDetector();
