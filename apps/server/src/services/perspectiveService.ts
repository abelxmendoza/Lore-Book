/**
 * LORE-KEEPER PERSPECTIVE-AWARE MEMORY LAYER
 * Service for managing multiple viewpoints on the same reality
 */

import OpenAI from 'openai';
import { supabaseAdmin } from './supabaseClient';
import { logger } from '../logger';
import { config } from '../config';
import { embeddingService } from './embeddingService';
import { continuityService } from './continuityService';
import type {
  Perspective,
  PerspectiveClaim,
  PerspectiveDispute,
  RankedPerspectiveClaim,
  PerspectiveContradiction,
  EntitySummaryWithPerspectives,
  PerspectiveClaimInput,
  PerspectiveInput,
  PerspectiveType,
  Sentiment,
} from '../types/perspective';

const openai = new OpenAI({ apiKey: config.openAiKey });

export class PerspectiveService {
  /**
   * Create a new perspective
   */
  async createPerspective(
    userId: string,
    perspectiveData: PerspectiveInput
  ): Promise<Perspective> {
    try {
      const { data, error } = await supabaseAdmin
        .from('perspectives')
        .insert({
          user_id: userId,
          type: perspectiveData.type,
          owner_entity_id: perspectiveData.owner_entity_id,
          label: perspectiveData.label,
          reliability_modifier: perspectiveData.reliability_modifier || 1.0,
        })
        .select()
        .single();

      if (error) {
        logger.error({ err: error, userId, perspectiveData }, 'Failed to create perspective');
        throw error;
      }

      return data;
    } catch (error) {
      logger.error({ err: error, userId }, 'Failed to create perspective');
      throw error;
    }
  }

  /**
   * Get or create default perspectives for a user
   */
  async getOrCreateDefaultPerspectives(userId: string): Promise<Perspective[]> {
    const defaultPerspectives = [
      { type: 'SELF' as PerspectiveType, label: 'Self', reliability_modifier: 1.0 },
      { type: 'SYSTEM' as PerspectiveType, label: 'System inference', reliability_modifier: 0.8 },
    ];

    const perspectives: Perspective[] = [];

    for (const def of defaultPerspectives) {
      // Check if exists
      const { data: existing } = await supabaseAdmin
        .from('perspectives')
        .select('*')
        .eq('user_id', userId)
        .eq('label', def.label)
        .single();

      if (existing) {
        perspectives.push(existing);
      } else {
        const created = await this.createPerspective(userId, def);
        perspectives.push(created);
      }
    }

    return perspectives;
  }

  /**
   * Ingest claim with perspective
   */
  async ingestClaimWithPerspective(
    userId: string,
    claim: any,
    perspectiveId: string
  ): Promise<PerspectiveClaim> {
    try {
      const perspectiveClaim: Partial<PerspectiveClaim> = {
        user_id: userId,
        base_claim_id: claim.id,
        perspective_id: perspectiveId,
        text: claim.text,
        confidence: claim.confidence || 0.6,
        sentiment: claim.sentiment,
        temporal_context: claim.metadata?.temporal_context || {},
        is_active: true,
      };

      const { data, error } = await supabaseAdmin
        .from('perspective_claims')
        .insert(perspectiveClaim)
        .select()
        .single();

      if (error) {
        logger.error({ err: error, userId, claimId: claim.id, perspectiveId }, 'Failed to create perspective claim');
        throw error;
      }

      // Record continuity event
      await continuityService.emitEvent(userId, {
        type: 'CLAIM_CREATED',
        context: {
          claim: claim.id,
          perspective: perspectiveId,
          perspective_claim: data.id,
        },
        explanation: `Perspective-based claim recorded from ${perspectiveId}`,
        related_claim_ids: [claim.id],
        initiated_by: 'SYSTEM',
        severity: 'INFO',
        reversible: true,
      });

      return data;
    } catch (error) {
      logger.error({ err: error, userId }, 'Failed to ingest claim with perspective');
      throw error;
    }
  }

