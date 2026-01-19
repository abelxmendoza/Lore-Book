// =====================================================
// ENTITY RELATIONSHIP DETECTOR
// Purpose: Detect relationships between entities from context
// Example: "Sam from Strativ Group recruits for Mach Industries"
// =====================================================

import OpenAI from 'openai';

import { config } from '../../config';
import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';

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
  | 'associated_with';

export type EntityType = 'omega_entity' | 'character';

export type DetectedRelationship = {
  fromEntityId: string;
  fromEntityType: EntityType;
  toEntityId: string;
  toEntityType: EntityType;
  relationshipType: RelationshipType;
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
   * Analyze message with LLM to detect relationships and scopes
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

      const completion = await openai.chat.completions.create({
        model: config.defaultModel,
        temperature: 0.3,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: `Analyze the message to detect relationships between entities and their scopes (contexts).

Entities mentioned: ${entityList}

Detect:
1. **Relationships** between entities:

**Professional/Employment:**
- "works_for": Person works for organization
- "employed_by": Person is employed by organization
- "recruits_for": Organization recruits/hires for another organization
- "hires_for": Organization hires on behalf of another
- "manages": Entity manages another entity
- "managed_by": Entity is managed by another
- "colleague_of": People who work together
- "reports_to": Person reports to another person
- "supervises": Person supervises another
- "contractor_for": Entity contracts for another
- "consultant_for": Entity consults for another
- "freelancer_for": Entity freelances for another
- "founder_of": Person founded organization
- "co_founder_of": Person co-founded organization
- "owner_of": Person owns organization
- "shareholder_of": Person is shareholder of organization
- "board_member_of": Person is on board of organization
- "advisor_to": Person advises organization
- "intern_at": Person interns at organization
- "volunteer_at": Person volunteers at organization
- "former_employee_of": Person used to work for organization

**Organizational:**
- "part_of": Entity is part of another entity
- "subsidiary_of": Entity is subsidiary of another
- "parent_of": Entity is parent company of another
- "owns": Entity owns another entity
- "owned_by": Entity is owned by another
- "partner_of": Entity partners with another
- "competitor_of": Entity competes with another
- "vendor_for": Organization provides services/products to another
- "client_of": Entity is a client of another
- "supplier_for": Entity supplies to another
- "distributor_for": Entity distributes for another
- "franchise_of": Entity is franchise of another
- "affiliate_of": Entity is affiliate of another
- "member_of": Entity is member of another
- "represents": Entity represents another
- "represented_by": Entity is represented by another

**Personal/Family:**
- "related_to": Family relationship (general)
- "parent_of": Person is parent of another
- "child_of": Person is child of another
- "sibling_of": Person is sibling of another
- "spouse_of": Person is spouse of another
- "grandparent_of": Person is grandparent of another
- "grandchild_of": Person is grandchild of another
- "aunt_of": Person is aunt of another
- "uncle_of": Person is uncle of another
- "niece_of": Person is niece of another
- "nephew_of": Person is nephew of another
- "cousin_of": Person is cousin of another
- "in_law_of": Person is in-law of another (generic)
- "mother_in_law_of": Person is mother-in-law of another
- "father_in_law_of": Person is father-in-law of another
- "son_in_law_of": Person is son-in-law of another
- "daughter_in_law_of": Person is daughter-in-law of another
- "step_parent_of": Person is step-parent of another
- "step_child_of": Person is step-child of another
- "step_sibling_of": Person is step-sibling of another
- "half_sibling_of": Person is half-sibling of another
- "adopted_parent_of": Person is adopted parent of another
- "adopted_child_of": Person is adopted child of another
- "godparent_of": Person is godparent of another
- "godchild_of": Person is godchild of another
- "friend_of": Person is friend of another
- "best_friend_of": Person is best friend of another
- "childhood_friend_of": Person is childhood friend of another
- "close_friend_of": Person is close friend of another
- "acquaintance_of": Person knows another casually
- "enemy_of": Person is enemy of another
- "rival_of": Person is rival of another
- "ex_friend_of": Person was friend of another (past)
- "neighbor_of": Person lives near another
- "roommate_of": Person is roommate of another
- "lives_with": Person lives with another
- "lived_with": Person lived with another (past)
- "landlord_of": Person is landlord of another
- "tenant_of": Person is tenant of another

**Service/Commercial:**
- "customer_of": Entity is customer of another
- "provider_for": Entity provides service to another
- "serves": Entity serves another
- "served_by": Entity is served by another
- "subscribes_to": Entity subscribes to service
- "subscriber_of": Entity has subscriber

**Educational:**
- "studies_at": Person currently studies at institution
- "studied_at": Person studied at institution (past)
- "teaches_at": Person teaches at institution
- "taught_at": Person taught at institution (past)
- "alumni_of": Person is alumni of institution
- "graduated_from": Person graduated from institution
- "attended": Person attended institution
- "professor_at": Person is professor at institution
- "researcher_at": Person researches at institution
- "dean_of": Person is dean of institution
- "principal_of": Person is principal of institution
- "student_of": Person is student of teacher
- "classmate_of": Person was classmate of another
- "roommate_at": Person was roommate at institution
- "mentor_of": Person mentors another
- "mentored_by": Person is mentored by another

**Fitness/Gyms:**
- "trains_at": Person trains at gym/facility
- "trains_with": Person trains with another person
- "coach_of": Person coaches another
- "coached_by": Person is coached by another
- "trainer_of": Person is trainer for another
- "trained_by": Person is trained by another

**Teams/Sports:**
- "teammate_of": Person is teammate of another
- "captain_of": Person is captain of team
- "captained_by": Team is captained by person
- "plays_for": Person plays for team
- "coaches": Person coaches team

**Music/Bands:**
- "bandmate_of": Person is bandmate of another
- "plays_in": Person plays in band/group
- "fronts": Person fronts band (lead singer/leader)
- "fronted_by": Band is fronted by person
- "features": Person/artist features another
- "featured_by": Person/artist is featured by another
- "collaborates_with": Artists work together
- "records_with": Person records with another
- "performs_with": Person performs with another
- "tours_with": Person tours with another

**Music Industry:**
- "signed_to": Artist is signed to label/company
- "signs": Label/company signs artist
- "produces": Person/company produces for artist
- "produced_by": Artist is produced by person/company
- "manages_artist": Person/company manages artist
- "booked_by": Artist is booked by promoter/venue
- "books": Promoter/venue books artist

**Clubs/Organizations:**
- "organizer_of": Person organizes club/event
- "organized_by": Club/event is organized by person
- "attends": Person attends club/event
- "hosted_by": Event/club is hosted by person/venue
- "founded": Person founded organization
- "founded_by": Organization was founded by person
- "leads": Person leads organization
- "led_by": Organization is led by person

**Scenes/Communities:**
- "active_in": Person/entity is active in scene/community
- "part_of_scene": Person/entity is part of scene
- "influences": Entity influences scene/community
- "influenced_by": Entity is influenced by scene/community
- "connected_to": Entity is connected to scene/community

**Promoters/Events:**
- "promotes": Person/company promotes artist/event
- "promoted_by": Artist/event is promoted by person/company
- "hosts": Person/venue hosts event
- "sponsors": Entity sponsors event/artist
- "sponsored_by": Event/artist is sponsored by entity

**Artists/Creative:**
- "collaborates_with": Artists work together
- "exhibits_with": Artists exhibit together
- "shows_with": Artists show work together
- "creates_with": Artists create together
- "influences": Artist influences another
- "influenced_by": Artist is influenced by another

**Social/Community:**
- "follows": Entity follows another (social media, etc.)
- "followed_by": Entity is followed by another
- "supports": Entity supports another
- "supported_by": Entity is supported by another

**Location-based:**
- "located_in": Entity is located in place
- "based_in": Entity is based in place
- "operates_in": Entity operates in place
- "visits": Entity visits place

**Temporal/Historical:**
- "predecessor_of": Entity preceded another
- "successor_to": Entity succeeded another
- "replaced_by": Entity was replaced by another
- "replaces": Entity replaces another

**General:**
- "associated_with": General association

2. **Scopes** (contexts) entities belong to:
   - "recruiting": Job recruitment context
   - "employment": Employment/job context
   - "vendor": Vendor/supplier context
   - "family": Family context
   - "job_search": Job search context
   - "business": Business context
   - "education": Educational context
   - "healthcare": Healthcare context
   - "fitness": Gym/fitness context
   - "sports": Sports/team context
   - "music": Music/band context
   - "entertainment": Entertainment industry context
   - "art": Art/creative context
   - "club": Club/organization context
   - "scene": Music/art scene context
   - "promotion": Event promotion context
   - "social": Social context
   - etc.

Return JSON:
{
  "relationships": [
    {
      "fromEntity": "entity name",
      "toEntity": "entity name",
      "relationshipType": "works_for" | "recruits_for" | etc.,
      "scope": "optional scope context",
      "confidence": 0.0-1.0,
      "evidence": "text from message that supports this"
    }
  ],
  "scopes": [
    {
      "entityName": "entity name",
      "scope": "recruiting" | "employment" | etc.,
      "scopeContext": "optional additional context",
      "confidence": 0.0-1.0,
      "evidence": "text from message that supports this"
    }
  ]
}

Only include relationships/scopes with confidence >= 0.6. Be conservative.`,
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
      return {
        relationships: (parsed.relationships || []).filter(
          (r: any) => r.confidence >= 0.6
        ),
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
