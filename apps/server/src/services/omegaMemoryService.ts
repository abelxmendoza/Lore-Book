/**
 * OMEGA MEMORY ENGINE — Core Service
 * Time-aware, truth-seeking knowledge system
 */

import { supabaseAdmin } from './supabaseClient';
import { logger } from '../logger';
import type {
  Entity,
  Claim,
  Relationship,
  Evidence,
  EntityType,
  ClaimSource,
  RankedClaim,
  EntitySummary,
  UpdateSuggestion,
  IngestionResult,
} from '../types/omegaMemory';

export class OmegaMemoryService {
  /**
   * Ingest text and extract entities, claims, and relationships
   */
  async ingestText(userId: string, inputText: string, source: ClaimSource = 'USER'): Promise<IngestionResult> {
    try {
      // Step 1: Extract entities
      const candidateEntities = await this.extractEntities(inputText);
      
      // Step 2: Resolve entities (find existing or create new)
      const resolvedEntities = await this.resolveEntities(userId, candidateEntities);
      
      // Step 3: Extract claims
      const claims = await this.extractClaims(userId, inputText, resolvedEntities, source);
      
      // Step 4: Detect conflicts and mark inactive
      let conflictsDetected = 0;
      for (const claim of claims) {
        const existingClaims = await this.findSimilarClaims(userId, claim);
        
        if (await this.conflictDetected(claim, existingClaims)) {
          await this.markClaimsInactive(existingClaims);
          await this.lowerConfidence(existingClaims);
          conflictsDetected++;
        }
        
        await this.storeClaim(claim);
      }
      
      // Step 5: Extract relationships
      const relationships = await this.extractRelationships(userId, inputText, resolvedEntities);
      
      // Step 6: Update entity timestamps
      await this.updateEntityTimestamps(userId, resolvedEntities);
      
      // Step 7: Generate suggestions (but don't auto-apply)
      const suggestions = await this.suggestUpdates(userId, inputText, resolvedEntities, claims, relationships);
      
      return {
        entities: resolvedEntities,
        claims,
        relationships,
        conflicts_detected: conflictsDetected,
        suggestions,
      };
    } catch (error) {
      logger.error({ err: error, userId }, 'Failed to ingest text');
      throw error;
    }
  }

  /**
   * Extract entities from text using LLM or rule-based extraction
   */
  private async extractEntities(text: string): Promise<Array<{ name: string; type: EntityType }>> {
    // TODO: Implement LLM-based NER or rule-based extraction
    // For now, return empty array - will be implemented with OpenAI
    return [];
  }

  /**
   * Resolve entities: find existing by name/alias or create new
   */
  async resolveEntities(
    userId: string,
    candidates: Array<{ name: string; type: EntityType }>
  ): Promise<Entity[]> {
    const resolved: Entity[] = [];

    for (const candidate of candidates) {
      // Try to find by primary name
      let match = await this.findEntityByNameOrAlias(userId, candidate.name, candidate.type);

      if (!match) {
        // Create new entity
        match = await this.createEntity(userId, candidate.name, candidate.type);
      }

      resolved.push(match);
    }

    return resolved;
  }

  /**
   * Find entity by name or alias
   */
  async findEntityByNameOrAlias(
    userId: string,
    name: string,
    type: EntityType
  ): Promise<Entity | null> {
    const { data, error } = await supabaseAdmin
      .from('omega_entities')
      .select('*')
      .eq('user_id', userId)
      .eq('type', type)
      .or(`primary_name.ilike.%${name}%,aliases.cs.{${name}}`)
      .limit(1)
      .single();

    if (error && error.code !== 'PGRST116') {
      logger.error({ err: error, userId, name, type }, 'Failed to find entity');
      throw error;
    }

    return data || null;
  }

  /**
   * Create new entity
   */
  async createEntity(
    userId: string,
    name: string,
    type: EntityType,
    aliases: string[] = []
  ): Promise<Entity> {
    const { data, error } = await supabaseAdmin
      .from('omega_entities')
      .insert({
        user_id: userId,
        primary_name: name,
        type,
        aliases,
      })
      .select()
      .single();

    if (error) {
      logger.error({ err: error, userId, name, type }, 'Failed to create entity');
      throw error;
    }

    return data;
  }

  /**
   * Extract claims about entities from text
   */
  private async extractClaims(
    userId: string,
    text: string,
    entities: Entity[],
    source: ClaimSource
  ): Promise<Claim[]> {
    const claims: Claim[] = [];

    // TODO: Use LLM to extract statements about each entity
    // For now, create placeholder claims
    for (const entity of entities) {
      // TODO: Extract actual claim text about entity
      const claimText = `Mentioned: ${entity.primary_name}`;
      
      claims.push({
        id: '', // Will be set by storeClaim
        user_id: userId,
        entity_id: entity.id,
        text: claimText,
        source,
        confidence: 0.6,
        start_time: new Date().toISOString(),
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      } as Claim);
    }

    return claims;
  }

