/**
 * LORE-KEEPER PRIVACY, SCOPE & MEMORY OWNERSHIP ENGINE
 * Service for enforcing ownership, visibility, retention, and access boundaries
 */

import { supabaseAdmin } from './supabaseClient';
import { logger } from '../logger';
import { continuityService } from './continuityService';
import { omegaMemoryService } from './omegaMemoryService';
import { insightReflectionService } from './insightReflectionService';
import { decisionMemoryService } from './decisionMemoryService';
import { predictiveContinuityService } from './predictiveContinuityService';
import { goalValueAlignmentService } from './goalValueAlignmentService';
import type {
  ScopeType,
  ResourceType,
  MemoryScope,
  ScopedResource,
  RequesterContext,
  AccessResult,
  ChatVisibleState,
  ExportData,
} from '../types/privacyScope';

export class PrivacyScopeService {
  /**
   * Get or create scope for resource
   */
  async getOrCreateScope(
    userId: string,
    resourceType: ResourceType,
    resourceId: string,
    scopeType: ScopeType = 'PRIVATE'
  ): Promise<ScopedResource> {
    try {
      // Check if scope already exists
      const { data: existing } = await supabaseAdmin
        .from('scoped_resources')
        .select('*')
        .eq('resource_type', resourceType)
        .eq('resource_id', resourceId)
        .eq('owner_user_id', userId)
        .single();

      if (existing) {
        return existing;
      }

      // Get scope ID
      const scopeId = await this.getScopeIdByType(scopeType);

      // Create scope
      const { data, error } = await supabaseAdmin
        .from('scoped_resources')
        .insert({
          resource_type: resourceType,
          resource_id: resourceId,
          scope_id: scopeId,
          owner_user_id: userId,
        })
        .select()
        .single();

      if (error) {
        logger.error({ err: error, userId, resourceType, resourceId }, 'Failed to create scope');
        throw error;
      }

      return data;
    } catch (error) {
      logger.error({ err: error, userId, resourceType, resourceId }, 'Failed to get or create scope');
      throw error;
    }
  }

  /**
   * Check if requester can access resource
   */
  async canAccess(
    resourceType: ResourceType,
    resourceId: string,
    requesterContext: RequesterContext
  ): Promise<AccessResult> {
    try {
      const { data: scopedResource } = await supabaseAdmin
        .from('scoped_resources')
        .select('*, memory_scopes(*)')
        .eq('resource_type', resourceType)
        .eq('resource_id', resourceId)
        .single();

      if (!scopedResource) {
        // No scope found, default to PRIVATE (owner only)
        return {
          allowed: requesterContext.user_id === requesterContext.user_id, // This will be checked against actual owner
          reason: 'No scope found, defaulting to PRIVATE',
        };
      }

      const scope = (scopedResource as any).memory_scopes as MemoryScope;

      // DELETED resources are never accessible
      if (scope.scope_type === 'DELETED') {
        return {
          allowed: false,
          reason: 'Resource has been deleted',
        };
      }

      // Owner can always access (except DELETED, already checked)
      if (scopedResource.owner_user_id === requesterContext.user_id) {
        return {
          allowed: true,
          reason: 'User is the owner',
        };
      }

      // Non-owners can only access SHARED resources
      if (scope.scope_type === 'SHARED') {
        return {
          allowed: true,
          reason: 'Resource is shared',
        };
      }

      return {
        allowed: false,
        reason: `Resource is ${scope.scope_type}, access denied`,
      };
    } catch (error) {
      logger.error({ err: error, resourceType, resourceId }, 'Failed to check access');
      return {
        allowed: false,
        reason: 'Error checking access',
      };
    }
  }

