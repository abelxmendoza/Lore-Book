// =====================================================
// ENTITY RESOLUTION SERVICE
// Purpose: Give users explicit control over people, places,
// orgs, and concepts the system has inferred
// =====================================================

import { logger } from '../logger';

import { correctionDashboardService } from './correctionDashboardService';
import { recordEntityConsolidation } from './consolidationProtocol';
import { supabaseAdmin } from './supabaseClient';
import { incrementEntityResolutionMetric } from './entities/entityResolutionMetrics';
import { assertEntityMergeAuthorized } from './entities/entityTypeCompatibility';

export type EntityType = 'CHARACTER' | 'LOCATION' | 'ENTITY' | 'ORG' | 'CONCEPT' | 'PERSON';
export type ConflictReason =
  | 'NAME_SIMILARITY'
  | 'CONTEXT_OVERLAP'
  | 'COREFERENCE'
  | 'TEMPORAL_OVERLAP';
export type ConflictStatus = 'OPEN' | 'MERGED' | 'DISMISSED';

export type ResolutionTier = 'PRIMARY' | 'SECONDARY' | 'TERTIARY';

export interface EntityCandidate {
  entity_id: string;
  primary_name: string;
  aliases: string[];
  entity_type: EntityType;
  confidence: number;
  usage_count: number;
  last_seen: string;
  source_table: string; // 'characters', 'locations', 'entities', 'omega_entities'
  is_user_visible: boolean;
  resolution_tier: ResolutionTier;
}

export interface EntityConflict {
  id: string;
  user_id: string;
  entity_a_id: string;
  entity_b_id: string;
  entity_a_type: EntityType;
  entity_b_type: EntityType;
  similarity_score: number;
  conflict_reason: ConflictReason;
  status: ConflictStatus;
  detected_at: string;
  resolved_at: string | null;
  metadata: Record<string, any>;
}

export interface EntityMergeRecord {
  id: string;
  user_id: string;
  source_entity_id: string;
  target_entity_id: string;
  source_entity_type: EntityType;
  target_entity_type: EntityType;
  merged_by: 'SYSTEM' | 'USER';
  reason: string | null;
  created_at: string;
  reversible: boolean;
  reverted_at: string | null;
  metadata: Record<string, any>;
}

export interface EntityResolutionDashboardData {
  entities: EntityCandidate[];
  conflicts: EntityConflict[];
  merge_history: EntityMergeRecord[];
}

export class EntityResolutionService {
  /**
   * Get all dashboard data for entity resolution
   */
  async getEntityResolutionDashboard(
    userId: string,
    options: {
      include_secondary?: boolean;
      include_tertiary?: boolean;
    } = {}
  ): Promise<EntityResolutionDashboardData> {
    const [entities, conflicts, mergeHistory] = await Promise.all([
      this.listEntities(userId, options),
      this.listEntityConflicts(userId),
      this.listEntityMergeHistory(userId),
    ]);

    return {
      entities,
      conflicts,
      merge_history: mergeHistory,
    };
  }

  /**
   * Batch-load usage counts for a set of entity IDs in O(1) queries.
   * Returns a Map<entityId, count>. Falls back to zero counts on error.
   */
  private async batchLoadUsageCounts(entityIds: string[]): Promise<Map<string, number>> {
    const countMap = new Map<string, number>();
    if (entityIds.length === 0) return countMap;

    try {
      const { data } = await supabaseAdmin
        .from('entity_unit_links')
        .select('entity_id')
        .in('entity_id', entityIds);

      for (const row of data ?? []) {
        countMap.set(row.entity_id, (countMap.get(row.entity_id) ?? 0) + 1);
      }
      return countMap;
    } catch {
      // entity_unit_links unavailable — fall through to per-table fallback
    }

    // Fallback: batch count from type-specific tables in parallel
    try {
      const [charCounts, locCounts, entityCounts] = await Promise.all([
        supabaseAdmin.from('character_memories').select('character_id').in('character_id', entityIds),
        supabaseAdmin.from('location_mentions').select('location_id').in('location_id', entityIds),
        supabaseAdmin.from('entity_mentions').select('entity_id').in('entity_id', entityIds),
      ]);

      for (const row of charCounts.data ?? []) {
        countMap.set(row.character_id, (countMap.get(row.character_id) ?? 0) + 1);
      }
      for (const row of locCounts.data ?? []) {
        countMap.set(row.location_id, (countMap.get(row.location_id) ?? 0) + 1);
      }
      for (const row of entityCounts.data ?? []) {
        countMap.set(row.entity_id, (countMap.get(row.entity_id) ?? 0) + 1);
      }
    } catch (err) {
      logger.debug({ err }, 'batchLoadUsageCounts: fallback tables unavailable, using zero counts');
    }

    return countMap;
  }