  /**
   * Extract relationships between entities
   */
  private async extractRelationships(
    userId: string,
    text: string,
    entities: Entity[]
  ): Promise<Relationship[]> {
    const relationships: Relationship[] = [];

    // TODO: Use LLM to extract relationships
    // For now, return empty array

    return relationships;
  }

  /**
   * Find similar claims for conflict detection
   */
  async findSimilarClaims(userId: string, claim: Claim): Promise<Claim[]> {
    const { data, error } = await supabaseAdmin
      .from('omega_claims')
      .select('*')
      .eq('user_id', userId)
      .eq('entity_id', claim.entity_id)
      .eq('is_active', true)
      .neq('id', claim.id || '');

    if (error) {
      logger.error({ err: error, userId, claimId: claim.id }, 'Failed to find similar claims');
      return [];
    }

    return data || [];
  }

  /**
   * Detect if new claim conflicts with existing claims
   */
  async conflictDetected(newClaim: Claim, existingClaims: Claim[]): Promise<boolean> {
    // TODO: Use semantic similarity to detect opposites
    // For now, simple text-based check
    for (const oldClaim of existingClaims) {
      if (this.semanticOpposite(newClaim.text, oldClaim.text)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Check if two texts are semantically opposite
   * TODO: Implement with LLM or better semantic analysis
   */
  private semanticOpposite(text1: string, text2: string): boolean {
    // Simple keyword-based check for now
    const opposites = [
      ['is', 'is not'],
      ['was', 'was not'],
      ['has', 'does not have'],
      ['likes', 'dislikes'],
      ['loves', 'hates'],
    ];

    const lower1 = text1.toLowerCase();
    const lower2 = text2.toLowerCase();

    for (const [pos, neg] of opposites) {
      if ((lower1.includes(pos) && lower2.includes(neg)) ||
          (lower1.includes(neg) && lower2.includes(pos))) {
        return true;
      }
    }

    return false;
  }

  /**
   * Mark claims as inactive
   */
  async markClaimsInactive(claims: Claim[]): Promise<void> {
    const now = new Date().toISOString();
    
    for (const claim of claims) {
      const { error } = await supabaseAdmin
        .from('omega_claims')
        .update({
          is_active: false,
          end_time: now,
          updated_at: now,
        })
        .eq('id', claim.id);

      if (error) {
        logger.error({ err: error, claimId: claim.id }, 'Failed to mark claim inactive');
      }
    }
  }

  /**
   * Lower confidence of claims
   */
  async lowerConfidence(claims: Claim[]): Promise<void> {
    for (const claim of claims) {
      const newConfidence = Math.max(0.1, claim.confidence - 0.2);
      
      const { error } = await supabaseAdmin
        .from('omega_claims')
        .update({
          confidence: newConfidence,
          updated_at: new Date().toISOString(),
        })
        .eq('id', claim.id);

      if (error) {
        logger.error({ err: error, claimId: claim.id }, 'Failed to lower confidence');
      }
    }
  }

  /**
   * Store a claim in the database
   */
  async storeClaim(claim: Partial<Claim>): Promise<Claim> {
    const { data, error } = await supabaseAdmin
      .from('omega_claims')
      .insert({
        user_id: claim.user_id!,
        entity_id: claim.entity_id!,
        text: claim.text!,
        source: claim.source!,
        confidence: claim.confidence ?? 0.6,
        sentiment: claim.sentiment,
        start_time: claim.start_time || new Date().toISOString(),
        end_time: claim.end_time,
        is_active: claim.is_active ?? true,
      })
      .select()
      .single();

    if (error) {
      logger.error({ err: error }, 'Failed to store claim');
      throw error;
    }

    return data;
  }

  /**
   * Update entity timestamps
   */
  async updateEntityTimestamps(userId: string, entities: Entity[]): Promise<void> {
    const now = new Date().toISOString();
    
    for (const entity of entities) {
      const { error } = await supabaseAdmin
        .from('omega_entities')
        .update({ updated_at: now })
        .eq('id', entity.id)
        .eq('user_id', userId);

      if (error) {
        logger.error({ err: error, entityId: entity.id }, 'Failed to update entity timestamp');
      }
    }
  }

  /**
   * Rank claims by truth score (recency + confidence + evidence)
   */
  async rankClaims(entityId: string): Promise<RankedClaim[]> {
    const { data: claims, error } = await supabaseAdmin
      .from('omega_claims')
      .select('*')
      .eq('entity_id', entityId)
      .eq('is_active', true)
      .order('start_time', { ascending: false });

    if (error) {
      logger.error({ err: error, entityId }, 'Failed to fetch claims for ranking');
      throw error;
    }

    // Get evidence counts for each claim
    const claimsWithEvidence = await Promise.all(
      (claims || []).map(async (claim) => {
        const { count } = await supabaseAdmin
          .from('omega_evidence')
          .select('*', { count: 'exact', head: true })
          .eq('claim_id', claim.id);

        return {
          ...claim,
          evidence_count: count || 0,
        };
      })
    );

    // Calculate scores
    const now = Date.now();
    const ranked = claimsWithEvidence.map((claim) => {
      const recencyWeight = this.timeDecay(new Date(claim.start_time).getTime(), now);
      const confidenceWeight = claim.confidence;
      const evidenceWeight = Math.min(claim.evidence_count / 10, 1.0); // Cap at 1.0

      const score = recencyWeight * 0.4 + confidenceWeight * 0.4 + evidenceWeight * 0.2;

      return {
        ...claim,
        score,
        evidence_count: claim.evidence_count,
      } as RankedClaim;
    });

    // Sort by score descending
    return ranked.sort((a, b) => b.score - a.score);
  }

  /**
   * Time decay function (exponential decay)
   */
  private timeDecay(timestamp: number, now: number): number {
    const daysSince = (now - timestamp) / (1000 * 60 * 60 * 24);
    return Math.exp(-daysSince / 365); // Half-life of 1 year
  }

  /**
   * Summarize entity with ranked claims
   */
  async summarizeEntity(entityId: string): Promise<EntitySummary> {
    const { data: entity, error: entityError } = await supabaseAdmin
      .from('omega_entities')
      .select('*')
      .eq('id', entityId)
      .single();

    if (entityError || !entity) {
      throw new Error('Entity not found');
    }

    const rankedClaims = await this.rankClaims(entityId);

    // Get active relationships
    const { data: relationships } = await supabaseAdmin
      .from('omega_relationships')
      .select('*')
      .eq('from_entity_id', entityId)
      .eq('is_active', true);

    // TODO: Use LLM to generate summary
    // For now, create a simple summary
    const summary = `Entity ${entity.primary_name} has ${rankedClaims.length} active claims. ` +
      `Most recent: ${rankedClaims[0]?.text || 'None'}`;

    return {
      entity,
      summary,
      ranked_claims: rankedClaims,
      active_relationships: relationships || [],
    };
  }

  /**
   * Suggest updates (AI analyzes, human approves)
   */
  async suggestUpdates(
    userId: string,
    inputText: string,
    entities: Entity[],
    claims: Claim[],
    relationships: Relationship[]
  ): Promise<UpdateSuggestion[]> {
    // TODO: Use LLM to analyze and suggest updates
    // For now, return empty array
    return [];
  }

  /**
   * Approve and apply an update suggestion
   */
  async approveUpdate(userId: string, suggestion: UpdateSuggestion): Promise<void> {
    switch (suggestion.type) {
      case 'new_claim':
        if (suggestion.proposed_data && suggestion.entity_id) {
          await this.storeClaim({
            ...(suggestion.proposed_data as Partial<Claim>),
            user_id: userId,
            entity_id: suggestion.entity_id,
          });
        }
        break;
      case 'end_claim':
        if (suggestion.claim_id) {
          const { data: claim } = await supabaseAdmin
            .from('omega_claims')
            .select('*')
            .eq('id', suggestion.claim_id)
            .eq('user_id', userId)
            .single();
          
          if (claim) {
            await this.markClaimsInactive([claim]);
          }
        }
        break;
      case 'relationship_change':
        // TODO: Implement relationship updates
        break;
      case 'entity_update':
        if (suggestion.entity_id && suggestion.proposed_data) {
          await supabaseAdmin
            .from('omega_entities')
            .update(suggestion.proposed_data)
            .eq('id', suggestion.entity_id)
            .eq('user_id', userId);
        }
        break;
    }
  }

  /**
   * Add evidence to a claim
   */
  async addEvidence(userId: string, claimId: string, content: string, source: string): Promise<Evidence> {
    const { data, error } = await supabaseAdmin
      .from('omega_evidence')
      .insert({
        user_id: userId,
        claim_id: claimId,
        content,
        source,
      })
      .select()
      .single();

    if (error) {
      logger.error({ err: error, userId, claimId }, 'Failed to add evidence');
      throw error;
    }

    return data;
  }

  /**
   * Get all entities for a user
   */
  async getEntities(userId: string, type?: EntityType): Promise<Entity[]> {
    let query = supabaseAdmin
      .from('omega_entities')
      .select('*')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false });

    if (type) {
      query = query.eq('type', type);
    }

    const { data, error } = await query;

    if (error) {
      logger.error({ err: error, userId, type }, 'Failed to get entities');
      throw error;
    }

    return data || [];
  }

  /**
   * Get claims for an entity
   */
  async getClaimsForEntity(userId: string, entityId: string, activeOnly: boolean = true): Promise<Claim[]> {
    let query = supabaseAdmin
      .from('omega_claims')
      .select('*')
      .eq('user_id', userId)
      .eq('entity_id', entityId)
      .order('start_time', { ascending: false });

    if (activeOnly) {
      query = query.eq('is_active', true);
    }

    const { data, error } = await query;

    if (error) {
      logger.error({ err: error, userId, entityId }, 'Failed to get claims');
      throw error;
    }

    return data || [];
  }
}

export const omegaMemoryService = new OmegaMemoryService();