  /**
   * Detect perspective contradictions
   */
  async detectPerspectiveContradictions(
    userId: string,
    baseClaimId: string
  ): Promise<PerspectiveContradiction[]> {
    try {
      // Get all perspective claims for this base claim
      const { data: perspectiveClaims, error } = await supabaseAdmin
        .from('perspective_claims')
        .select('*')
        .eq('user_id', userId)
        .eq('base_claim_id', baseClaimId)
        .eq('is_active', true);

      if (error || !perspectiveClaims || perspectiveClaims.length < 2) {
        return [];
      }

      const contradictions: PerspectiveContradiction[] = [];

      // Compare all pairs
      for (let i = 0; i < perspectiveClaims.length; i++) {
        for (let j = i + 1; j < perspectiveClaims.length; j++) {
          const pA = perspectiveClaims[i];
          const pB = perspectiveClaims[j];

          // Skip if same perspective
          if (pA.perspective_id === pB.perspective_id) continue;

          // Check semantic similarity
          const similarity = await this.semanticSimilarity(pA.text, pB.text);

          // Low similarity might indicate contradiction
          if (similarity < 0.3) {
            // Use LLM to verify if it's actually a contradiction
            const isContradiction = await this.llmDetectContradiction(pA.text, pB.text);

            if (isContradiction) {
              contradictions.push({
                perspective_claim_a: pA,
                perspective_claim_b: pB,
                similarity_score: similarity,
              });
            }
          }
        }
      }

      return contradictions;
    } catch (error) {
      logger.error({ err: error, userId, baseClaimId }, 'Failed to detect perspective contradictions');
      return [];
    }
  }

  /**
   * Mark perspective dispute
   */
  async markPerspectiveDispute(
    userId: string,
    baseClaimId: string,
    pClaimA: PerspectiveClaim,
    pClaimB: PerspectiveClaim,
    reason?: string
  ): Promise<PerspectiveDispute> {
    try {
      const { data, error } = await supabaseAdmin
        .from('perspective_disputes')
        .insert({
          user_id: userId,
          base_claim_id: baseClaimId,
          perspective_claim_a_id: pClaimA.id,
          perspective_claim_b_id: pClaimB.id,
          reason: reason || 'Perspective disagreement',
          is_resolved: false,
        })
        .select()
        .single();

      if (error) {
        logger.error({ err: error, userId, baseClaimId }, 'Failed to create perspective dispute');
        throw error;
      }

      return data;
    } catch (error) {
      logger.error({ err: error, userId }, 'Failed to mark perspective dispute');
      throw error;
    }
  }

  /**
   * Rank claims by perspective
   */
  async rankClaimsByPerspective(entityId: string, userId: string): Promise<RankedPerspectiveClaim[]> {
    try {
      // Get base claims for entity
      const { data: baseClaims } = await supabaseAdmin
        .from('omega_claims')
        .select('*')
        .eq('entity_id', entityId)
        .eq('is_active', true);

      if (!baseClaims || baseClaims.length === 0) {
        return [];
      }

      const results: RankedPerspectiveClaim[] = [];
      const now = Date.now();

      for (const claim of baseClaims) {
        // Get perspective claims
        const { data: perspectiveClaims } = await supabaseAdmin
          .from('perspective_claims')
          .select(`
            *,
            perspectives!inner(id, label, type, reliability_modifier)
          `)
          .eq('base_claim_id', claim.id)
          .eq('is_active', true);

        if (!perspectiveClaims || perspectiveClaims.length === 0) continue;

        // Get evidence count for base claim
        const { count: evidenceCount } = await supabaseAdmin
          .from('omega_evidence')
          .select('*', { count: 'exact', head: true })
          .eq('claim_id', claim.id);

        // Get evidence reliability
        const { data: evidence } = await supabaseAdmin
          .from('omega_evidence')
          .select('reliability_score')
          .eq('claim_id', claim.id);

        const evidenceReliability = evidence && evidence.length > 0
          ? evidence.reduce((sum, e) => sum + (e.reliability_score || 1.0), 0) / evidence.length
          : 0.5;

        for (const pc of perspectiveClaims) {
          const perspective = (pc as any).perspectives;

          // Calculate recency
          const recency = this.timeDecay(new Date(pc.created_at).getTime(), now);

          // Calculate score with perspective reliability
          const evidenceWeight = Math.min((evidenceCount || 0) / 10, 1.0);
          const perspectiveReliability = perspective.reliability_modifier || 1.0;

          const score =
            recency * 0.25 +
            pc.confidence * 0.25 +
            evidenceWeight * 0.15 +
            evidenceReliability * 0.15 +
            (perspectiveReliability * 0.5) * 0.20; // Perspective reliability weighted

          results.push({
            claim_id: claim.id,
            perspective_id: pc.perspective_id,
            perspective_label: perspective.label,
            perspective_type: perspective.type,
            score,
            text: pc.text,
            confidence: pc.confidence,
            sentiment: pc.sentiment,
          });
        }
      }

      // Sort by score descending
      return results.sort((a, b) => b.score - a.score);
    } catch (error) {
      logger.error({ err: error, entityId, userId }, 'Failed to rank claims by perspective');
      throw error;
    }
  }