  /**
   * List all entities for a user with tiered loading
   */
  async listEntities(
    userId: string,
    options: {
      include_secondary?: boolean;
      include_tertiary?: boolean;
    } = {}
  ): Promise<EntityCandidate[]> {
    const entities: EntityCandidate[] = [];

    try {
      // ── Fetch all raw rows concurrently ──────────────────────────────────────
      const [
        { data: characters },
        { data: locations },
        { data: orgs },
        personResult,
        conceptResult,
        genericResult,
      ] = await Promise.all([
        supabaseAdmin.from('characters').select('id, name, alias, created_at, updated_at').eq('user_id', userId).order('updated_at', { ascending: false }),
        supabaseAdmin.from('locations').select('id, name, created_at, updated_at').eq('user_id', userId).order('updated_at', { ascending: false }),
        supabaseAdmin.from('entities').select('id, canonical_name, aliases, created_at, updated_at').eq('user_id', userId).eq('type', 'org').order('updated_at', { ascending: false }),
        options.include_secondary
          ? supabaseAdmin.from('omega_entities').select('id, primary_name, aliases, created_at, updated_at').eq('user_id', userId).eq('type', 'PERSON').neq('mention_status', 'mentioned_only').order('updated_at', { ascending: false })
          : Promise.resolve({ data: null, error: null }),
        options.include_tertiary
          ? supabaseAdmin.from('entities').select('id, canonical_name, aliases, created_at, updated_at').eq('user_id', userId).eq('type', 'thing').order('updated_at', { ascending: false })
          : Promise.resolve({ data: null, error: null }),
        options.include_tertiary
          ? supabaseAdmin.from('entities').select('id, canonical_name, aliases, created_at, updated_at').eq('user_id', userId).in('type', ['event', 'thing']).order('updated_at', { ascending: false })
          : Promise.resolve({ data: null, error: null }),
      ]);

      const persons = personResult.data;
      const concepts = conceptResult.data;
      const genericEntities = genericResult.data;

      // ── Batch-load ALL usage counts in 1–4 queries (not N×4) ─────────────────
      const allIds = [
        ...(characters ?? []).map((c: any) => c.id),
        ...(locations ?? []).map((l: any) => l.id),
        ...(orgs ?? []).map((o: any) => o.id),
        ...(persons ?? []).map((p: any) => p.id),
        ...(concepts ?? []).map((c: any) => c.id),
        ...(genericEntities ?? []).map((g: any) => g.id),
      ];
      const usageCountMap = await this.batchLoadUsageCounts(allIds);

      // ── Build EntityCandidates synchronously from pre-fetched data ───────────
      for (const char of characters ?? []) {
        const n = this.normalizeEntity(
          { id: char.id, name: char.name, aliases: Array.isArray(char.alias) ? char.alias : (char.alias ? [char.alias] : []), created_at: char.created_at, updated_at: char.updated_at },
          'CHARACTER', 'PRIMARY', 'characters', usageCountMap.get(char.id) ?? 0
        );
        if (n) entities.push(n);
      }

      for (const loc of locations ?? []) {
        const n = this.normalizeEntity(
          { id: loc.id, name: loc.name, aliases: [], created_at: loc.created_at, updated_at: loc.updated_at },
          'LOCATION', 'PRIMARY', 'locations', usageCountMap.get(loc.id) ?? 0
        );
        if (n) entities.push(n);
      }

      for (const org of orgs ?? []) {
        const n = this.normalizeEntity(
          { id: org.id, name: org.canonical_name, aliases: org.aliases ?? [], created_at: org.created_at, updated_at: org.updated_at },
          'ORG', 'PRIMARY', 'entities', usageCountMap.get(org.id) ?? 0
        );
        if (n) entities.push(n);
      }

      for (const person of persons ?? []) {
        const n = this.normalizeEntity(
          { id: person.id, name: person.primary_name, aliases: person.aliases ?? [], created_at: person.created_at, updated_at: person.updated_at },
          'PERSON', 'SECONDARY', 'omega_entities', usageCountMap.get(person.id) ?? 0
        );
        if (n) entities.push(n);
      }

      if (concepts || genericEntities) {
        const conceptIdSet = new Set((concepts ?? []).map((c: any) => c.id as string));

        for (const concept of concepts ?? []) {
          const n = this.normalizeEntity(
            { id: concept.id, name: concept.canonical_name, aliases: concept.aliases ?? [], created_at: concept.created_at, updated_at: concept.updated_at },
            'CONCEPT', 'TERTIARY', 'entities', usageCountMap.get(concept.id) ?? 0
          );
          if (n) entities.push(n);
        }

        for (const generic of genericEntities ?? []) {
          if (conceptIdSet.has(generic.id)) continue;
          const n = this.normalizeEntity(
            { id: generic.id, name: generic.canonical_name, aliases: generic.aliases ?? [], created_at: generic.created_at, updated_at: generic.updated_at },
            'ENTITY', 'TERTIARY', 'entities', usageCountMap.get(generic.id) ?? 0
          );
          if (n) entities.push(n);
        }
      }

      entities.sort((a, b) => {
        if (b.usage_count !== a.usage_count) return b.usage_count - a.usage_count;
        return new Date(b.last_seen).getTime() - new Date(a.last_seen).getTime();
      });

      return entities;
    } catch (error) {
      logger.error({ error, userId }, 'Failed to list entities');
      return [];
    }
  }

