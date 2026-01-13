// =====================================================
// ENTITY ATTRIBUTE DETECTOR
// Purpose: Detect and extract attributes like occupation, school, workplace, etc.
// Example: "Sam works as a software engineer at Google" → occupation: "software engineer", workplace: "Google"
// =====================================================

import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';
import { config } from '../../config';
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: config.openAiKey });

export type AttributeType =
  | 'occupation'
  | 'workplace'
  | 'school'
  | 'degree'
  | 'major'
  | 'title'
  | 'role'
  | 'company'
  | 'industry'
  | 'hometown'
  | 'current_city'
  | 'nationality'
  | 'language'
  | 'skill'
  | 'certification'
  | 'employment_status'      // employed, unemployed, between_jobs, retired
  | 'financial_status'        // debt, financial_struggles, stable, wealthy
  | 'lifestyle_pattern'      // drinking_problem, smoking, exercise_habit, etc.
  | 'personality_trait'      // outgoing, introverted, aggressive, kind, etc.
  | 'health_condition'        // physical or mental health issues
  | 'relationship_status'    // single, dating, married, divorced, etc.
  | 'living_situation';      // lives_with_family, alone, roommate, etc.

export type DetectedAttribute = {
  entityId: string;
  entityType: 'omega_entity' | 'character';
  attributeType: AttributeType;
  attributeValue: string;
  confidence: number;
  isCurrent: boolean;
  startTime?: string;
  endTime?: string;
  evidence: string;
  evidenceSourceIds: string[];
};

export class EntityAttributeDetector {
  /**
   * Detect attributes from message text
   */
  async detectAttributes(
    userId: string,
    message: string,
    entities: Array<{
      id: string;
      name: string;
      type: 'omega_entity' | 'character';
    }>,
    sourceMessageId?: string,
    sourceJournalEntryId?: string
  ): Promise<DetectedAttribute[]> {
    try {
      // Always include user entity for self-references (I, me, my, myself)
      const entitiesWithUser = [...entities];
      
      // Check if message contains self-references
      const selfReferencePatterns = [
        /\b(I|me|my|myself|I'm|I am|I've|I have|I don't|I didn't|I can't|I won't)\b/i,
      ];
      
      const hasSelfReference = selfReferencePatterns.some(pattern => pattern.test(message));
      
      if (hasSelfReference) {
        // Get or create user character
        const userCharacter = await this.getOrCreateUserCharacter(userId);
        if (userCharacter && !entitiesWithUser.find(e => e.id === userCharacter.id)) {
          entitiesWithUser.push({
            id: userCharacter.id,
            name: userCharacter.name,
            type: 'character',
          });
        }
      }

      if (entitiesWithUser.length === 0) {
        return [];
      }

      // Use LLM to detect attributes
      const detected = await this.analyzeWithLLM(userId, message, entitiesWithUser);

      const attributes: DetectedAttribute[] = [];

      for (const attr of detected) {
        // Match entity by name (case-insensitive)
        // Also handle self-references: "I", "me", "myself", "self", user's name
        let entity = entitiesWithUser.find(
          e => e.name.toLowerCase() === attr.entityName.toLowerCase()
        );

        // If no match, check for self-references
        if (!entity && (attr.entityName.toLowerCase() === 'i' || 
                       attr.entityName.toLowerCase() === 'me' || 
                       attr.entityName.toLowerCase() === 'myself' ||
                       attr.entityName.toLowerCase() === 'self')) {
          const userCharacter = await this.getOrCreateUserCharacter(userId);
          if (userCharacter) {
            entity = {
              id: userCharacter.id,
              name: userCharacter.name,
              type: 'character' as const,
            };
          }
        }

        if (entity) {
          attributes.push({
            entityId: entity.id,
            entityType: entity.type,
            attributeType: attr.attributeType as AttributeType,
            attributeValue: attr.attributeValue,
            confidence: attr.confidence || 0.7,
            isCurrent: attr.isCurrent !== false,
            startTime: attr.startTime,
            endTime: attr.endTime,
            evidence: attr.evidence || message,
            evidenceSourceIds: sourceMessageId
              ? [sourceMessageId]
              : sourceJournalEntryId
                ? [sourceJournalEntryId]
                : [],
          });
        }
      }

      // Save detected attributes
      for (const attr of attributes) {
        await this.saveAttribute(userId, attr);
      }

      return attributes;
    } catch (error) {
      logger.error({ error, userId }, 'Failed to detect entity attributes');
      return [];
    }
  }