  /**
   * Summarize entity with perspectives (non-collapsing)
   */
  async summarizeEntityWithPerspectives(
    entityId: string,
    userId: string
  ): Promise<EntitySummaryWithPerspectives> {
    try {
      const ranked = await this.rankClaimsByPerspective(entityId, userId);

      // Get entity
      const { data: entity } = await supabaseAdmin
        .from('omega_entities')
        .select('*')
        .eq('id', entityId)
        .single();

      if (!entity) {
        throw new Error('Entity not found');
      }

      // Group by perspective
      const perspectiveMap = new Map<string, RankedPerspectiveClaim[]>();
      for (const claim of ranked) {
        if (!perspectiveMap.has(claim.perspective_id)) {
          perspectiveMap.set(claim.perspective_id, []);
        }
        perspectiveMap.get(claim.perspective_id)!.push(claim);
      }

      // Get disputes
      const { data: disputes } = await supabaseAdmin
        .from('perspective_disputes')
        .select('*')
        .eq('user_id', userId)
        .eq('is_resolved', false)
        .in('base_claim_id', ranked.map(c => c.claim_id));

      // Find agreements (claims with similar text across perspectives)
      const agreements: Array<{ claim_id: string; perspectives: string[] }> = [];
      const claimGroups = new Map<string, RankedPerspectiveClaim[]>();
      for (const claim of ranked) {
        if (!claimGroups.has(claim.claim_id)) {
          claimGroups.set(claim.claim_id, []);
        }
        claimGroups.get(claim.claim_id)!.push(claim);
      }

      for (const [claimId, claims] of claimGroups.entries()) {
        if (claims.length > 1) {
          // Check if they're similar (agreement)
          const similarities = await Promise.all(
            claims.map(c => this.semanticSimilarity(claims[0].text, c.text))
          );
          const avgSimilarity = similarities.reduce((a, b) => a + b, 0) / similarities.length;
          if (avgSimilarity > 0.7) {
            agreements.push({
              claim_id: claimId,
              perspectives: claims.map(c => c.perspective_id),
            });
          }
        }
      }

      // Generate summary with LLM
      const perspectives = Array.from(perspectiveMap.entries()).map(([id, claims]) => {
        const firstClaim = claims[0];
        return {
          perspective_id: id,
          perspective_label: firstClaim.perspective_label,
          perspective_type: firstClaim.perspective_type,
          claims: claims.slice(0, 5), // Top 5 per perspective
        };
      });

      const summary = await this.generatePerspectiveSummary(
        entity.primary_name,
        perspectives,
        agreements,
        disputes || []
      );

      return {
        entity_id: entityId,
        summary,
        perspectives,
        disputes: disputes || [],
        agreements,
        uncertainties: [], // TODO: Detect uncertainties
      };
    } catch (error) {
      logger.error({ err: error, entityId, userId }, 'Failed to summarize entity with perspectives');
      throw error;
    }
  }

  /**
   * Evolve perspective claim
   */
  async evolvePerspectiveClaim(
    userId: string,
    pClaimId: string,
    newText: string
  ): Promise<PerspectiveClaim> {
    try {
      // Get existing claim
      const { data: existing, error: fetchError } = await supabaseAdmin
        .from('perspective_claims')
        .select('*')
        .eq('id', pClaimId)
        .eq('user_id', userId)
        .single();

      if (fetchError || !existing) {
        throw new Error('Perspective claim not found');
      }

      // Mark old as inactive
      await supabaseAdmin
        .from('perspective_claims')
        .update({
          is_active: false,
          ended_at: new Date().toISOString(),
        })
        .eq('id', pClaimId);

      // Create new claim
      const newConfidence = Math.max(0.1, existing.confidence - 0.1); // Slight decrease

      const { data: newClaim, error: createError } = await supabaseAdmin
        .from('perspective_claims')
        .insert({
          user_id: userId,
          base_claim_id: existing.base_claim_id,
          perspective_id: existing.perspective_id,
          text: newText,
          confidence: newConfidence,
          sentiment: existing.sentiment,
          temporal_context: existing.temporal_context,
          is_active: true,
        })
        .select()
        .single();

      if (createError) {
        throw createError;
      }

      // Record continuity event
      await continuityService.emitEvent(userId, {
        type: 'CLAIM_UPDATED',
        context: {
          old_claim: existing.id,
          new_claim: newClaim.id,
          perspective: existing.perspective_id,
        },
        explanation: 'Perspective evolved over time',
        related_claim_ids: [existing.base_claim_id],
        initiated_by: 'SYSTEM',
        severity: 'INFO',
        reversible: true,
      });

      return newClaim;
    } catch (error) {
      logger.error({ err: error, userId, pClaimId }, 'Failed to evolve perspective claim');
      throw error;
    }
  }

