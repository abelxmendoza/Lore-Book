// =====================================================
// ENTITY SCOPE SERVICE
// Purpose: Manage entity scopes and group related entities
// Groups entities that share the same scope (e.g., recruiting context)
// =====================================================

import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';

import type { EntityType } from './entityRelationshipDetector';

export type EntityScopeGroup = {
  id: string;
  scope: string;
  scopeContext?: string;
  entityIds: string[];
  entityTypes: EntityType[];
  confidence: number;
  evidenceCount: number;
};

/**
 * Entity Scope Service
 * Manages entity scopes and groups related entities together
 */
export class EntityScopeService {
  /**
   * Add entity to scope group
   * Creates group if doesn't exist, adds to existing if it does
   */
  async addEntityToScopeGroup(
    userId: string,
    entityId: string,
    entityType: EntityType,
    scope: string,
    scopeContext?: string
  ): Promise<EntityScopeGroup | null> {
    try {
      // Find existing scope group
      const { data: existingGroup } = await supabaseAdmin
        .from('entity_scope_groups')
        .select('*')
        .eq('user_id', userId)
        .eq('scope', scope)
        .eq('scope_context', scopeContext || '')
        .single();

      if (existingGroup) {
        // Add entity to existing group if not already present
        const entityIds = existingGroup.entity_ids || [];
        const entityTypes = existingGroup.entity_types || [];

        if (!entityIds.includes(entityId)) {
          entityIds.push(entityId);
          entityTypes.push(entityType);

          const { data: updated } = await supabaseAdmin
            .from('entity_scope_groups')
            .update({
              entity_ids: entityIds,
              entity_types: entityTypes,
              evidence_count: (existingGroup.evidence_count || 1) + 1,
              last_observed_at: new Date().toISOString(),
            })
            .eq('id', existingGroup.id)
            .select()
            .single();

          if (updated) {
            return {
              id: updated.id,
              scope: updated.scope,
              scopeContext: updated.scope_context,
              entityIds: updated.entity_ids || [],
              entityTypes: (updated.entity_types || []) as EntityType[],
              confidence: updated.confidence,
              evidenceCount: updated.evidence_count || 1,
            };
          }
        } else {
          // Entity already in group, just update evidence count
          await supabaseAdmin
            .from('entity_scope_groups')
            .update({
              evidence_count: (existingGroup.evidence_count || 1) + 1,
              last_observed_at: new Date().toISOString(),
            })
            .eq('id', existingGroup.id);

          return {
            id: existingGroup.id,
            scope: existingGroup.scope,
            scopeContext: existingGroup.scope_context,
            entityIds: existingGroup.entity_ids || [],
            entityTypes: (existingGroup.entity_types || []) as EntityType[],
            confidence: existingGroup.confidence,
            evidenceCount: (existingGroup.evidence_count || 1) + 1,
          };
        }
      } else {
        // Create new scope group
        const { data: newGroup } = await supabaseAdmin
          .from('entity_scope_groups')
          .insert({
            user_id: userId,
            scope,
            scope_context: scopeContext,
            entity_ids: [entityId],
            entity_types: [entityType],
            confidence: 0.5,
            evidence_count: 1,
          })
          .select()
          .single();

        if (newGroup) {
          return {
            id: newGroup.id,
            scope: newGroup.scope,
            scopeContext: newGroup.scope_context,
            entityIds: newGroup.entity_ids || [],
            entityTypes: (newGroup.entity_types || []) as EntityType[],
            confidence: newGroup.confidence,
            evidenceCount: newGroup.evidence_count || 1,
          };
        }
      }

      return null;
    } catch (error) {
      logger.error({ error, userId, entityId, scope }, 'Failed to add entity to scope group');
      return null;
    }
  }

  /**
   * Get scope group for a scope
   */
  async getScopeGroup(
    userId: string,
    scope: string,
    scopeContext?: string
  ): Promise<EntityScopeGroup | null> {
    try {
      const { data: group } = await supabaseAdmin
        .from('entity_scope_groups')
        .select('*')
        .eq('user_id', userId)
        .eq('scope', scope)
        .eq('scope_context', scopeContext || '')
        .single();

      if (!group) {
        return null;
      }

      return {
        id: group.id,
        scope: group.scope,
        scopeContext: group.scope_context,
        entityIds: group.entity_ids || [],
        entityTypes: (group.entity_types || []) as EntityType[],
        confidence: group.confidence,
        evidenceCount: group.evidence_count || 1,
      };
    } catch (error) {
      logger.error({ error, userId, scope }, 'Failed to get scope group');
      return null;
    }
  }

  /**
   * Get all entities in a scope
   */
  async getEntitiesInScope(
    userId: string,
    scope: string,
    scopeContext?: string
  ): Promise<Array<{ id: string; type: EntityType }>> {
    try {
      const group = await this.getScopeGroup(userId, scope, scopeContext);
      if (!group) {
        return [];
      }

      return group.entityIds.map((id, index) => ({
        id,
        type: group.entityTypes[index] || 'omega_entity',
      }));
    } catch (error) {
      logger.error({ error, userId, scope }, 'Failed to get entities in scope');
      return [];
    }
  }

