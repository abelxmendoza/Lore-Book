/**
 * OMEGA MEMORY ENGINE — Core Service
 * Time-aware, truth-seeking knowledge system
 * Enhanced with LLM, semantic similarity, evidence scoring, and temporal reasoning
 */

import OpenAI from 'openai';

import { config } from '../config';
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

import { continuityService } from './continuityService';
import { embeddingService } from './embeddingService';
import { memoryReviewQueueService } from './memoryReviewQueueService';
import { perspectiveService } from './perspectiveService';
import { supabaseAdmin } from './supabaseClient';

const openai = new OpenAI({ apiKey: config.openAiKey });

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
      
      // Step 4: Detect narrative divergence (observational, non-destructive)
      let divergencesDetected = 0;
      for (const claim of claims) {
        const existingClaims = await this.findSimilarClaims(userId, claim);
        
        if (await this.conflictDetected(claim, existingClaims)) {
          // NEW: Flag as narrative divergence instead of marking inactive
          // Keep all claims active - entries are never retroactively invalidated
          await this.flagNarrativeDivergence(claim, existingClaims);
          divergencesDetected++;
          
          // Record narrative divergence event (not contradiction)
          if (existingClaims.length > 0) {
            await continuityService.recordContradiction(
              userId,
              claim,
              existingClaims[0]
            );
          }
        }
        
        const storedClaim = await this.storeClaim(claim);
        
        // Record claim creation event
        const entity = resolvedEntities.find(e => e.id === claim.entity_id);
        if (entity) {
          await continuityService.recordClaimCreation(
            userId,
            storedClaim,
            inputText,
            entity
          );

          // Create perspective claim with default SELF perspective and use MRQ
          try {
            const defaultPerspectives = await perspectiveService.getOrCreateDefaultPerspectives(userId);
            const selfPerspective = defaultPerspectives.find(p => p.type === 'SELF');
            
            if (selfPerspective) {
              // Use MRQ for memory ingestion
              const { proposal, auto_approved } = await memoryReviewQueueService.ingestMemory(
                userId,
                storedClaim,
                entity,
                selfPerspective.id,
                inputText
              );

              // If not auto-approved, the proposal is queued for review
              if (!auto_approved) {
                logger.info({ proposalId: proposal.id, userId }, 'Memory proposal queued for review');
              }
            }
          } catch (error) {
            logger.info({ err: error, userId }, 'Failed to create perspective claim or MRQ proposal, continuing');
          }
        }
      }
      
      // Step 5: Extract relationships
      const relationships = await this.extractRelationships(userId, inputText, resolvedEntities);
      
      // Step 6: Update entity timestamps
      await this.updateEntityTimestamps(userId, resolvedEntities);
      
      // Step 7: Generate suggestions (but don't auto-apply)
      const suggestions = await this.suggestUpdates(userId, inputText, resolvedEntities, claims, relationships);
      
      // Track conflicts detected during processing
      const conflictsDetected = claims.some(claim => 
        claim.confidence < 0.5 || claim.metadata?.flagged === true
      );
      
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
   * Extract entities from text using LLM
   * Made public for mocking in tests
   */
  async extractEntities(text: string): Promise<Array<{ name: string; type: EntityType }>> {
    // FIX 1: Hard fail in tests - prevent LLM access during unit tests
    if (process.env.NODE_ENV === 'test' || process.env.VITEST) {
      throw new Error(
        'LLM access forbidden during unit tests. Mock extractEntities() in test setup.'
      );
    }

    try {
      const completion = await openai.chat.completions.create({
        model: config.defaultModel || 'gpt-4o-mini',
        temperature: 0.1,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: `You are an entity extraction system. Extract entities (people, characters, locations, organizations, events) from text.

Return JSON:
{
  "entities": [
    {
      "name": "entity name",
      "type": "PERSON" | "CHARACTER" | "LOCATION" | "ORG" | "EVENT",
      "aliases": ["alternative names"],
      "confidence": 0.0-1.0
    }
  ]
}

Only extract entities that are clearly mentioned. Be conservative with confidence scores.`
          },
          {
            role: 'user',
            content: `Extract entities from this text:\n\n${text.slice(0, 4000)}`
          }
        ]
      });

      const response = JSON.parse(completion.choices[0]?.message?.content || '{}');
      const entities = (response.entities || []).filter((e: any) => e.confidence >= 0.5);
      
      return entities.map((e: any) => ({
        name: e.name,
        type: e.type as EntityType,
      }));
    } catch (error: any) {
      // FIX 3: Never downgrade errors - throw instead of returning empty
      // FIX 4: Rate-limit circuit breaker
      if (error?.status === 429 || error?.code === 'rate_limit_exceeded' || error?.message?.includes('rate limit')) {
        logger.error({ err: error }, 'LLM rate limit exceeded - failing fast');
        throw new Error('LLM rate limit exceeded. Please retry later.');
      }
      
      logger.error({ err: error }, 'Failed to extract entities with LLM - throwing error');
      // Invalid IR is worse than no IR - throw instead of returning empty
      throw error;
    }
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
   * Find entity by name or alias, with semantic similarity fallback
   */
  async findEntityByNameOrAlias(
    userId: string,
    name: string,
    type: EntityType
  ): Promise<Entity | null> {
    // First try exact/alias match
    const { data: exactMatch, error: exactError } = await supabaseAdmin
      .from('omega_entities')
      .select('*')
      .eq('user_id', userId)
      .eq('type', type)
      .or(`primary_name.ilike.%${name}%,aliases.cs.{${name}}`)
      .limit(1)
      .single();

    if (exactMatch && !exactError) {
      // Record entity resolution
      await continuityService.recordEntityResolved(userId, exactMatch, 'exact_match');
      return exactMatch;
    }

    // If no exact match, try semantic similarity search
    try {
      const nameEmbedding = await embeddingService.embedText(name);
      
      // Find similar entities using vector similarity
      const { data: similarEntities, error: similarError } = await supabaseAdmin.rpc(
        'match_omega_entities',
        {
          query_embedding: `[${nameEmbedding.join(',')}]`,
          match_threshold: 0.7,
          match_count: 5,
          user_id_param: userId,
          type_param: type,
        }
      );

      if (similarEntities && similarEntities.length > 0) {
        // Record entity resolution via semantic match
        await continuityService.recordEntityResolved(userId, similarEntities[0], 'semantic_match');
        return similarEntities[0];
      }
    } catch (error) {
      logger.info({ err: error, userId, name, type }, 'Semantic search failed, using exact match only');
    }

    return null;
  }

  /**
   * Create new entity with embedding
   */
  async createEntity(
    userId: string,
    name: string,
    type: EntityType,
    aliases: string[] = []
  ): Promise<Entity> {
    // Generate embedding for entity name
    const embedding = await embeddingService.embedText(name);

    const { data, error } = await supabaseAdmin
      .from('omega_entities')
      .insert({
        user_id: userId,
        primary_name: name,
        type,
        aliases,
        embedding: `[${embedding.join(',')}]`,
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
   * Extract claims about entities from text using LLM
   */
  private async extractClaims(
    userId: string,
    text: string,
    entities: Entity[],
    source: ClaimSource
  ): Promise<Claim[]> {
    if (entities.length === 0) {
      return [];
    }

    try {
      const entityNames = entities.map(e => e.primary_name).join(', ');
      
      const completion = await openai.chat.completions.create({
        model: config.defaultModel || 'gpt-4o-mini',
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: `You are a claim extraction system. Extract factual claims about entities from text.

Return JSON:
{
  "claims": [
    {
      "entity_name": "name of entity",
      "text": "the claim statement",
      "sentiment": "POSITIVE" | "NEGATIVE" | "NEUTRAL" | "MIXED",
      "confidence": 0.0-1.0,
      "temporal_context": {
        "start_time": "ISO timestamp or null",
        "end_time": "ISO timestamp or null",
        "is_ongoing": boolean
      }
    }
  ]
}

Only extract clear factual claims. Include temporal context when available.`
          },
          {
            role: 'user',
            content: `Extract claims about these entities: ${entityNames}\n\nFrom this text:\n\n${text.slice(0, 4000)}`
          }
        ]
      });

      const response = JSON.parse(completion.choices[0]?.message?.content || '{}');
      const extractedClaims = response.claims || [];

      const claims: Claim[] = [];
      const now = new Date().toISOString();

      for (const extracted of extractedClaims) {
        // Find matching entity
        const entity = entities.find(e => 
          e.primary_name === extracted.entity_name || 
          e.aliases.includes(extracted.entity_name)
        );

        if (!entity || extracted.confidence < 0.5) continue;

        // Generate embedding for semantic similarity
        const embedding = await embeddingService.embedText(extracted.text);

        const temporalContext = extracted.temporal_context || {};
        const startTime = temporalContext.start_time || now;
        const endTime = temporalContext.end_time || null;

        claims.push({
          id: '', // Will be set by storeClaim
          user_id: userId,
          entity_id: entity.id,
          text: extracted.text,
          source,
          confidence: extracted.confidence || 0.6,
          sentiment: extracted.sentiment,
          start_time: startTime,
          end_time: endTime,
          is_active: true,
          created_at: now,
          updated_at: now,
          metadata: {
            temporal_context: temporalContext,
            temporal_confidence: temporalContext.temporal_confidence || 0.8,
          },
        } as Claim & { embedding?: number[] });

        // Store embedding separately (will be added to claim in storeClaim)
        (claims[claims.length - 1] as any).embedding = embedding;
      }

      return claims;
    } catch (error) {
      logger.error({ err: error }, 'Failed to extract claims with LLM');
      // Fallback to simple claims
      return entities.map(entity => ({
        id: '',
        user_id: userId,
        entity_id: entity.id,
        text: `Mentioned: ${entity.primary_name}`,
        source,
        confidence: 0.5,
        start_time: new Date().toISOString(),
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      } as Claim));
    }
  }

  /**
   * Extract relationships between entities using LLM
   */
  private async extractRelationships(
    userId: string,
    text: string,
    entities: Entity[]
  ): Promise<Relationship[]> {
    if (entities.length < 2) {
      return [];
    }

    try {
      const entityNames = entities.map(e => e.primary_name).join(', ');
      
      const completion = await openai.chat.completions.create({
        model: config.defaultModel || 'gpt-4o-mini',
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: `You are a relationship extraction system. Extract relationships between entities from text.

Return JSON:
{
  "relationships": [
    {
      "from_entity": "entity name",
      "to_entity": "entity name",
      "type": "relationship type (e.g., 'coach_of', 'friend_of', 'located_at', 'works_at')",
      "confidence": 0.0-1.0,
      "start_time": "ISO timestamp or null",
      "end_time": "ISO timestamp or null"
    }
  ]
}

Only extract clear relationships. Include temporal context when available.`
          },
          {
            role: 'user',
            content: `Extract relationships between these entities: ${entityNames}\n\nFrom this text:\n\n${text.slice(0, 4000)}`
          }
        ]
      });

      const response = JSON.parse(completion.choices[0]?.message?.content || '{}');
      const extracted = response.relationships || [];

      const relationships: Relationship[] = [];
      const now = new Date().toISOString();

      for (const rel of extracted) {
        if (rel.confidence < 0.5) continue;

        const fromEntity = entities.find(e => 
          e.primary_name === rel.from_entity || e.aliases.includes(rel.from_entity)
        );
        const toEntity = entities.find(e => 
          e.primary_name === rel.to_entity || e.aliases.includes(rel.to_entity)
        );

        if (!fromEntity || !toEntity) continue;

        relationships.push({
          id: '',
          user_id: userId,
          from_entity_id: fromEntity.id,
          to_entity_id: toEntity.id,
          type: rel.type,
          confidence: rel.confidence || 0.6,
          start_time: rel.start_time || now,
          end_time: rel.end_time || null,
          is_active: true,
          created_at: now,
          updated_at: now,
        } as Relationship);
      }

      return relationships;
    } catch (error) {
      logger.error({ err: error }, 'Failed to extract relationships with LLM');
      return [];
    }
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
   * Detect if new claim conflicts with existing claims using semantic similarity
   */
  async conflictDetected(newClaim: Claim, existingClaims: Claim[]): Promise<boolean> {
    if (existingClaims.length === 0) return false;

    try {
      // Get embedding for new claim
      const newEmbedding = await embeddingService.embedText(newClaim.text);

      // Check temporal overlap and semantic similarity
      for (const oldClaim of existingClaims) {
        // Check temporal overlap first (only conflicts matter if they overlap in time)
        const hasOverlap = this.temporalOverlap(
          new Date(newClaim.start_time),
          newClaim.end_time ? new Date(newClaim.end_time) : null,
          new Date(oldClaim.start_time),
          oldClaim.end_time ? new Date(oldClaim.end_time) : null
        );
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/86c57e9a-085e-405c-a06b-76f0f34d18b1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'omegaMemoryService.ts:525',message:'Temporal overlap check',data:{hasOverlap,newStart:newClaim.start_time,newEnd:newClaim.end_time,oldStart:oldClaim.start_time,oldEnd:oldClaim.end_time,timestamp:Date.now()},timestamp:Date.now(),sessionId:'debug-session',runId:'runtime',hypothesisId:'A'})}).catch(()=>{});
        // #endregion
        
        if (hasOverlap) {
          // Get old claim embedding if not cached
          let oldEmbedding: number[];
          if ((oldClaim as any).embedding) {
            oldEmbedding = (oldClaim as any).embedding;
          } else {
            oldEmbedding = await embeddingService.embedText(oldClaim.text);
            // Cache it
            (oldClaim as any).embedding = oldEmbedding;
          }

          // Calculate cosine similarity
          const similarity = this.cosineSimilarity(newEmbedding, oldEmbedding);
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/86c57e9a-085e-405c-a06b-76f0f34d18b1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'omegaMemoryService.ts:542',message:'Similarity calculated',data:{similarity,newText:newClaim.text,oldText:oldClaim.text,timestamp:Date.now()},timestamp:Date.now(),sessionId:'debug-session',runId:'runtime',hypothesisId:'B'})}).catch(()=>{});
          // #endregion
          
          // Low similarity + temporal overlap might indicate contradiction
          // Use LLM to verify if it's actually a contradiction
          if (similarity < 0.3) {
            const isContradiction = await this.llmDetectContradiction(newClaim.text, oldClaim.text);
            // #region agent log
            fetch('http://127.0.0.1:7242/ingest/86c57e9a-085e-405c-a06b-76f0f34d18b1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'omegaMemoryService.ts:547',message:'LLM contradiction check',data:{isContradiction,similarity,timestamp:Date.now()},timestamp:Date.now(),sessionId:'debug-session',runId:'runtime',hypothesisId:'C'})}).catch(()=>{});
            // #endregion
            if (isContradiction) {
              return true;
            }
          }
        }
      }

      return false;
    } catch (error) {
      logger.error({ err: error }, 'Failed to detect conflict with semantic similarity');
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/86c57e9a-085e-405c-a06b-76f0f34d18b1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'omegaMemoryService.ts:557',message:'Error in conflictDetected, using fallback',data:{errorMessage:error instanceof Error ? error.message : String(error),newText:newClaim.text,oldText:existingClaims[0]?.text,timestamp:Date.now()},timestamp:Date.now(),sessionId:'debug-session',runId:'runtime',hypothesisId:'D'})}).catch(()=>{});
      // #endregion
      // Fallback to simple text check
      const fallbackResult = this.semanticOpposite(newClaim.text, existingClaims[0]?.text || '');
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/86c57e9a-085e-405c-a06b-76f0f34d18b1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'omegaMemoryService.ts:559',message:'Fallback semanticOpposite result',data:{fallbackResult,newText:newClaim.text,oldText:existingClaims[0]?.text,timestamp:Date.now()},timestamp:Date.now(),sessionId:'debug-session',runId:'runtime',hypothesisId:'E'})}).catch(()=>{});
      // #endregion
      return fallbackResult;
    }
  }

  /**
   * Check temporal overlap between two time ranges
   */
  private temporalOverlap(
    start1: Date,
    end1: Date | null,
    start2: Date,
    end2: Date | null
  ): boolean {
    // If either is ongoing (no end), check if they overlap
    if (!end1) {
      return start2 <= start1 || (end2 !== null && end2 >= start1);
    }
    if (!end2) {
      return start1 <= start2 || end1 >= start2;
    }
    
    // Both have end times - check for overlap
    return start1 <= end2 && end1 >= start2;
  }

  /**
   * Calculate cosine similarity between two vectors
   */
  private cosineSimilarity(vec1: number[], vec2: number[]): number {
    if (vec1.length !== vec2.length) return 0;

    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;

    for (let i = 0; i < vec1.length; i++) {
      dotProduct += vec1[i] * vec2[i];
      norm1 += vec1[i] * vec1[i];
      norm2 += vec2[i] * vec2[i];
    }

    const denominator = Math.sqrt(norm1) * Math.sqrt(norm2);
    return denominator === 0 ? 0 : dotProduct / denominator;
  }

  /**
   * Use LLM to detect if two claims are contradictory
   */
  private async llmDetectContradiction(text1: string, text2: string): Promise<boolean> {
    try {
      const completion = await openai.chat.completions.create({
        model: config.defaultModel || 'gpt-4o-mini',
        temperature: 0.1,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: `You are a contradiction detection system. Determine if two claims contradict each other.

Return JSON:
{
  "is_contradiction": boolean,
  "confidence": 0.0-1.0,
  "reason": "brief explanation"
}

A contradiction means the claims cannot both be true at the same time.`
          },
          {
            role: 'user',
            content: `Claim 1: ${text1}\n\nClaim 2: ${text2}\n\nAre these contradictory?`
          }
        ]
      });

      const response = JSON.parse(completion.choices[0]?.message?.content || '{}');
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/86c57e9a-085e-405c-a06b-76f0f34d18b1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'omegaMemoryService.ts:652',message:'LLM response parsed',data:{response,isContradiction:response.is_contradiction,confidence:response.confidence,content:completion.choices[0]?.message?.content,timestamp:Date.now()},timestamp:Date.now(),sessionId:'debug-session',runId:'runtime',hypothesisId:'G'})}).catch(()=>{});
      // #endregion
      const result = response.is_contradiction === true && (response.confidence || 0) >= 0.7;
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/86c57e9a-085e-405c-a06b-76f0f34d18b1',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'omegaMemoryService.ts:655',message:'LLM contradiction result',data:{result,isContradiction:response.is_contradiction,confidence:response.confidence,timestamp:Date.now()},timestamp:Date.now(),sessionId:'debug-session',runId:'runtime',hypothesisId:'H'})}).catch(()=>{});
      // #endregion
      return result;
    } catch (error) {
      logger.error({ err: error }, 'Failed to detect contradiction with LLM');
      return false;
    }
  }

  /**
   * Check if two texts are semantically opposite (fallback)
   */
  private semanticOpposite(text1: string, text2: string): boolean {
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
   * Flag narrative divergence (non-destructive)
   * Keeps all claims active - entries are never retroactively invalidated
   */
  async flagNarrativeDivergence(newClaim: Claim, existingClaims: Claim[]): Promise<void> {
    try {
      // Update metadata to flag divergence, but keep claims active
      for (const claim of existingClaims) {
        await supabaseAdmin
          .from('omega_claims')
          .update({
            metadata: {
              ...(claim.metadata || {}),
              narrative_divergence: true,
              diverged_with: newClaim.id,
              diverged_at: new Date().toISOString(),
            },
          })
          .eq('id', claim.id);
      }
      
      // Also flag the new claim (if it has an id)
      if (newClaim.id) {
        await supabaseAdmin
          .from('omega_claims')
          .update({
            metadata: {
              ...(newClaim.metadata || {}),
              narrative_divergence: true,
              diverged_with: existingClaims.map(c => c.id),
              diverged_at: new Date().toISOString(),
            },
          })
          .eq('id', newClaim.id);
      }
      
      logger.info(
        { newClaimId: newClaim.id, existingCount: existingClaims.length },
        'Flagged narrative divergence (non-destructive)'
      );
    } catch (error) {
      logger.error({ error }, 'Failed to flag narrative divergence');
    }
  }

  /**
   * Mark claims as inactive when conflicts detected
   * @deprecated Use flagNarrativeDivergence instead - entries are never retroactively invalidated
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
   * Store a claim in the database with embedding
   */
  async storeClaim(claim: Partial<Claim> & { embedding?: number[] }): Promise<Claim> {
    const claimData: any = {
      user_id: claim.user_id!,
      entity_id: claim.entity_id!,
      text: claim.text!,
      source: claim.source!,
      confidence: claim.confidence ?? 0.6,
      sentiment: claim.sentiment,
      start_time: claim.start_time || new Date().toISOString(),
      end_time: claim.end_time,
      is_active: claim.is_active ?? true,
    };

    // Add embedding if provided
    if (claim.embedding) {
      claimData.embedding = `[${claim.embedding.join(',')}]`;
    }

    // Add temporal context from metadata
    if (claim.metadata?.temporal_context) {
      claimData.temporal_context = claim.metadata.temporal_context;
      claimData.temporal_confidence = claim.metadata.temporal_confidence || 0.8;
    }

    const { data, error } = await supabaseAdmin
      .from('omega_claims')
      .insert(claimData)
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
   * Merge two entities (with continuity tracking)
   */
  async mergeEntities(
    userId: string,
    sourceEntityId: string,
    targetEntityId: string
  ): Promise<{ success: boolean; event_id?: string }> {
    try {
      // Get entities
      const { data: sourceEntity } = await supabaseAdmin
        .from('omega_entities')
        .select('*')
        .eq('id', sourceEntityId)
        .eq('user_id', userId)
        .single();

      const { data: targetEntity } = await supabaseAdmin
        .from('omega_entities')
        .select('*')
        .eq('id', targetEntityId)
        .eq('user_id', userId)
        .single();

      if (!sourceEntity || !targetEntity) {
        throw new Error('Entities not found');
      }

      // Get claims for source entity
      const { data: sourceClaims } = await supabaseAdmin
        .from('omega_claims')
        .select('id')
        .eq('entity_id', sourceEntityId)
        .eq('user_id', userId);

      const mergedClaimIds = sourceClaims?.map(c => c.id) || [];

      // Update claims to point to target entity
      if (mergedClaimIds.length > 0) {
        await supabaseAdmin
          .from('omega_claims')
          .update({ entity_id: targetEntityId })
          .in('id', mergedClaimIds);
      }

      // Update relationships
      await supabaseAdmin
        .from('omega_relationships')
        .update({ from_entity_id: targetEntityId })
        .eq('from_entity_id', sourceEntityId)
        .eq('user_id', userId);

      await supabaseAdmin
        .from('omega_relationships')
        .update({ to_entity_id: targetEntityId })
        .eq('to_entity_id', sourceEntityId)
        .eq('user_id', userId);

      // Delete source entity
      await supabaseAdmin
        .from('omega_entities')
        .delete()
        .eq('id', sourceEntityId)
        .eq('user_id', userId);

      // Record merge event
      const event = await continuityService.recordEntityMerge(userId, {
        source_entity_id: sourceEntityId,
        target_entity_id: targetEntityId,
        merged_claim_ids: mergedClaimIds,
        source_entity: sourceEntity,
        target_entity: targetEntity,
      });

      return { success: true, event_id: event.id };
    } catch (error) {
      logger.error({ err: error, userId, sourceEntityId, targetEntityId }, 'Failed to merge entities');
      throw error;
    }
  }

  /**
   * Rank claims by truth score (recency + confidence + evidence + temporal confidence)
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

    // Get evidence-weighted scores for each claim
    const claimsWithEvidence = await Promise.all(
      (claims || []).map(async (claim) => {
        // Get evidence with reliability scores
        const { data: evidence } = await supabaseAdmin
          .from('omega_evidence')
          .select('reliability_score, source_type')
          .eq('claim_id', claim.id);

        // Calculate evidence-weighted score
        const evidenceCount = evidence?.length || 0;
        const evidenceWeightedScore = evidence && evidence.length > 0
          ? evidence.reduce((sum: number, e: any) => sum + (e.reliability_score || 1.0), 0) / evidence.length
          : 0.5;

        // Get temporal confidence from metadata or default
        const temporalConfidence = (claim as any).temporal_confidence || 
                                   (claim.metadata as any)?.temporal_confidence || 
                                   0.8;

        return {
          ...claim,
          evidence_count: evidenceCount,
          evidence_weighted_score: evidenceWeightedScore,
          temporal_confidence: temporalConfidence,
        };
      })
    );

    // Calculate scores with enhanced weighting
    const now = Date.now();
    const ranked = claimsWithEvidence.map((claim) => {
      const recencyWeight = this.timeDecay(new Date(claim.start_time).getTime(), now);
      const confidenceWeight = claim.confidence;
      const evidenceWeight = Math.min(claim.evidence_count / 10, 1.0); // Cap at 1.0
      const evidenceReliabilityWeight = claim.evidence_weighted_score || 0.5;
      const temporalWeight = claim.temporal_confidence || 0.8;

      // Enhanced scoring: recency (30%) + confidence (25%) + evidence count (15%) + evidence reliability (15%) + temporal (15%)
      const score = 
        recencyWeight * 0.30 +
        confidenceWeight * 0.25 +
        evidenceWeight * 0.15 +
        evidenceReliabilityWeight * 0.15 +
        temporalWeight * 0.15;

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
   * Summarize entity with ranked claims using LLM
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

    // Use LLM to generate comprehensive summary
    try {
      const topClaims = rankedClaims.slice(0, 10).map(c => ({
        text: c.text,
        confidence: c.confidence,
        score: c.score,
        start_time: c.start_time,
        end_time: c.end_time,
        evidence_count: c.evidence_count,
      }));

      const completion = await openai.chat.completions.create({
        model: config.defaultModel || 'gpt-4o-mini',
        temperature: 0.3,
        messages: [
          {
            role: 'system',
            content: `You are a narrative summarization system. Create a comprehensive summary of an entity based on ranked claims.

Consider:
- Temporal evolution (how the entity changed over time)
- Confidence levels and evidence
- Uncertainty when claims conflict or have low confidence
- Most reliable and recent information

Write a natural, narrative summary that captures the entity's story while noting any uncertainty or contradictions.`
          },
          {
            role: 'user',
            content: `Entity: ${entity.primary_name} (${entity.type})
            
Top Claims (ranked by truth score):
${JSON.stringify(topClaims, null, 2)}

Active Relationships: ${relationships?.length || 0}

Generate a comprehensive summary that:
1. Describes the entity's evolution over time
2. Highlights the most reliable information
3. Notes any uncertainty or contradictions
4. Incorporates temporal context`
          }
        ]
      });

      const summary = completion.choices[0]?.message?.content || 
        `Entity ${entity.primary_name} has ${rankedClaims.length} active claims.`;

      // Detect uncertainty notes
      const uncertaintyNotes: string[] = [];
      const lowConfidenceClaims = rankedClaims.filter(c => c.confidence < 0.6);
      if (lowConfidenceClaims.length > 0) {
        uncertaintyNotes.push(`${lowConfidenceClaims.length} claims have low confidence`);
      }

      const conflictingClaims = rankedClaims.filter(c => c.evidence_count === 0 && c.confidence < 0.7);
      if (conflictingClaims.length > 0) {
        uncertaintyNotes.push(`${conflictingClaims.length} claims lack supporting evidence`);
      }

      return {
        entity,
        summary,
        ranked_claims: rankedClaims,
        active_relationships: relationships || [],
        uncertainty_notes: uncertaintyNotes.length > 0 ? uncertaintyNotes : undefined,
      };
    } catch (error) {
      logger.error({ err: error, entityId }, 'Failed to generate LLM summary');
      // Fallback to simple summary
      const summary = `Entity ${entity.primary_name} has ${rankedClaims.length} active claims. ` +
        `Most recent: ${rankedClaims[0]?.text || 'None'}`;
      
      return {
        entity,
        summary,
        ranked_claims: rankedClaims,
        active_relationships: relationships || [],
      };
    }
  }

  /**
   * Suggest updates (AI analyzes, human approves) using LLM
   */
  async suggestUpdates(
    userId: string,
    inputText: string,
    entities: Entity[],
    claims: Claim[],
    relationships: Relationship[]
  ): Promise<UpdateSuggestion[]> {
    try {
      const completion = await openai.chat.completions.create({
        model: config.defaultModel || 'gpt-4o-mini',
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: `You are an update suggestion system. Analyze text and propose updates to the knowledge base.

Return JSON:
{
  "suggestions": [
    {
      "type": "new_claim" | "end_claim" | "relationship_change" | "entity_update",
      "entity_id": "entity ID if applicable",
      "claim_id": "claim ID if applicable",
      "relationship_id": "relationship ID if applicable",
      "description": "human-readable description of the suggestion",
      "confidence": 0.0-1.0,
      "proposed_data": { ... } // Relevant data for the update
    }
  ]
}

Only suggest high-confidence updates. Be conservative.`
          },
          {
            role: 'user',
            content: `Analyze this text and suggest updates:

Text: ${inputText.slice(0, 2000)}

Existing Entities: ${entities.map(e => e.primary_name).join(', ')}
New Claims: ${claims.length}
New Relationships: ${relationships.length}

Propose updates that should be reviewed before applying.`
          }
        ]
      });

      const response = JSON.parse(completion.choices[0]?.message?.content || '{}');
      return (response.suggestions || []).filter((s: any) => s.confidence >= 0.7);
    } catch (error) {
      logger.error({ err: error }, 'Failed to generate update suggestions');
      return [];
    }
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
   * Add evidence to a claim with reliability scoring
   */
  async addEvidence(
    userId: string, 
    claimId: string, 
    content: string, 
    source: string,
    sourceType: 'journal_entry' | 'chat' | 'external' | 'user_verified' | 'ai_inferred' = 'journal_entry'
  ): Promise<Evidence> {
    // Calculate reliability score based on source type
    const reliabilityScores: Record<string, number> = {
      'user_verified': 1.0,
      'journal_entry': 0.9,
      'chat': 0.7,
      'external': 0.5,
      'ai_inferred': 0.6,
    };

    const reliabilityScore = reliabilityScores[sourceType] || 0.5;

    const { data, error } = await supabaseAdmin
      .from('omega_evidence')
      .insert({
        user_id: userId,
        claim_id: claimId,
        content,
        source,
        source_type: sourceType,
        reliability_score: reliabilityScore,
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