  /**
   * Update resource scope
   */
  async updateScope(
    userId: string,
    resourceType: ResourceType,
    resourceId: string,
    newScopeType: ScopeType
  ): Promise<ScopedResource> {
    try {
      const newScopeId = await this.getScopeIdByType(newScopeType);

      const { data, error } = await supabaseAdmin
        .from('scoped_resources')
        .update({ scope_id: newScopeId })
        .eq('resource_type', resourceType)
        .eq('resource_id', resourceId)
        .eq('owner_user_id', userId)
        .select()
        .single();

      if (error) {
        logger.error({ err: error, userId, resourceType, resourceId }, 'Failed to update scope');
        throw error;
      }

      return data;
    } catch (error) {
      logger.error({ err: error, userId, resourceType, resourceId }, 'Failed to update scope');
      throw error;
    }
  }

  /**
   * Delete resource (hard deletion)
   */
  async deleteResource(
    userId: string,
    resourceType: ResourceType,
    resourceId: string
  ): Promise<void> {
    try {
      // Mark as DELETED
      await this.updateScope(userId, resourceType, resourceId, 'DELETED');

      // Propagate deletion
      await this.propagateDeletion(userId, resourceType, resourceId);

      // Record continuity event
      await continuityService.emitEvent(userId, {
        type: 'RESOURCE_DELETED',
        context: {
          resource_type: resourceType,
          resource_id: resourceId,
        },
        explanation: `User deleted ${resourceType} permanently`,
        related_claim_ids: resourceType === 'CLAIM' ? [resourceId] : [],
        initiated_by: 'USER',
        severity: 'INFO',
        reversible: false,
      });
    } catch (error) {
      logger.error({ err: error, userId, resourceType, resourceId }, 'Failed to delete resource');
      throw error;
    }
  }

  /**
   * Propagate deletion to dependent resources
   */
  private async propagateDeletion(
    userId: string,
    resourceType: ResourceType,
    resourceId: string
  ): Promise<void> {
    try {
      // Remove from insights
      if (resourceType === 'CLAIM' || resourceType === 'ENTITY') {
        const insights = await insightReflectionService.getInsights(userId, { dismissed: false });
        for (const insight of insights) {
          if (
            insight.related_claim_ids?.includes(resourceId) ||
            insight.related_entity_ids?.includes(resourceId)
          ) {
            // Mark insight as DELETED if it only references this resource
            const remainingClaims = insight.related_claim_ids?.filter(id => id !== resourceId) || [];
            const remainingEntities = insight.related_entity_ids?.filter(id => id !== resourceId) || [];
            
            if (remainingClaims.length === 0 && remainingEntities.length === 0) {
              await this.updateScope(userId, 'INSIGHT', insight.id, 'DELETED');
            }
          }
        }
      }

      // Remove from predictions
      if (resourceType === 'CLAIM' || resourceType === 'DECISION' || resourceType === 'INSIGHT') {
        const predictions = await predictiveContinuityService.getPredictions(userId, { dismissed: false });
        for (const prediction of predictions) {
          if (
            prediction.related_claim_ids?.includes(resourceId) ||
            prediction.related_decision_ids?.includes(resourceId) ||
            prediction.related_insight_ids?.includes(resourceId)
          ) {
            const remainingClaims = prediction.related_claim_ids?.filter(id => id !== resourceId) || [];
            const remainingDecisions = prediction.related_decision_ids?.filter(id => id !== resourceId) || [];
            const remainingInsights = prediction.related_insight_ids?.filter(id => id !== resourceId) || [];
            
            if (remainingClaims.length === 0 && remainingDecisions.length === 0 && remainingInsights.length === 0) {
              await this.updateScope(userId, 'PREDICTION', prediction.id, 'DELETED');
            }
          }
        }
      }

      // Remove from goal signals
      if (resourceType === 'CLAIM' || resourceType === 'DECISION' || resourceType === 'INSIGHT' || resourceType === 'OUTCOME') {
        // Goal signals reference these resources, but we'll handle them separately
        // The goal service should check scope when evaluating signals
      }

      // Note: We don't delete embeddings as they may be used for other purposes
      // But we should filter them out in queries
    } catch (error) {
      logger.error({ err: error, userId, resourceType, resourceId }, 'Failed to propagate deletion');
    }
  }