  /**
   * Helper: Calculate semantic similarity
   */
  private async semanticSimilarity(text1: string, text2: string): Promise<number> {
    try {
      const [embedding1, embedding2] = await Promise.all([
        embeddingService.embedText(text1),
        embeddingService.embedText(text2),
      ]);

      return this.cosineSimilarity(embedding1, embedding2);
    } catch (error) {
      logger.error({ err: error }, 'Failed to calculate semantic similarity');
      return 0;
    }
  }

  /**
   * Helper: Cosine similarity
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
   * Helper: LLM contradiction detection
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
      return response.is_contradiction === true && (response.confidence || 0) >= 0.7;
    } catch (error) {
      logger.error({ err: error }, 'Failed to detect contradiction with LLM');
      return false;
    }
  }

  /**
   * Helper: Time decay
   */
  private timeDecay(timestamp: number, now: number): number {
    const daysSince = (now - timestamp) / (1000 * 60 * 60 * 24);
    return Math.exp(-daysSince / 365); // Half-life of 1 year
  }

  /**
   * Helper: Generate perspective summary with LLM
   */
  private async generatePerspectiveSummary(
    entityName: string,
    perspectives: Array<{ perspective_id: string; perspective_label: string; perspective_type: PerspectiveType; claims: RankedPerspectiveClaim[] }>,
    agreements: Array<{ claim_id: string; perspectives: string[] }>,
    disputes: PerspectiveDispute[]
  ): Promise<string> {
    try {
      const completion = await openai.chat.completions.create({
        model: config.defaultModel || 'gpt-4o-mini',
        temperature: 0.3,
        messages: [
          {
            role: 'system',
            content: `You are a perspective-aware summarization system. Generate a summary that:
- Separates perspectives clearly
- Highlights agreements and disagreements
- Marks uncertain or disputed areas
- Does NOT force a single conclusion
- Preserves multiple viewpoints`
          },
          {
            role: 'user',
            content: `Entity: ${entityName}

Perspectives:
${JSON.stringify(perspectives, null, 2)}

Agreements: ${agreements.length}
Disputes: ${disputes.length}

Generate a comprehensive summary that preserves all perspectives.`
          }
        ]
      });

      return completion.choices[0]?.message?.content || `Summary for ${entityName} with ${perspectives.length} perspectives.`;
    } catch (error) {
      logger.error({ err: error }, 'Failed to generate perspective summary');
      return `Summary for ${entityName} with ${perspectives.length} perspectives.`;
    }
  }

  /**
   * Get perspective claims for a base claim
   */
  async getPerspectiveClaims(baseClaimId: string, userId: string): Promise<PerspectiveClaim[]> {
    try {
      const { data, error } = await supabaseAdmin
        .from('perspective_claims')
        .select('*')
        .eq('base_claim_id', baseClaimId)
        .eq('user_id', userId)
        .eq('is_active', true)
        .order('created_at', { ascending: false });

      if (error) {
        logger.error({ err: error, baseClaimId, userId }, 'Failed to get perspective claims');
        throw error;
      }

      return data || [];
    } catch (error) {
      logger.error({ err: error, baseClaimId, userId }, 'Failed to get perspective claims');
      throw error;
    }
  }

  /**
   * Get all perspectives for a user
   */
  async getPerspectives(userId: string): Promise<Perspective[]> {
    try {
      const { data, error } = await supabaseAdmin
        .from('perspectives')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) {
        logger.error({ err: error, userId }, 'Failed to get perspectives');
        throw error;
      }

      return data || [];
    } catch (error) {
      logger.error({ err: error, userId }, 'Failed to get perspectives');
      throw error;
    }
  }
}

export const perspectiveService = new PerspectiveService();