  /**
   * Get or create a character representing the user themselves
   */
  private async getOrCreateUserCharacter(userId: string): Promise<{ id: string; name: string } | null> {
    try {
      // First, try to find existing user character
      const { data: existing } = await supabaseAdmin
        .from('characters')
        .select('id, name')
        .eq('user_id', userId)
        .or('metadata->>is_self.eq.true,metadata->>is_user.eq.true,name.ilike.me,name.ilike.myself,name.ilike.self')
        .limit(1)
        .single();

      if (existing) {
        return { id: existing.id, name: existing.name };
      }

      // Try to get user's name from auth or profile
      let userName = 'Me';
      try {
        const { data: profile } = await supabaseAdmin
          .from('user_profiles')
          .select('first_name, last_name')
          .eq('user_id', userId)
          .single();
        
        if (profile?.first_name) {
          userName = profile.first_name;
        }
      } catch (error) {
        // Ignore - use default
      }

      // Create user character if doesn't exist
      const { data: created, error: createError } = await supabaseAdmin
        .from('characters')
        .insert({
          user_id: userId,
          name: userName,
          metadata: {
            is_self: true,
            is_user: true,
          },
        })
        .select('id, name')
        .single();

      if (createError || !created) {
        logger.debug({ error: createError, userId }, 'Failed to create user character');
        return null;
      }

      return { id: created.id, name: created.name };
    } catch (error) {
      logger.debug({ error, userId }, 'Failed to get or create user character');
      return null;
    }
  }

  /**
   * Analyze message with LLM to detect attributes
   */
  private async analyzeWithLLM(
    userId: string,
    message: string,
    entities: Array<{ id: string; name: string; type: string }>
  ): Promise<
    Array<{
      entityName: string;
      attributeType: string;
      attributeValue: string;
      confidence: number;
      isCurrent: boolean;
      startTime?: string;
      endTime?: string;
      evidence: string;
    }>
  > {
    try {
      const entityList = entities.map(e => `${e.name} (${e.type})`).join(', ');

      const completion = await openai.chat.completions.create({
        model: config.defaultModel,
        temperature: 0.3,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: `Analyze the message to detect attributes about entities. Preserve Spanish terms and understand mixed English-Spanish text.

Entities mentioned: ${entityList}

Detect attributes:
- "occupation": Job title or profession (e.g., "software engineer", "doctor", "teacher")
- "workplace": Where they work (company/organization name)
- "school": Educational institution they attend/attended
- "degree": Academic degree (e.g., "Bachelor of Science", "PhD")
- "major": Field of study (e.g., "Computer Science", "Medicine")
- "title": Professional title (e.g., "CEO", "Manager", "Professor")
- "role": Role or position (e.g., "lead developer", "senior analyst")
- "company": Company name (same as workplace but more explicit)
- "industry": Industry sector (e.g., "tech", "healthcare", "finance")
- "hometown": Where they're from originally
- "current_city": Where they currently live
- "nationality": Nationality or country of origin
- "language": Languages they speak
- "skill": Skills they have
- "certification": Certifications they hold
- "employment_status": Current employment situation (e.g., "employed", "unemployed", "between_jobs", "retired", "student")
- "financial_status": Financial situation (e.g., "debt", "financial_struggles", "stable", "wealthy", "in_debt")
- "lifestyle_pattern": Behavioral patterns (e.g., "drinking_problem", "always_drinking", "smoking", "exercise_habit", "gaming_addiction")
- "personality_trait": Personality characteristics (e.g., "outgoing", "introverted", "aggressive", "kind", "lazy", "hardworking")
- "health_condition": Physical or mental health issues (e.g., "depression", "anxiety", "diabetes", "chronic_pain")
- "relationship_status": Relationship situation (e.g., "single", "dating", "married", "divorced", "separated")
- "living_situation": Living arrangements (e.g., "lives_with_family", "alone", "roommate", "with_partner")

IMPORTANT:
- Extract behavioral patterns from descriptive text (e.g., "always drinking" → lifestyle_pattern: "drinking_problem")
- Extract employment status from context:
  * "unemployed" → employment_status: "unemployed"
  * "without a job" → employment_status: "unemployed"
  * "been without a job" → employment_status: "unemployed"
  * "between jobs" → employment_status: "between_jobs"
  * "looking for work" → employment_status: "unemployed"
  * "out of work" → employment_status: "unemployed"
- Extract financial status from mentions:
  * "going into debt" → financial_status: "debt"
  * "financial struggles" → financial_status: "financial_struggles"
  * "can't afford" → financial_status: "financial_struggles"
- Extract lifestyle patterns:
  * "went to the gym" → lifestyle_pattern: "exercise_habit"
  * "always drinking" → lifestyle_pattern: "drinking_problem"
- Preserve Spanish terms in attribute values when appropriate
- Be specific: "drinking problem" → lifestyle_pattern: "drinking_problem", not just "drinking"
- When user mentions their own status (e.g., "I'm unemployed"), extract it for the user entity

Return JSON:
{
  "attributes": [
    {
      "entityName": "entity name",
      "attributeType": "occupation" | "workplace" | "school" | etc.,
      "attributeValue": "value",
      "confidence": 0.0-1.0,
      "isCurrent": true/false,
      "startTime": "optional ISO date",
      "endTime": "optional ISO date",
      "evidence": "text from message that supports this"
    }
  ]
}

Only include attributes with confidence >= 0.6. Be conservative.`,
          },
          {
            role: 'user',
            content: `Message: "${message}"\n\nEntities mentioned: ${entityList}\n\nDetect attributes. IMPORTANT: If the message contains self-references (I, me, my, myself) and describes the user's own status (e.g., "I'm unemployed", "I don't have a job", "I've been without a job"), include "I" or "me" or the user's name in the entityName field so the attribute can be attached to the user entity.`,
          },
        ],
      });