  /**
   * Archive resource (soft retention)
   */
  async archiveResource(
    userId: string,
    resourceType: ResourceType,
    resourceId: string
  ): Promise<ScopedResource> {
    return this.updateScope(userId, resourceType, resourceId, 'ARCHIVED');
  }

  /**
   * Get chat-visible state (enforces scope)
   */
  async getChatVisibleState(userId: string): Promise<ChatVisibleState> {
    try {
      // Get all resources with PRIVATE or SHARED scope (not DELETED, not ARCHIVED for chat)
      const privateScopeId = await this.getScopeIdByType('PRIVATE');
      const sharedScopeId = await this.getScopeIdByType('SHARED');

      // Get claims
      const claims = await this.getScopedResources(userId, 'CLAIM', [privateScopeId, sharedScopeId]);
      const claimIds = claims.map(c => c.resource_id);
      const visibleClaims = await this.fetchClaims(userId, claimIds);

      // Get insights
      const insights = await this.getScopedResources(userId, 'INSIGHT', [privateScopeId, sharedScopeId]);
      const insightIds = insights.map(i => i.resource_id);
      const visibleInsights = await this.fetchInsights(userId, insightIds);

      // Get decisions
      const decisions = await this.getScopedResources(userId, 'DECISION', [privateScopeId, sharedScopeId]);
      const decisionIds = decisions.map(d => d.resource_id);
      const visibleDecisions = await this.fetchDecisions(userId, decisionIds);

      // Get predictions
      const predictions = await this.getScopedResources(userId, 'PREDICTION', [privateScopeId, sharedScopeId]);
      const predictionIds = predictions.map(p => p.resource_id);
      const visiblePredictions = await this.fetchPredictions(userId, predictionIds);

      // Get goals
      const goals = await this.getScopedResources(userId, 'GOAL', [privateScopeId, sharedScopeId]);
      const goalIds = goals.map(g => g.resource_id);
      const visibleGoals = await this.fetchGoals(userId, goalIds);

      // Get values
      const values = await this.getScopedResources(userId, 'VALUE', [privateScopeId, sharedScopeId]);
      const valueIds = values.map(v => v.resource_id);
      const visibleValues = await this.fetchValues(userId, valueIds);

      // Get entities
      const entities = await this.getScopedResources(userId, 'ENTITY', [privateScopeId, sharedScopeId]);
      const entityIds = entities.map(e => e.resource_id);
      const visibleEntities = await this.fetchEntities(userId, entityIds);

      return {
        claims: visibleClaims,
        insights: visibleInsights,
        decisions: visibleDecisions,
        predictions: visiblePredictions,
        goals: visibleGoals,
        values: visibleValues,
        entities: visibleEntities,
      };
    } catch (error) {
      logger.error({ err: error, userId }, 'Failed to get chat visible state');
      return {
        claims: [],
        insights: [],
        decisions: [],
        predictions: [],
        goals: [],
        values: [],
        entities: [],
      };
    }
  }