  /**
   * Normalize entity from different sources to unified shape
   */
  private normalizeEntity(
    row: {
      id: string;
      name: string;
      aliases: string[];
      created_at: string;
      updated_at: string;
    },
    entityType: EntityType,
    tier: ResolutionTier,
    sourceTable: string,
    usageCount: number
  ): EntityCandidate | null {
    try {
      const confidence = this.computeConfidence(usageCount, tier);
      return {
        entity_id: row.id,
        primary_name: row.name,
        aliases: row.aliases || [],
        entity_type: entityType,
        confidence,
        usage_count: usageCount,
        last_seen: row.updated_at || row.created_at,
        source_table: sourceTable,
        is_user_visible: tier === 'PRIMARY',
        resolution_tier: tier,
      };
    } catch (error) {
      logger.error({ error, entityId: row.id, entityType, tier }, 'Failed to normalize entity');
      return null;
    }
  }

  /**
   * Compute confidence score for an entity
   */
  private computeConfidence(usageCount: number, tier: ResolutionTier): number {
    // Base confidence on usage frequency
    // More usage = higher confidence (up to 0.9)
    const usageScore = Math.min(usageCount / 10, 0.9);

    // Tier-based confidence adjustment
    let tierMultiplier = 1.0;
    switch (tier) {
      case 'PRIMARY':
        tierMultiplier = 1.0; // Full confidence for user-facing entities
        break;
      case 'SECONDARY':
        tierMultiplier = 0.8; // Slightly lower for omega-internal
        break;
      case 'TERTIARY':
        tierMultiplier = 0.6; // Lower for advanced/debug entities
        break;
    }

    // Minimum confidence floor
    const baseConfidence = 0.3;
    const computed = baseConfidence + (usageScore * tierMultiplier);

    return Math.min(Math.max(computed, 0.0), 1.0);
  }

  /**
   * List open entity conflicts
   */
  async listEntityConflicts(userId: string): Promise<EntityConflict[]> {
    try {
      const { data, error } = await supabaseAdmin
        .from('entity_conflicts')
        .select('*')
        .eq('user_id', userId)
        .eq('status', 'OPEN')
        .order('similarity_score', { ascending: false })
        .limit(50);

      if (error) {
        throw error;
      }

      return (data || []).map(conflict => ({
        ...conflict,
        metadata: conflict.metadata || {},
      })) as EntityConflict[];
    } catch (error) {
      logger.error({ error, userId }, 'Failed to list entity conflicts');
      return [];
    }
  }

