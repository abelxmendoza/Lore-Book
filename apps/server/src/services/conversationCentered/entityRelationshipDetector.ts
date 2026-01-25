// =====================================================
// ENTITY RELATIONSHIP DETECTOR
// Purpose: Detect relationships between entities from context
// Example: "Sam from Strativ Group recruits for Mach Industries"
// =====================================================

import OpenAI from 'openai';

import { config } from '../../config';
import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';
import {
  getRelationshipExtractionJsonSchema,
  relationshipTypeToKind,
  RelationshipTypeEnum,
  type RelationshipType as ErRelationshipType,
  type RelationshipKind as ErRelationshipKind,
} from '../../er/erSchema';

const openai = new OpenAI({ apiKey: config.openAiKey });

export type RelationshipType =
  // Professional/Employment
  | 'works_for'
  | 'employed_by'
  | 'recruits_for'
  | 'hires_for'
  | 'manages'
  | 'managed_by'
  | 'colleague_of'
  | 'reports_to'
  | 'supervises'
  | 'contractor_for'
  | 'consultant_for'
  | 'freelancer_for'
  | 'founder_of'
  | 'co_founder_of'
  | 'owner_of'
  | 'shareholder_of'
  | 'board_member_of'
  | 'advisor_to'
  | 'intern_at'
  | 'volunteer_at'
  | 'former_employee_of'
  
  // Organizational
  | 'part_of'
  | 'subsidiary_of'
  | 'parent_of'
  | 'owns'
  | 'owned_by'
  | 'partner_of'
  | 'competitor_of'
  | 'vendor_for'
  | 'client_of'
  | 'supplier_for'
  | 'distributor_for'
  | 'franchise_of'
  | 'affiliate_of'
  | 'member_of'
  | 'represents'
  | 'represented_by'
  
  // Personal/Family
  | 'related_to'
  | 'parent_of'
  | 'child_of'
  | 'sibling_of'
  | 'spouse_of'
  | 'grandparent_of'
  | 'grandchild_of'
  | 'aunt_of'
  | 'uncle_of'
  | 'niece_of'
  | 'nephew_of'
  | 'cousin_of'
  | 'in_law_of'
  | 'mother_in_law_of'
  | 'father_in_law_of'
  | 'son_in_law_of'
  | 'daughter_in_law_of'
  | 'step_parent_of'
  | 'step_child_of'
  | 'step_sibling_of'
  | 'half_sibling_of'
  | 'adopted_parent_of'
  | 'adopted_child_of'
  | 'godparent_of'
  | 'godchild_of'
  | 'friend_of'
  | 'best_friend_of'
  | 'childhood_friend_of'
  | 'close_friend_of'
  | 'acquaintance_of'
  | 'enemy_of'
  | 'rival_of'
  | 'ex_friend_of'
  | 'neighbor_of'
  | 'roommate_of'
  | 'lives_with'
  | 'lived_with'
  | 'landlord_of'
  | 'tenant_of'
  
  // Service/Commercial
  | 'customer_of'
  | 'provider_for'
  | 'serves'
  | 'served_by'
  | 'subscribes_to'
  | 'subscriber_of'
  
  // Educational
  | 'studies_at'
  | 'studied_at'
  | 'teaches_at'
  | 'taught_at'
  | 'alumni_of'
  | 'graduated_from'
  | 'attended'
  | 'professor_at'
  | 'researcher_at'
  | 'dean_of'
  | 'principal_of'
  | 'student_of'
  | 'classmate_of'
  | 'roommate_at'
  | 'mentor_of'
  | 'mentored_by'
  
  // Fitness/Gyms
  | 'trains_at'
  | 'trains_with'
  | 'coach_of'
  | 'coached_by'
  | 'trainer_of'
  | 'trained_by'
  
  // Teams/Sports
  | 'teammate_of'
  | 'captain_of'
  | 'captained_by'
  | 'plays_for'
  | 'coaches'
  
  // Music/Bands
  | 'bandmate_of'
  | 'plays_in'
  | 'fronts'
  | 'fronted_by'
  | 'features'
  | 'featured_by'
  | 'collaborates_with'
  | 'records_with'
  | 'performs_with'
  | 'tours_with'
  
  // Music Industry
  | 'signed_to'
  | 'signs'
  | 'produces'
  | 'produced_by'
  | 'manages_artist'
  | 'booked_by'
  | 'books'
  
  // Clubs/Organizations
  | 'organizer_of'
  | 'organized_by'
  | 'attends'
  | 'hosted_by'
  | 'founded'
  | 'founded_by'
  | 'leads'
  | 'led_by'
  
  // Scenes/Communities
  | 'active_in'
  | 'part_of_scene'
  | 'influences'
  | 'influenced_by'
  | 'connected_to'
  
  // Promoters/Events
  | 'promotes'
  | 'promoted_by'
  | 'hosts'
  | 'sponsors'
  | 'sponsored_by'
  
  // Artists/Creative
  | 'exhibits_with'
  | 'shows_with'
  | 'creates_with'
  
  // Social/Community
  | 'follows'
  | 'followed_by'
  | 'supports'
  | 'supported_by'
  
  // Location-based
  | 'located_in'
  | 'based_in'
  | 'operates_in'
  | 'visits'
  
  // Temporal/Historical
  | 'predecessor_of'
  | 'successor_to'
  | 'replaced_by'
  | 'replaces'
  
  // General
  | 'associated_with'

  // ER schema types (Phase 1 + 2) — when using getRelationshipExtractionJsonSchema
  | 'FRIEND_OF'
  | 'WORKS_FOR'
  | 'MENTOR_OF'
  | 'COACH_OF'
  | 'SPOUSE_OF'
  | 'ROMANTIC_INTEREST'
  | 'ACQUAINTANCE'
  | 'PRESENT_AT'
  | 'MENTIONED_IN'
  | 'CO_MENTIONED_WITH'
  | 'PARTICIPATED_IN'
  | 'INFLUENCED'
  | 'PRECEDED'
  | 'OVERLAPPED'
  | 'ENEMY_OF'
  | 'MENTORS'
  | 'MENTORED_BY'
  | 'DATED'
  | 'BROKE_UP_WITH'
  | 'TRUSTS'
  | 'DISTRUSTS'
  | 'LIVES_WITH'
  | 'VISITED'
  | 'CAUSED'
  | 'AFFECTED_BY';

