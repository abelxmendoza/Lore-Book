// =====================================================
// ROMANTIC RELATIONSHIP DETECTOR
// Purpose: Detect and track romantic relationships from conversations
// =====================================================

import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';

export type RomanticRelationshipType =
  | 'boyfriend'
  | 'girlfriend'
  | 'wife'
  | 'husband'
  | 'fiancé'
  | 'fiancée'
  | 'lover'
  | 'fuck_buddy'
  | 'crush'
  | 'obsession'
  | 'infatuation'
  | 'lust'
  | 'ex_boyfriend'
  | 'ex_girlfriend'
  | 'ex_wife'
  | 'ex_husband'
  | 'ex_lover'
  | 'situationship'
  | 'dating'
  | 'talking'
  | 'hooking_up'
  | 'one_night_stand'
  | 'complicated'
  | 'on_break'
  | 'friends_with_benefits'
  | 'in_love';

export type RelationshipStatus = 'active' | 'on_break' | 'ended' | 'complicated' | 'paused';

export interface DetectedRomanticRelationship {
  personId: string;
  personType: 'character' | 'omega_entity';
  relationshipType: RomanticRelationshipType;
  status: RelationshipStatus;
  confidence: number;
  evidence: string;
  startDate?: string;
  isSituationship?: boolean;
  exclusivityStatus?: 'exclusive' | 'non_exclusive' | 'unknown' | 'complicated';
}

export class RomanticRelationshipDetector {
  /**
   * Detect romantic relationships from message
   */
  async detectRelationships(
    userId: string,
    message: string,
    mentionedEntities: Array<{ id: string; name: string; type: 'character' | 'omega_entity' }>,
    messageId?: string
  ): Promise<DetectedRomanticRelationship[]> {
    try {
      if (mentionedEntities.length === 0) {
        return [];
      }

      // Use LLM to detect romantic relationships
      const { config } = await import('../../config');
      const OpenAI = (await import('openai')).default;
      const openai = new OpenAI({ apiKey: config.openAiKey });

      const entityList = mentionedEntities.map(e => `${e.name} (${e.type})`).join('\n');

      const completion = await openai.chat.completions.create({
        model: config.defaultModel,
        temperature: 0.3,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: `Analyze the message to detect romantic relationships.

Entities mentioned:
${entityList}

Relationship types:
- "boyfriend", "girlfriend": Committed romantic partner
- "wife", "husband": Married partner
- "fiancé", "fiancée": Engaged partner
- "lover": Romantic/sexual partner (less formal)
- "fuck_buddy": Casual sexual partner
- "crush": Romantic interest, not yet dating
- "obsession": Intense, potentially unhealthy fixation
- "infatuation": Strong but possibly temporary attraction
- "lust": Primarily physical attraction
- "ex_boyfriend", "ex_girlfriend", "ex_wife", "ex_husband", "ex_lover": Past relationships
- "situationship": Undefined romantic/sexual relationship
- "dating": Currently dating but not exclusive
- "talking": Early stage, getting to know each other
- "hooking_up": Casual sexual encounters
- "one_night_stand": Single sexual encounter
- "complicated": Relationship status is unclear/complex
- "on_break": Temporarily separated
- "friends_with_benefits": Friends with sexual component

Status types:
- "active": Currently ongoing
- "on_break": Temporarily paused
- "ended": Relationship has ended
- "complicated": Status is unclear
- "paused": Temporarily on hold

Return JSON:
{
  "relationships": [
    {
      "personName": "entity name",
      "relationshipType": "boyfriend" | "girlfriend" | etc.,
      "status": "active" | "ended" | etc.,
      "confidence": 0.0-1.0,
      "evidence": "quote from message",
      "startDate": "YYYY-MM-DD" (if mentioned),
      "isSituationship": true/false,
      "exclusivityStatus": "exclusive" | "non_exclusive" | "unknown" | "complicated"
    }
  ]
}

Only include relationships with confidence >= 0.7. Be conservative.`,
          },
          {
            role: 'user',
            content: `Message: "${message}"\n\nDetect romantic relationships:`,
          },
        ],
      });

      const response = completion.choices[0]?.message?.content;
      if (!response) {
        return [];
      }

      const parsed = JSON.parse(response);
      const detected: DetectedRomanticRelationship[] = [];

      for (const rel of parsed.relationships || []) {
        if (rel.confidence >= 0.7) {
          const entity = mentionedEntities.find(
            e => e.name.toLowerCase() === rel.personName.toLowerCase()
          );

          if (entity) {
            detected.push({
              personId: entity.id,
              personType: entity.type,
              relationshipType: rel.relationshipType as RomanticRelationshipType,
              status: (rel.status || 'active') as RelationshipStatus,
              confidence: rel.confidence || 0.7,
              evidence: rel.evidence || message,
              startDate: rel.startDate,
              isSituationship: rel.isSituationship || rel.relationshipType === 'situationship',
              exclusivityStatus: rel.exclusivityStatus,
            });
          }
        }
      }