  /**
   * List entity merge history
   */
  async listEntityMergeHistory(userId: string): Promise<EntityMergeRecord[]> {
    try {
      const { data, error } = await supabaseAdmin
        .from('entity_merge_records')
        .select('*')
        .eq('user_id', userId)
        .is('reverted_at', null) // Only show non-reverted merges
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) {
        throw error;
      }

      return (data || []).map(merge => ({
        ...merge,
        metadata: merge.metadata || {},
      })) as EntityMergeRecord[];
    } catch (error) {
      logger.error({ error, userId }, 'Failed to list entity merge history');
      return [];
    }
  }

  /**
   * Merge two entities
   */
  async mergeEntities(
    userId: string,
    sourceId: string,
    targetId: string,
    sourceType: EntityType,
    targetType: EntityType,
    reason: string,
    options: { evidenceIds?: string[]; resolverVersion?: string } = {}
  ): Promise<void> {
    try {
      // Get source entity before merge
      const sourceEntity = await this.getEntity(userId, sourceId, sourceType);
      const targetEntity = await this.getEntity(userId, targetId, targetType);

      if (!sourceEntity || !targetEntity) {
        throw new Error('Source or target entity not found');
      }

      let authorization;
      try {
        authorization = assertEntityMergeAuthorized({
          sourceType,
          targetType,
          reason,
          evidenceIds: options.evidenceIds?.length
            ? options.evidenceIds
            : [`user-confirmation:${sourceId}:${targetId}`],
          resolverVersion: options.resolverVersion,
          actor: 'USER',
        });
      } catch (error) {
        incrementEntityResolutionMetric('merge_authorization_failures');
        incrementEntityResolutionMetric('merge_attempts_blocked');
        throw error;
      }

      const beforeSnapshot = { ...sourceEntity };

      // Re-link all references from source to target
      await this.reassignReferences(userId, sourceId, sourceType, targetId, targetType);

      // Mark source entity as merged (update metadata)
      await this.markEntityAsMerged(userId, sourceId, sourceType, targetId);

      // Record merge
      const { error: mergeError } = await supabaseAdmin
        .from('entity_merge_records')
        .insert({
          user_id: userId,
          source_entity_id: sourceId,
          target_entity_id: targetId,
          source_entity_type: sourceType,
          target_entity_type: targetType,
          merged_by: 'USER',
          reason,
          reversible: true,
          metadata: {
            merge_authorized: true,
            merge_authorization_reason: authorization.authorizationReason,
            resolver_version: authorization.resolverVersion,
            evidence_ids: authorization.evidenceIds,
            source_normalized_type: authorization.expectedType,
            target_normalized_type: authorization.candidateType,
          },
        });

      if (mergeError) {
        throw mergeError;
      }

      // Record correction
      await correctionDashboardService.recordCorrection(
        userId,
        'ENTITY',
        sourceId,
        'ENTITY_MERGE',
        beforeSnapshot,
        { ...targetEntity, merged_into: targetId },
        reason,
        'USER',
        true,
        { source_entity_id: sourceId, target_entity_id: targetId }
      );

      await recordEntityConsolidation({
        userId,
        action: 'ENTITY_MERGE',
        sourceArtifactType: 'entity',
        sourceArtifactId: sourceId,
        targetArtifactId: targetId,
        beforeState: beforeSnapshot,
        afterState: { merged_into: targetId, target_type: targetType, source_type: sourceType },
        rationale: reason,
      }).catch((err) => logger.warn({ err, userId, sourceId, targetId }, 'Entity merge cognition_mutations write failed'));

      // Update any open conflicts involving these entities
      await supabaseAdmin
        .from('entity_conflicts')
        .update({
          status: 'MERGED',
          resolved_at: new Date().toISOString(),
        })
        .eq('user_id', userId)
        .eq('status', 'OPEN')
        .or(`and(entity_a_id.eq.${sourceId},entity_b_id.eq.${targetId}),and(entity_a_id.eq.${targetId},entity_b_id.eq.${sourceId})`);

      logger.info({ userId, sourceId, targetId, reason }, 'Entities merged');
    } catch (error) {
      logger.error({ error, userId, sourceId, targetId }, 'Failed to merge entities');
      throw error;
    }
  }

  /**
   * Revert an entity merge
   */
  async revertEntityMerge(userId: string, mergeId: string): Promise<void> {
    try {
      // Get merge record
      const { data: merge, error: fetchError } = await supabaseAdmin
        .from('entity_merge_records')
        .select('*')
        .eq('id', mergeId)
        .eq('user_id', userId)
        .single();

      if (fetchError || !merge) {
        throw new Error('Merge record not found');
      }

      if (merge.reverted_at) {
        throw new Error('Merge already reverted');
      }

      // Restore source entity
      await this.restoreEntity(userId, merge.source_entity_id, merge.source_entity_type);

      // Restore references (re-link back to source)
      await this.restoreReferences(
        userId,
        merge.source_entity_id,
        merge.source_entity_type,
        merge.target_entity_id,
        merge.target_entity_type
      );

      // Mark merge as reverted
      const { error: updateError } = await supabaseAdmin
        .from('entity_merge_records')
        .update({
          reverted_at: new Date().toISOString(),
        })
        .eq('id', mergeId);

      if (updateError) {
        throw updateError;
      }

      // Record correction
      await correctionDashboardService.recordCorrection(
        userId,
        'ENTITY',
        merge.source_entity_id,
        'USER_CORRECTION',
        { merged_into: merge.target_entity_id },
        { restored: true },
        'User reverted entity merge',
        'USER',
        false,
        { merge_id: mergeId }
      );

      logger.info({ userId, mergeId }, 'Entity merge reverted');
    } catch (error) {
      logger.error({ error, userId, mergeId }, 'Failed to revert entity merge');
      throw error;
    }
  }

  /**
   * Edit an entity manually
   */
  async editEntity(
    userId: string,
    entityId: string,
    entityType: EntityType,
    updates: { name?: string; aliases?: string[]; metadata?: Record<string, any> }
  ): Promise<void> {
    try {
      const entity = await this.getEntity(userId, entityId, entityType);
      if (!entity) {
        throw new Error('Entity not found');
      }

      const beforeSnapshot = { ...entity };

      // Determine table name
      const tableName = this.getTableName(entityType);

      // Build update object
      const updateData: Record<string, any> = {};
      if (updates.name) updateData.name = updates.name;
      if (updates.metadata) {
        updateData.metadata = {
          ...(entity.metadata || {}),
          ...updates.metadata,
        };
      }

      // Update entity
      const { error: updateError } = await supabaseAdmin
        .from(tableName)
        .update(updateData)
        .eq('id', entityId)
        .eq('user_id', userId);

      if (updateError) {
        throw updateError;
      }

      // Record correction
      await correctionDashboardService.recordCorrection(
        userId,
        'ENTITY',
        entityId,
        'USER_CORRECTION',
        beforeSnapshot,
        { ...entity, ...updates },
        'Manual entity edit',
        'USER',
        true,
        { entity_type: entityType }
      );

      logger.info({ userId, entityId, entityType, updates }, 'Entity edited');
    } catch (error) {
      logger.error({ error, userId, entityId, entityType }, 'Failed to edit entity');
      throw error;
    }
  }

  /**
   * Dismiss a conflict
   */
  async dismissConflict(userId: string, conflictId: string): Promise<void> {
    try {
      const { error } = await supabaseAdmin
        .from('entity_conflicts')
        .update({
          status: 'DISMISSED',
          resolved_at: new Date().toISOString(),
        })
        .eq('id', conflictId)
        .eq('user_id', userId);

      if (error) {
        throw error;
      }

      logger.info({ userId, conflictId }, 'Conflict dismissed');
    } catch (error) {
      logger.error({ error, userId, conflictId }, 'Failed to dismiss conflict');
      throw error;
    }
  }

  /**
   * Create a new entity from user clarification
   */
  async createEntityFromClarification(
    userId: string,
    name: string,
    entityType: EntityType = 'CHARACTER'
  ): Promise<EntityCandidate> {
    try {
      const tableName = this.getTableName(entityType);
      
      // Create entity in appropriate table
      const { data, error } = await supabaseAdmin
        .from(tableName)
        .insert({
          user_id: userId,
          name: name,
          alias: [],
          metadata: {
            source: 'USER_CLARIFICATION',
            created_via: 'IADE',
          },
        })
        .select()
        .single();

      if (error) {
        throw error;
      }

      // Normalize to EntityCandidate format (usage count unknown at creation time — use 0)
      const normalized = this.normalizeEntity(
        {
          id: data.id,
          name: data.name,
          aliases: data.alias || [],
          created_at: data.created_at,
          updated_at: data.updated_at,
        },
        entityType,
        'PRIMARY',
        tableName,
        0
      );

      if (!normalized) {
        throw new Error('Failed to normalize created entity');
      }

      logger.info({ userId, entityId: data.id, name, entityType }, 'Created entity from user clarification');
      return normalized;
    } catch (error) {
      logger.error({ error, userId, name, entityType }, 'Failed to create entity from clarification');
      throw error;
    }
  }

  /**
   * Relink ExtractedUnits to a resolved entity
   */
  async relinkExtractedUnits(
    userId: string,
    mentionText: string,
    entityId: string,
    entityType: EntityType,
    messageId?: string
  ): Promise<void> {
    try {
      // Find ExtractedUnits that mention this text and haven't been resolved
      // We'll search in the extracted_units table for units linked to the message
      let query = supabaseAdmin
        .from('extracted_units')
        .select('id, entity_ids, metadata')
        .eq('user_id', userId);

      // If we have a message_id, find units from that message
      if (messageId) {
        // Get utterance IDs from the message
        const { data: utterances } = await supabaseAdmin
          .from('utterances')
          .select('id')
          .eq('user_id', userId)
          .eq('message_id', messageId);

        if (utterances && utterances.length > 0) {
          const utteranceIds = utterances.map(u => u.id);
          query = query.in('utterance_id', utteranceIds);
        }
      }

      const { data: units, error } = await query;

      if (error) {
        throw error;
      }

      if (!units || units.length === 0) {
        logger.debug({ userId, mentionText, messageId }, 'No ExtractedUnits found to relink');
        return;
      }

      // Update units that contain the mention text in their content
      // This is a simple heuristic - in production, you'd want more sophisticated matching
      const unitsToUpdate = units.filter(unit => {
        // Check if unit content mentions the text (case-insensitive)
        const content = (unit.metadata?.content || '').toLowerCase();
        return content.includes(mentionText.toLowerCase());
      });

      for (const unit of unitsToUpdate) {
        const currentEntityIds = (unit.entity_ids || []) as string[];
        
        // Add entity if not already present
        if (!currentEntityIds.includes(entityId)) {
          const updatedEntityIds = [...currentEntityIds, entityId];
          
          await supabaseAdmin
            .from('extracted_units')
            .update({
              entity_ids: updatedEntityIds,
              metadata: {
                ...(unit.metadata || {}),
                resolution_confidence: 'USER_CONFIRMED',
                resolved_at: new Date().toISOString(),
                resolved_mention: mentionText,
              },
            })
            .eq('id', unit.id);
        }
      }

      logger.info(
        { userId, mentionText, entityId, unitsUpdated: unitsToUpdate.length },
        'Relinked ExtractedUnits to entity'
      );
    } catch (error) {
      logger.error({ error, userId, mentionText, entityId }, 'Failed to relink ExtractedUnits');
      throw error;
    }
  }

  /**
   * Find candidate entities by mention text (PRIMARY tier only)
   * Used for disambiguation in chat
   */
  async findCandidates(
    userId: string,
    mentionText: string,
    options: {
      tier?: ResolutionTier;
      limit?: number;
    } = {}
  ): Promise<EntityCandidate[]> {
    const { tier = 'PRIMARY', limit = 3 } = options;
    const normalizedMention = mentionText.toLowerCase().trim();

    try {
      // Get all PRIMARY tier entities
      const allEntities = await this.listEntities(userId, {
        include_secondary: tier === 'SECONDARY',
        include_tertiary: tier === 'TERTIARY',
      });

      // Filter to only PRIMARY tier (user-visible)
      const primaryEntities = allEntities.filter(e => e.resolution_tier === 'PRIMARY');

      // Score candidates by name/alias similarity
      const candidates: Array<EntityCandidate & { similarityScore: number }> = [];

      for (const entity of primaryEntities) {
        let score = 0;

        // Exact name match
        if (entity.primary_name.toLowerCase() === normalizedMention) {
          score = 1.0;
        }
        // Name contains mention or vice versa
        else if (
          entity.primary_name.toLowerCase().includes(normalizedMention) ||
          normalizedMention.includes(entity.primary_name.toLowerCase())
        ) {
          score = 0.8;
        }
        // Alias match
        else if (entity.aliases.some(alias => alias.toLowerCase() === normalizedMention)) {
          score = 0.9;
        }
        // Alias contains mention
        else if (entity.aliases.some(alias => alias.toLowerCase().includes(normalizedMention))) {
          score = 0.7;
        }
        // Fuzzy match (first name, last name, etc.)
        else {
          const nameParts = entity.primary_name.toLowerCase().split(/\s+/);
          const mentionParts = normalizedMention.split(/\s+/);
          const matchingParts = nameParts.filter(part => mentionParts.some(m => part.includes(m) || m.includes(part)));
          if (matchingParts.length > 0) {
            score = 0.5 + (matchingParts.length / nameParts.length) * 0.2;
          }
        }

        if (score > 0) {
          candidates.push({ ...entity, similarityScore: score });
        }
      }

      // Sort by similarity score, then by usage count
      candidates.sort((a, b) => {
        if (b.similarityScore !== a.similarityScore) {
          return b.similarityScore - a.similarityScore;
        }
        return b.usage_count - a.usage_count;
      });

      // Return top candidates without similarityScore
      return candidates.slice(0, limit).map(({ similarityScore, ...entity }) => entity);
    } catch (error) {
      logger.error({ error, userId, mentionText }, 'Failed to find entity candidates');
      return [];
    }
  }

  // Private helper methods

  private async getEntity(
    userId: string,
    entityId: string,
    entityType: EntityType
  ): Promise<any> {
    const tableName = this.getTableName(entityType);
    const { data, error } = await supabaseAdmin
      .from(tableName)
      .select('*')
      .eq('id', entityId)
      .eq('user_id', userId)
      .single();

    if (error) {
      throw error;
    }
    return data;
  }

  private getTableName(entityType: EntityType): string {
    switch (entityType) {
      case 'CHARACTER':
        return 'characters';
      case 'LOCATION':
        return 'locations';
      case 'ORG':
      case 'CONCEPT':
      case 'ENTITY':
        return 'entities';
      case 'PERSON':
        return 'omega_entities';
      default:
        throw new Error(`Unknown entity type: ${entityType}`);
    }
  }

  private async reassignReferences(
    userId: string,
    sourceId: string,
    sourceType: EntityType,
    targetId: string,
    targetType: EntityType
  ): Promise<void> {
    // Update entity_unit_links
    await supabaseAdmin
      .from('entity_unit_links')
      .update({
        entity_id: targetId,
        entity_type: targetType,
      })
      .eq('entity_id', sourceId)
      .eq('entity_type', sourceType);

    // Update event_unit_links if entities are referenced in events
    // This would require checking if entities are linked to events through units
  }

  private async markEntityAsMerged(
    userId: string,
    entityId: string,
    entityType: EntityType,
    mergedIntoId: string
  ): Promise<void> {
    const tableName = this.getTableName(entityType);
    const { data: entity } = await supabaseAdmin
      .from(tableName)
      .select('metadata')
      .eq('id', entityId)
      .eq('user_id', userId)
      .single();

    await supabaseAdmin
      .from(tableName)
      .update({
        metadata: {
          ...(entity?.metadata || {}),
          merged: true,
          merged_into: mergedIntoId,
          merged_at: new Date().toISOString(),
        },
      })
      .eq('id', entityId)
      .eq('user_id', userId);
  }

  private async restoreEntity(
    userId: string,
    entityId: string,
    entityType: EntityType
  ): Promise<void> {
    const tableName = this.getTableName(entityType);
    const { data: entity } = await supabaseAdmin
      .from(tableName)
      .select('metadata')
      .eq('id', entityId)
      .eq('user_id', userId)
      .single();

    const metadata = entity?.metadata || {};
    delete metadata.merged;
    delete metadata.merged_into;
    delete metadata.merged_at;

    await supabaseAdmin
      .from(tableName)
      .update({
        metadata,
      })
      .eq('id', entityId)
      .eq('user_id', userId);
  }

  private async restoreReferences(
    userId: string,
    sourceId: string,
    sourceType: EntityType,
    targetId: string,
    targetType: EntityType
  ): Promise<void> {
    // Find references that were moved to target and restore them to source
    // This is complex - we'd need to track which references were moved
    // For now, we'll just log a warning
    logger.warn(
      { userId, sourceId, targetId },
      'Restore references not fully implemented - may need manual review'
    );
  }
}

export const entityResolutionService = new EntityResolutionService();