export type EntityType = 'omega_entity' | 'character';

export type RelationshipKind = 'ASSERTED' | 'EPISODIC';

export type DetectedRelationship = {
  fromEntityId: string;
  fromEntityType: EntityType;
  toEntityId: string;
  toEntityType: EntityType;
  relationshipType: RelationshipType;
  kind: RelationshipKind;
  scope?: string;
  confidence: number;
  evidence: string; // Text that supports this relationship
  evidenceSourceIds: string[];
};

export type DetectedScope = {
  entityId: string;
  entityType: EntityType;
  scope: string;
  scopeContext?: string;
  confidence: number;
  evidence: string;
};

/**
 * Entity Relationship Detector
 * Detects relationships and scopes from conversational context
 */
export class EntityRelationshipDetector {
  /**
   * Detect relationships and scopes from message context
   */
  async detectRelationshipsAndScopes(
    userId: string,
    message: string,
    extractedEntities: Array<{
      id: string;
      name: string;
      type: EntityType;
    }>,
    sourceMessageId?: string,
    sourceJournalEntryId?: string
  ): Promise<{
    relationships: DetectedRelationship[];
    scopes: DetectedScope[];
  }> {
    try {
      if (extractedEntities.length < 2) {
        return { relationships: [], scopes: [] };
      }

      // Use LLM to detect relationships and scopes
      const detection = await this.analyzeWithLLM(
        userId,
        message,
        extractedEntities
      );

      // Resolve entity IDs from names
      const relationships: DetectedRelationship[] = [];
      const scopes: DetectedScope[] = [];

      for (const rel of detection.relationships || []) {
        const fromEntity = extractedEntities.find(
          e => e.name.toLowerCase() === rel.fromEntity.toLowerCase()
        );
        const toEntity = extractedEntities.find(
          e => e.name.toLowerCase() === rel.toEntity.toLowerCase()
        );

        if (fromEntity && toEntity) {
          relationships.push({
            fromEntityId: fromEntity.id,
            fromEntityType: fromEntity.type,
            toEntityId: toEntity.id,
            toEntityType: toEntity.type,
            relationshipType: rel.relationshipType as RelationshipType,
            kind: rel.kind,
            scope: rel.scope,
            confidence: rel.confidence || 0.7,
            evidence: rel.evidence || message,
            evidenceSourceIds: sourceMessageId
              ? [sourceMessageId]
              : sourceJournalEntryId
                ? [sourceJournalEntryId]
                : [],
          });
        }
      }

      for (const scope of detection.scopes || []) {
        const entity = extractedEntities.find(
          e => e.name.toLowerCase() === scope.entityName.toLowerCase()
        );

        if (entity) {
          scopes.push({
            entityId: entity.id,
            entityType: entity.type,
            scope: scope.scope,
            scopeContext: scope.scopeContext,
            confidence: scope.confidence || 0.7,
            evidence: scope.evidence || message,
          });
        }
      }

      return { relationships, scopes };
    } catch (error) {
      logger.error({ error, userId }, 'Failed to detect relationships and scopes');
      return { relationships: [], scopes: [] };
    }
  }

