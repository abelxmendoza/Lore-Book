// =====================================================
// ROMANTIC RELATIONSHIP DETECTOR
// Purpose: Detect and track romantic relationships from conversations
// =====================================================

import { logger } from '../../logger';
import { openai } from '../openaiClient';
import { supabaseAdmin } from '../supabaseClient';
import { isIndividualPersonName } from '../../utils/personNameValidation';
import { assessRomanticPartnerEligibility } from './romanticEligibility';
import { organizationService } from '../organizationService';
import { persistThirdPartyRomances } from './thirdPartyRelationshipService';

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

export type RelationshipStatus = 'active' | 'on_break' | 'ended' | 'complicated' | 'paused' | 'ghosted' | 'blocked' | 'unrequited' | 'fading' | 'rekindled';

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
  /** Resolved partner name, used for eligibility guards when available. */
  partnerName?: string;
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

      const individualEntities = mentionedEntities.filter((e) => isIndividualPersonName(e.name));
      if (individualEntities.length === 0) {
        return [];
      }

      // Use LLM to detect romantic relationships
      const { config } = await import('../../config');
      const OpenAI = (await import('openai')).default;

      const entityList = individualEntities.map(e => `${e.name} (${e.type})`).join('\n');

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
- "ghosted": They stopped responding or disappeared without closure
- "blocked": One person blocked the other or no contact is possible
- "unrequited": Feelings are one-sided
- "fading": Connection is still present but weakening
- "rekindled": A past connection is becoming active again

Return JSON:
{
  "relationships": [
    {
      "personName": "entity name",
      "relationshipType": "boyfriend" | "girlfriend" | etc.,
      "status": "active" | "ended" | "blocked" | "ghosted" | "on_break" | "complicated" | "paused" | "unrequited" | "fading" | "rekindled",
      "confidence": 0.0-1.0,
      "evidence": "quote from message",
      "startDate": "YYYY-MM-DD" (if mentioned),
      "isSituationship": true/false,
      "exclusivityStatus": "exclusive" | "non_exclusive" | "unknown" | "complicated"
    }
  ]
}

If the message says they blocked the user or ghosted the user, classify status as "blocked" or "ghosted" and treat it as not current. Only include relationships with confidence >= 0.7. Be conservative.

IMPORTANT: Only detect romantic relationships with INDIVIDUAL people. Never classify groups, teams, departments, companies, or plural collective references (e.g. "Amazon Engineers", "the recruiters", "my coworkers") as romantic partners. Those belong in group/organization tracking, not Love & Relationships.`,
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
          const entity = individualEntities.find(
            e => e.name.toLowerCase() === rel.personName.toLowerCase()
          );

          if (entity && isIndividualPersonName(entity.name)) {
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
    // Guard: never store role labels ("Ex Lover") or someone else's partner
    // (evidence like "her boyfriend Juan") as the user's romantic relationship.
    const knownOrganizationNames = await organizationService
      .listOrganizationLabels(userId)
      .catch(() => [] as string[]);
    const eligibility = assessRomanticPartnerEligibility({
      name: relationship.partnerName,
      evidence: relationship.evidence,
      knownOrganizationNames,
    });
    if (!eligibility.eligible) {
      logger.info(
        { userId, personId: relationship.personId, reason: eligibility.reason },
        'Skipped ineligible romantic relationship'
      );
      // A "third-party partner" ("her boyfriend Juan") is not the user's romance,
      // but it IS a romance between two other people — record that edge instead of
      // dropping the fact entirely.
      if (eligibility.reason === 'third_party_partner') {
        await persistThirdPartyRomances(userId, relationship.evidence, sourceMessageId).catch((err) =>
          logger.debug({ err, userId }, 'third-party romance persistence failed')
        );
      }
      return;
    }
    try {
      // One romantic relationship per person — match on identity only, not on
      // (relationship_type, status). Matching those too spawned a fresh row each
      // time a person's status evolved (one_night_stand -> ex_lover), which is
      // what produced the Love & Relationships duplicates.
      const { data: existing } = await supabaseAdmin
        .from('romantic_relationships')
        .select('*')
        .eq('user_id', userId)
        .eq('person_id', relationship.personId)
        .eq('person_type', relationship.personType)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existing) {
        // Update existing — evolve type/status on the single canonical row.
        await supabaseAdmin
          .from('romantic_relationships')
          .update({
            relationship_type: relationship.relationshipType,
            status: relationship.status,
            is_current: !['ended', 'ghosted', 'blocked'].includes(relationship.status),
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
          is_current: !['ended', 'ghosted', 'blocked'].includes(relationship.status),
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