      // Save detected relationships
      for (const rel of detected) {
        await this.saveRelationship(userId, rel, messageId);
      }

      return detected;
    } catch (error) {
      logger.debug({ error }, 'Romantic relationship detection failed');
      return [];
    }
  }

  /**
   * Save romantic relationship
   */
  async saveRelationship(
    userId: string,
    relationship: DetectedRomanticRelationship,
    sourceMessageId?: string
  ): Promise<void> {
    try {
      // Check if relationship already exists
      const { data: existing } = await supabaseAdmin
        .from('romantic_relationships')
        .select('*')
        .eq('user_id', userId)
        .eq('person_id', relationship.personId)
        .eq('person_type', relationship.personType)
        .eq('relationship_type', relationship.relationshipType)
        .eq('status', relationship.status)
        .single();

      if (existing) {
        // Update existing
        await supabaseAdmin
          .from('romantic_relationships')
          .update({
            is_current: relationship.status === 'active',
            is_situationship: relationship.isSituationship || false,
            exclusivity_status: relationship.exclusivityStatus,
            start_date: relationship.startDate || existing.start_date,
            updated_at: new Date().toISOString(),
            metadata: {
              ...(existing.metadata || {}),
              last_detected_at: new Date().toISOString(),
              evidence: relationship.evidence,
              source_message_id: sourceMessageId,
            },
          })
          .eq('id', existing.id);
      } else {
        // Insert new
        await supabaseAdmin.from('romantic_relationships').insert({
          user_id: userId,
          person_id: relationship.personId,
          person_type: relationship.personType,
          relationship_type: relationship.relationshipType,
          status: relationship.status,
          is_current: relationship.status === 'active',
          is_situationship: relationship.isSituationship || false,
          exclusivity_status: relationship.exclusivityStatus,
          start_date: relationship.startDate,
          metadata: {
            evidence: relationship.evidence,
            detected_at: new Date().toISOString(),
            source_message_id: sourceMessageId,
            confidence: relationship.confidence,
          },
        });
      }
    } catch (error) {
      if (error && typeof error === 'object' && 'message' in error) {
        const errorMessage = (error as any).message;
        if (errorMessage.includes('duplicate') || errorMessage.includes('unique')) {
          return;
        }
      }
      logger.error({ error, relationship }, 'Failed to save romantic relationship');
    }
  }

  /**
   * Detect date/milestone events
   */
  async detectDateEvent(
    userId: string,
    message: string,
    relationshipId: string,
    personId: string,
    messageId?: string
  ): Promise<void> {
    try {
      const { config } = await import('../../config');
      const OpenAI = (await import('openai')).default;
      const openai = new OpenAI({ apiKey: config.openAiKey });

      const completion = await openai.chat.completions.create({
        model: config.defaultModel,
        temperature: 0.3,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: `Analyze the message to detect date events or relationship milestones.

Date types:
- "first_date": First date together
- "anniversary": Relationship anniversary
- "special_date": Special date/celebration
- "breakup": Relationship ended
- "first_kiss": First kiss
- "first_i_love_you": First time saying "I love you"
- "moving_in": Moving in together
- "engagement": Getting engaged
- "marriage": Getting married
- "first_meeting": First time meeting
- "first_sleepover": First sleepover
- "meeting_family": Meeting family members
- "meeting_friends": Meeting friends
- "first_fight": First major conflict
- "makeup": Making up after conflict
- "milestone": Other relationship milestone

Return JSON:
{
  "dateEvents": [
    {
      "dateType": "first_date" | "anniversary" | etc.,
      "dateTime": "YYYY-MM-DDTHH:mm:ss" or "YYYY-MM-DD",
      "location": "location name" (if mentioned),
      "description": "what happened",
      "sentiment": -1.0 to 1.0,
      "wasPositive": true/false
    }
  ]
}

Only include events with clear evidence.`,
          },
          {
            role: 'user',
            content: `Message: "${message}"\n\nDetect date events:`,
          },
        ],
      });

      const response = completion.choices[0]?.message?.content;
      if (!response) {
        return;
      }

      const parsed = JSON.parse(response);

      for (const event of parsed.dateEvents || []) {
        await supabaseAdmin.from('romantic_dates').insert({
          user_id: userId,
          relationship_id: relationshipId,
          person_id: personId,
          date_type: event.dateType,
          date_time: event.dateTime || new Date().toISOString(),
          location: event.location,
          description: event.description,
          sentiment: event.sentiment,
          was_positive: event.wasPositive,
          source_message_id: messageId,
          metadata: {
            detected_at: new Date().toISOString(),
          },
        });
      }
    } catch (error) {
      logger.debug({ error }, 'Date event detection failed');
    }
  }
}

export const romanticRelationshipDetector = new RomanticRelationshipDetector();