  /**
   * Analyze message with LLM to detect relationships and scopes.
   * Uses ER schema (getRelationshipExtractionJsonSchema) to constrain relationship types and kinds.
   */
  private async analyzeWithLLM(
    userId: string,
    message: string,
    entities: Array<{ id: string; name: string; type: EntityType }>
  ): Promise<{
    relationships: Array<{
      fromEntity: string;
      toEntity: string;
      relationshipType: string;
      kind: ErRelationshipKind;
      scope?: string;
      confidence: number;
      evidence: string;
    }>;
    scopes: Array<{
      entityName: string;
      scope: string;
      scopeContext?: string;
      confidence: number;
      evidence: string;
    }>;
  }> {
    try {
      const entityList = entities.map(e => `${e.name} (${e.type})`).join(', ');
      const schema = getRelationshipExtractionJsonSchema();

      const completion = await openai.chat.completions.create({
        model: config.defaultModel,
        temperature: 0.3,
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'RelationshipExtraction',
            strict: true,
            schema,
          },
        } as Record<string, unknown>,
        messages: [
          {
            role: 'system',
            content: `Analyze the message to detect relationships between entities and their scopes.

Entities: ${entityList}

**Relationships** – use ONLY these types and set kind (ASSERTED=lasting, EPISODIC=event-specific):
${RelationshipTypeEnum.join(', ')}.

**Scopes** – context per entity: recruiting, employment, family, education, music, etc.

Return JSON: { "relationships": [...], "scopes": [...] }. Each relationship: from_entity, to_entity, relationship (from enum above), kind (ASSERTED|EPISODIC), confidence (0–1). Only include if confidence >= 0.6.`,
          },
          {
            role: 'user',
            content: `Message: "${message}"\n\nDetect relationships and scopes:`,
          },
        ],
      });

      const response = completion.choices[0]?.message?.content;
      if (!response) {
        return { relationships: [], scopes: [] };
      }