  /**
   * Get all scopes for an entity
   */
  async getEntityScopes(
    userId: string,
    entityId: string,
    entityType: EntityType
  ): Promise<string[]> {
    try {
      const { data: scopes } = await supabaseAdmin
        .from('entity_scopes')
        .select('scope')
        .eq('user_id', userId)
        .eq('entity_id', entityId)
        .eq('entity_type', entityType);

      return scopes?.map(s => s.scope) || [];
    } catch (error) {
      logger.error({ error, userId, entityId }, 'Failed to get entity scopes');
      return [];
    }
  }

  /**
   * Resolve entity with scope awareness
   * When resolving "Sam from Mach Industries", checks if Sam is actually from a different org
   */
  async resolveEntityWithScope(
    userId: string,
    entityName: string,
    contextScope?: string,
    relatedEntityIds?: string[]
  ): Promise<{ id: string; type: EntityType; actualScope?: string } | null> {
    try {
      // First, find all entities with this name
      const { data: characters } = await supabaseAdmin
        .from('characters')
        .select('id, name, metadata')
        .eq('user_id', userId)
        .ilike('name', `%${entityName}%`);

      const { data: omegaEntities } = await supabaseAdmin
        .from('omega_entities')
        .select('id, primary_name, type')
        .eq('user_id', userId)
        .ilike('primary_name', `%${entityName}%`);

      const candidates: Array<{ id: string; type: EntityType; name: string }> = [
        ...(characters || []).map(c => ({
          id: c.id,
          type: 'character' as EntityType,
          name: c.name,
        })),
        ...(omegaEntities || []).map(e => ({
          id: e.id,
          type: 'omega_entity' as EntityType,
          name: e.primary_name,
        })),
      ];

      if (candidates.length === 0) {
        return null;
      }

      if (candidates.length === 1) {
        return {
          id: candidates[0].id,
          type: candidates[0].type,
        };
      }

      // Multiple candidates - use scope to disambiguate
      if (contextScope && relatedEntityIds && relatedEntityIds.length > 0) {
        // Check which candidate is in the same scope as related entities
        for (const candidate of candidates) {
          const candidateScopes = await this.getEntityScopes(
            userId,
            candidate.id,
            candidate.type
          );

          if (candidateScopes.includes(contextScope)) {
            // Check if this candidate has relationships with related entities
            const { data: relationships } = await supabaseAdmin
              .from('entity_relationships')
              .select('*')
              .eq('user_id', userId)
              .eq('from_entity_id', candidate.id)
              .eq('from_entity_type', candidate.type)
              .in('to_entity_id', relatedEntityIds)
              .eq('scope', contextScope)
              .limit(1);

            if (relationships && relationships.length > 0) {
              return {
                id: candidate.id,
                type: candidate.type,
                actualScope: contextScope,
              };
            }
          }
        }
      }

      // Fallback: return first candidate
      return {
        id: candidates[0].id,
        type: candidates[0].type,
      };
    } catch (error) {
      logger.error({ error, userId, entityName }, 'Failed to resolve entity with scope');
      return null;
    }
  }

  /**
   * Build entity relationship chain
   * Example: Sam → works_for → Strativ Group → recruits_for → Mach Industries
   */
  async buildRelationshipChain(
    userId: string,
    fromEntityId: string,
    fromEntityType: EntityType,
    maxDepth: number = 3
  ): Promise<Array<{
    entityId: string;
    entityType: EntityType;
    relationshipType: string;
    nextEntityId: string;
    nextEntityType: EntityType;
  }>> {
    try {
      const chain: Array<{
        entityId: string;
        entityType: EntityType;
        relationshipType: string;
        nextEntityId: string;
        nextEntityType: EntityType;
      }> = [];

      let currentEntityId = fromEntityId;
      let currentEntityType = fromEntityType;
      let depth = 0;

      while (depth < maxDepth) {
        const { data: relationships } = await supabaseAdmin
          .from('entity_relationships')
          .select('*')
          .eq('user_id', userId)
          .eq('from_entity_id', currentEntityId)
          .eq('from_entity_type', currentEntityType)
          .eq('is_active', true)
          .limit(1);

        if (!relationships || relationships.length === 0) {
          break;
        }

        const rel = relationships[0];
        chain.push({
          entityId: currentEntityId,
          entityType: currentEntityType,
          relationshipType: rel.relationship_type,
          nextEntityId: rel.to_entity_id,
          nextEntityType: rel.to_entity_type as EntityType,
        });

        currentEntityId = rel.to_entity_id;
        currentEntityType = rel.to_entity_type as EntityType;
        depth++;
      }

      return chain;
    } catch (error) {
      logger.error({ error, userId, fromEntityId }, 'Failed to build relationship chain');
      return [];
    }
  }
}

export const entityScopeService = new EntityScopeService();