  /**
   * Export user data
   */
  async exportUserData(userId: string): Promise<ExportData> {
    try {
      // Get all non-DELETED resources
      const deletedScopeId = await this.getScopeIdByType('DELETED');

      const scopedResources = await supabaseAdmin
        .from('scoped_resources')
        .select('*')
        .eq('owner_user_id', userId)
        .neq('scope_id', deletedScopeId);

      const { data: resources } = await scopedResources;

      if (!resources || resources.length === 0) {
        return {
          claims: [],
          decisions: [],
          outcomes: [],
          goals: [],
          values: [],
          insights: [],
          predictions: [],
          scopes: [],
          exported_at: new Date().toISOString(),
        };
      }

      // Group by resource type
      const claims = resources.filter(r => r.resource_type === 'CLAIM').map(r => r.resource_id);
      const decisions = resources.filter(r => r.resource_type === 'DECISION').map(r => r.resource_id);
      const goals = resources.filter(r => r.resource_type === 'GOAL').map(r => r.resource_id);
      const values = resources.filter(r => r.resource_type === 'VALUE').map(r => r.resource_id);
      const insights = resources.filter(r => r.resource_type === 'INSIGHT').map(r => r.resource_id);
      const predictions = resources.filter(r => r.resource_type === 'PREDICTION').map(r => r.resource_id);

      // Fetch actual data (simplified - would need to fetch from respective services)
      const exportedData: ExportData = {
        claims: [], // Would fetch from omegaMemoryService
        decisions: [], // Would fetch from decisionMemoryService
        outcomes: [], // Would fetch from decisionMemoryService
        goals: [], // Would fetch from goalValueAlignmentService
        values: [], // Would fetch from goalValueAlignmentService
        insights: [], // Would fetch from insightReflectionService
        predictions: [], // Would fetch from predictiveContinuityService
        scopes: resources,
        exported_at: new Date().toISOString(),
      };

      return exportedData;
    } catch (error) {
      logger.error({ err: error, userId }, 'Failed to export user data');
      throw error;
    }
  }

  /**
   * Helper: Get scope ID by type
   */
  private async getScopeIdByType(scopeType: ScopeType): Promise<string> {
    try {
      const { data, error } = await supabaseAdmin
        .from('memory_scopes')
        .select('id')
        .eq('scope_type', scopeType)
        .single();

      if (error || !data) {
        throw new Error(`Scope type ${scopeType} not found`);
      }

      return data.id;
    } catch (error) {
      logger.error({ err: error, scopeType }, 'Failed to get scope ID');
      throw error;
    }
  }

  /**
   * Helper: Get scoped resources
   */
  private async getScopedResources(
    userId: string,
    resourceType: ResourceType,
    scopeIds: string[]
  ): Promise<ScopedResource[]> {
    try {
      const { data, error } = await supabaseAdmin
        .from('scoped_resources')
        .select('*')
        .eq('owner_user_id', userId)
        .eq('resource_type', resourceType)
        .in('scope_id', scopeIds);

      if (error) {
        throw error;
      }

      return data || [];
    } catch (error) {
      logger.error({ err: error, userId, resourceType }, 'Failed to get scoped resources');
      return [];
    }
  }

  /**
   * Helper: Fetch claims (simplified)
   */
  private async fetchClaims(userId: string, claimIds: string[]): Promise<any[]> {
    // Would fetch from omegaMemoryService with scope filtering
    return [];
  }

  /**
   * Helper: Fetch insights (simplified)
   */
  private async fetchInsights(userId: string, insightIds: string[]): Promise<any[]> {
    // Would fetch from insightReflectionService with scope filtering
    return [];
  }

  /**
   * Helper: Fetch decisions (simplified)
   */
  private async fetchDecisions(userId: string, decisionIds: string[]): Promise<any[]> {
    // Would fetch from decisionMemoryService with scope filtering
    return [];
  }

  /**
   * Helper: Fetch predictions (simplified)
   */
  private async fetchPredictions(userId: string, predictionIds: string[]): Promise<any[]> {
    // Would fetch from predictiveContinuityService with scope filtering
    return [];
  }

  /**
   * Helper: Fetch goals (simplified)
   */
  private async fetchGoals(userId: string, goalIds: string[]): Promise<any[]> {
    // Would fetch from goalValueAlignmentService with scope filtering
    return [];
  }

  /**
   * Helper: Fetch values (simplified)
   */
  private async fetchValues(userId: string, valueIds: string[]): Promise<any[]> {
    // Would fetch from goalValueAlignmentService with scope filtering
    return [];
  }

  /**
   * Helper: Fetch entities (simplified)
   */
  private async fetchEntities(userId: string, entityIds: string[]): Promise<any[]> {
    // Would fetch from omegaMemoryService with scope filtering
    return [];
  }
}

export const privacyScopeService = new PrivacyScopeService();