      const parsed = JSON.parse(response);
      const rawRels = (parsed.relationships || []).filter(
        (r: any) => r.confidence >= 0.6 && RelationshipTypeEnum.includes(r.relationship)
      );
      return {
        relationships: rawRels.map((r: any) => ({
          fromEntity: r.from_entity,
          toEntity: r.to_entity,
          relationshipType: r.relationship,
          kind: (r.kind === 'ASSERTED' || r.kind === 'EPISODIC' ? r.kind : relationshipTypeToKind[r.relationship as ErRelationshipType]) || 'EPISODIC',
          scope: r.scope,
          confidence: r.confidence,
          evidence: r.evidence || message,
        })),
        scopes: (parsed.scopes || []).filter((s: any) => s.confidence >= 0.6),
      };
    } catch (error) {
      logger.debug({ error }, 'LLM relationship detection failed');
      return { relationships: [], scopes: [] };
    }
  }

  /**
   * Save relationship to database
   */
  async saveRelationship(
    userId: string,
    relationship: DetectedRelationship
  ): Promise<void> {
    try {
      // Check if relationship already exists
      const { data: existing } = await supabaseAdmin
        .from('entity_relationships')
        .select('*')
        .eq('user_id', userId)
        .eq('from_entity_id', relationship.fromEntityId)
        .eq('from_entity_type', relationship.fromEntityType)
        .eq('to_entity_id', relationship.toEntityId)
        .eq('to_entity_type', relationship.toEntityType)
        .eq('relationship_type', relationship.relationshipType)
        .eq('scope', relationship.scope || '')
        .single();

      if (existing) {
        // Update existing relationship
        const existingSourceIds = existing.evidence_source_ids || [];
        const newSourceIds = [
          ...existingSourceIds,
          ...relationship.evidenceSourceIds.filter(id => !existingSourceIds.includes(id)),
        ];

        await supabaseAdmin
          .from('entity_relationships')
          .update({
            evidence_count: (existing.evidence_count || 1) + 1,
            confidence: Math.max(existing.confidence, relationship.confidence),
            evidence_source_ids: newSourceIds,
            updated_at: new Date().toISOString(),
            metadata: {
              ...(existing.metadata || {}),
              evidence: relationship.evidence,
              last_detected_at: new Date().toISOString(),
            },
          })
          .eq('id', existing.id);
      } else {
        // Insert new relationship
        await supabaseAdmin.from('entity_relationships').insert({
          user_id: userId,
          from_entity_id: relationship.fromEntityId,
          from_entity_type: relationship.fromEntityType,
          to_entity_id: relationship.toEntityId,
          to_entity_type: relationship.toEntityType,
          relationship_type: relationship.relationshipType,
          scope: relationship.scope,
          confidence: relationship.confidence,
          evidence_count: 1,
          evidence_source_ids: relationship.evidenceSourceIds,
          metadata: {
            evidence: relationship.evidence,
            detected_at: new Date().toISOString(),
          },
        });
      }
    } catch (error) {
      // Ignore unique constraint violations (relationship already exists)
      if (error && typeof error === 'object' && 'message' in error) {
        const errorMessage = (error as any).message;
        if (errorMessage.includes('duplicate') || errorMessage.includes('unique')) {
          return;
        }
      }
      logger.error({ error, relationship }, 'Failed to save relationship');
    }
  }

  /**
   * Save scope to database
   */
  async saveScope(userId: string, scope: DetectedScope): Promise<void> {
    try {
      // Check if scope already exists
      const { data: existing } = await supabaseAdmin
        .from('entity_scopes')
        .select('*')
        .eq('user_id', userId)
        .eq('entity_id', scope.entityId)
        .eq('entity_type', scope.entityType)
        .eq('scope', scope.scope)
        .single();

      if (existing) {
        // Update existing scope
        await supabaseAdmin
          .from('entity_scopes')
          .update({
            evidence_count: (existing.evidence_count || 1) + 1,
            confidence: Math.max(existing.confidence, scope.confidence),
            last_observed_at: new Date().toISOString(),
            metadata: {
              ...(existing.metadata || {}),
              evidence: scope.evidence,
              last_detected_at: new Date().toISOString(),
            },
          })
          .eq('id', existing.id);
      } else {
        // Insert new scope
        await supabaseAdmin.from('entity_scopes').insert({
          user_id: userId,
          entity_id: scope.entityId,
          entity_type: scope.entityType,
          scope: scope.scope,
          scope_context: scope.scopeContext,
          confidence: scope.confidence,
          evidence_count: 1,
          metadata: {
            evidence: scope.evidence,
            detected_at: new Date().toISOString(),
          },
        });
      }
    } catch (error) {
      // Ignore unique constraint violations (scope already exists)
      if (error && typeof error === 'object' && 'message' in error) {
        const errorMessage = (error as any).message;
        if (errorMessage.includes('duplicate') || errorMessage.includes('unique')) {
          return;
        }
      }
      logger.error({ error, scope }, 'Failed to save scope');
    }
  }

  /**
   * Get relationships for an entity
   */
  async getEntityRelationships(
    userId: string,
    entityId: string,
    entityType: EntityType
  ): Promise<DetectedRelationship[]> {
    try {
      const { data: relationships } = await supabaseAdmin
        .from('entity_relationships')
        .select('*')
        .eq('user_id', userId)
        .or(
          `and(from_entity_id.eq.${entityId},from_entity_type.eq.${entityType}),and(to_entity_id.eq.${entityId},to_entity_type.eq.${entityType})`
        )
        .eq('is_active', true);

      if (!relationships) {
        return [];
      }

      return relationships.map(rel => ({
        fromEntityId: rel.from_entity_id,
        fromEntityType: rel.from_entity_type as EntityType,
        toEntityId: rel.to_entity_id,
        toEntityType: rel.to_entity_type as EntityType,
        relationshipType: rel.relationship_type as RelationshipType,
        kind: (relationshipTypeToKind[rel.relationship_type as ErRelationshipType] || 'EPISODIC') as RelationshipKind,
        scope: rel.scope,
        confidence: rel.confidence,
        evidence: rel.metadata?.evidence || '',
        evidenceSourceIds: rel.evidence_source_ids || [],
      }));
    } catch (error) {
      logger.error({ error, userId, entityId }, 'Failed to get entity relationships');
      return [];
    }
  }

  /**
   * Get scopes for an entity
   */
  async getEntityScopes(
    userId: string,
    entityId: string,
    entityType: EntityType
  ): Promise<DetectedScope[]> {
    try {
      const { data: scopes } = await supabaseAdmin
        .from('entity_scopes')
        .select('*')
        .eq('user_id', userId)
        .eq('entity_id', entityId)
        .eq('entity_type', entityType);

      if (!scopes) {
        return [];
      }

      return scopes.map(s => ({
        entityId: s.entity_id,
        entityType: s.entity_type as EntityType,
        scope: s.scope,
        scopeContext: s.scope_context,
        confidence: s.confidence,
        evidence: s.metadata?.evidence || '',
      }));
    } catch (error) {
      logger.error({ error, userId, entityId }, 'Failed to get entity scopes');
      return [];
    }
  }
}

export const entityRelationshipDetector = new EntityRelationshipDetector();