      const response = completion.choices[0]?.message?.content;
      if (!response) {
        return [];
      }

      const parsed = JSON.parse(response);
      return (parsed.attributes || []).filter((a: any) => a.confidence >= 0.6);
    } catch (error) {
      logger.debug({ error }, 'LLM attribute detection failed');
      return [];
    }
  }

  /**
   * Save attribute to database
   */
  async saveAttribute(userId: string, attribute: DetectedAttribute): Promise<void> {
    try {
      // Check if attribute already exists
      const { data: existing } = await supabaseAdmin
        .from('entity_attributes')
        .select('*')
        .eq('user_id', userId)
        .eq('entity_id', attribute.entityId)
        .eq('entity_type', attribute.entityType)
        .eq('attribute_type', attribute.attributeType)
        .eq('attribute_value', attribute.attributeValue)
        .single();

      if (existing) {
        // Update existing attribute
        const existingSourceIds = existing.evidence_source_ids || [];
        const newSourceIds = [
          ...existingSourceIds,
          ...attribute.evidenceSourceIds.filter(id => !existingSourceIds.includes(id)),
        ];

        await supabaseAdmin
          .from('entity_attributes')
          .update({
            confidence: Math.max(existing.confidence, attribute.confidence),
            is_current: attribute.isCurrent,
            start_time: attribute.startTime || existing.start_time,
            end_time: attribute.endTime || existing.end_time,
            evidence_source_ids: newSourceIds,
            updated_at: new Date().toISOString(),
            metadata: {
              ...(existing.metadata || {}),
              evidence: attribute.evidence,
              last_detected_at: new Date().toISOString(),
            },
          })
          .eq('id', existing.id);
      } else {
        // Insert new attribute
        await supabaseAdmin.from('entity_attributes').insert({
          user_id: userId,
          entity_id: attribute.entityId,
          entity_type: attribute.entityType,
          attribute_type: attribute.attributeType,
          attribute_value: attribute.attributeValue,
          confidence: attribute.confidence,
          is_current: attribute.isCurrent,
          start_time: attribute.startTime,
          end_time: attribute.endTime,
          evidence_source_ids: attribute.evidenceSourceIds,
          metadata: {
            evidence: attribute.evidence,
            detected_at: new Date().toISOString(),
          },
        });
      }
    } catch (error) {
      // Ignore unique constraint violations
      if (error && typeof error === 'object' && 'message' in error) {
        const errorMessage = (error as any).message;
        if (errorMessage.includes('duplicate') || errorMessage.includes('unique')) {
          return;
        }
      }
      logger.error({ error, attribute }, 'Failed to save attribute');
    }
  }

  /**
   * Get attributes for an entity
   */
  async getEntityAttributes(
    userId: string,
    entityId: string,
    entityType: 'omega_entity' | 'character',
    currentOnly: boolean = false
  ): Promise<DetectedAttribute[]> {
    try {
      let query = supabaseAdmin
        .from('entity_attributes')
        .select('*')
        .eq('user_id', userId)
        .eq('entity_id', entityId)
        .eq('entity_type', entityType);

      if (currentOnly) {
        query = query.eq('is_current', true);
      }

      const { data: attributes } = await query;

      if (!attributes) {
        return [];
      }

      return attributes.map(attr => ({
        entityId: attr.entity_id,
        entityType: attr.entity_type as 'omega_entity' | 'character',
        attributeType: attr.attribute_type as AttributeType,
        attributeValue: attr.attribute_value,
        confidence: attr.confidence,
        isCurrent: attr.is_current,
        startTime: attr.start_time,
        endTime: attr.end_time,
        evidence: attr.metadata?.evidence || '',
        evidenceSourceIds: attr.evidence_source_ids || [],
      }));
    } catch (error) {
      logger.error({ error, userId, entityId }, 'Failed to get entity attributes');
      return [];
    }
  }
}

export const entityAttributeDetector = new EntityAttributeDetector();
