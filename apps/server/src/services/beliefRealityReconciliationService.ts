// =====================================================
// BELIEF–REALITY RECONCILIATION ENGINE (BRRE)
// Purpose: Track how beliefs evolve, resolve, or stay uncertain
// by comparing them against evidence (EXPERIENCE and FACT units)
// =====================================================

import { logger } from '../logger';
import { supabaseAdmin } from './supabaseClient';
import { embeddingService } from './embeddingService';
import type { KnowledgeUnit } from './knowledgeTypeEngineService';

export type BeliefResolutionStatus = 
  | 'UNRESOLVED'          // still open, no evidence yet
  | 'SUPPORTED'           // evidence aligns with belief
  | 'CONTRADICTED'        // evidence conflicts with belief
  | 'PARTIALLY_SUPPORTED' // mixed evidence
  | 'ABANDONED';          // user or time-based abandonment

export interface BeliefResolution {
  id: string;
  user_id: string;
  belief_unit_id: string;
  status: BeliefResolutionStatus;
  supporting_units: string[];
  contradicting_units: string[];
  resolution_confidence: number;
  explanation: string | null;
  last_evaluated_at: string;
  created_at: string;
  updated_at: string;
  metadata: Record<string, any>;
}

// Thresholds for evidence matching
const SEMANTIC_SIMILARITY_THRESHOLD = 0.7; // For alignment
const CONTRADICTION_THRESHOLD = 0.6; // For contradiction detection
const MIN_EVIDENCE_CONFIDENCE = 0.5; // Minimum confidence for evidence units

export class BeliefRealityReconciliationService {
  /**
   * Evaluate a belief against available evidence
   */
  async evaluateBelief(
    userId: string,
    beliefUnit: KnowledgeUnit
  ): Promise<BeliefResolution> {
    try {
      // Find related EXPERIENCE and FACT units (evidence)
      const evidence = await this.findRelatedEvidence(userId, beliefUnit);

      // Separate supporting and contradicting evidence
      const { supports, contradicts } = await this.classifyEvidence(
        beliefUnit,
        evidence
      );

      // Determine resolution status
      const status = this.determineStatus(supports, contradicts);

      // Compute resolution confidence
      const resolutionConfidence = this.computeResolutionConfidence(
        supports,
        contradicts
      );

      // Build explanation
      const explanation = this.buildExplanation(
        beliefUnit,
        supports,
        contradicts,
        status
      );

      // Get or create resolution record
      const existing = await this.getResolutionForBelief(userId, beliefUnit.id);

      if (existing) {
        // Update existing resolution
        const { data, error } = await supabaseAdmin
          .from('belief_resolutions')
          .update({
            status,
            supporting_units: supports.map(u => u.id),
            contradicting_units: contradicts.map(u => u.id),
            resolution_confidence,
            explanation,
            last_evaluated_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', existing.id)
          .select()
          .single();

        if (error) throw error;
        return data;
      } else {
        // Create new resolution
        const { data, error } = await supabaseAdmin
          .from('belief_resolutions')
          .insert({
            user_id: userId,
            belief_unit_id: beliefUnit.id,
            status,
            supporting_units: supports.map(u => u.id),
            contradicting_units: contradicts.map(u => u.id),
            resolution_confidence,
            explanation,
            last_evaluated_at: new Date().toISOString(),
          })
          .select()
          .single();

        if (error) throw error;

        // Phase 4: Check if this should trigger a contradiction alert
        try {
          const { contradictionAlertService } = await import('./contradictionAlertService');
          await contradictionAlertService.checkAndCreateAlerts(userId, beliefUnit.id);
        } catch (error) {
          logger.debug({ error, userId, beliefUnitId: beliefUnit.id }, 'Failed to check/create alert (non-blocking)');
        }

        return data;
      }
    } catch (error) {
      logger.error({ error, userId, beliefUnitId: beliefUnit.id }, 'Failed to evaluate belief');
      throw error;
    }
  }

  /**
   * Find related EXPERIENCE and FACT units that could serve as evidence
   */
  private async findRelatedEvidence(
    userId: string,
    beliefUnit: KnowledgeUnit
  ): Promise<KnowledgeUnit[]> {
    try {
      // Get all EXPERIENCE and FACT units created after the belief
      const { data: evidenceUnits, error } = await supabaseAdmin
        .from('knowledge_units')
        .select('*')
        .eq('user_id', userId)
        .in('knowledge_type', ['EXPERIENCE', 'FACT'])
        .gte('created_at', beliefUnit.created_at) // Only evidence that came after the belief
        .gte('confidence', MIN_EVIDENCE_CONFIDENCE)
        .order('created_at', { ascending: true })
        .limit(100); // Reasonable limit

      if (error) {
        logger.error({ error }, 'Failed to find related evidence');
        return [];
      }

      if (!evidenceUnits || evidenceUnits.length === 0) {
        return [];
      }

      // Filter by semantic similarity (if embeddings available)
      // For now, we'll use a simpler approach: check if entities/themes overlap
      const relevantEvidence = evidenceUnits.filter(unit => {
        // Check entity overlap
        const beliefEntities = (beliefUnit.entities || []).map((e: any) => e.id || e);
        const unitEntities = (unit.entities || []).map((e: any) => e.id || e);
        const entityOverlap = beliefEntities.some((id: string) => unitEntities.includes(id));

        // Check theme overlap
        const beliefThemes = (beliefUnit.themes || []).map((t: string) => t.toLowerCase());
        const unitThemes = (unit.themes || []).map((t: string) => t.toLowerCase());
        const themeOverlap = beliefThemes.some((t: string) => unitThemes.includes(t));

        return entityOverlap || themeOverlap;
      });

      return relevantEvidence;
    } catch (error) {
      logger.error({ error }, 'Failed to find related evidence');
      return [];
    }
  }

  /**
   * Classify evidence as supporting or contradicting
   */
  private async classifyEvidence(
    beliefUnit: KnowledgeUnit,
    evidence: KnowledgeUnit[]
  ): Promise<{ supports: KnowledgeUnit[]; contradicts: KnowledgeUnit[] }> {
    const supports: KnowledgeUnit[] = [];
    const contradicts: KnowledgeUnit[] = [];

    // Generate belief embedding for semantic comparison
    let beliefEmbedding: number[] | null = null;
    try {
      beliefEmbedding = await embeddingService.embedText(beliefUnit.content);
    } catch (error) {
      logger.debug({ error }, 'Failed to generate belief embedding, using fallback');
    }

    for (const unit of evidence) {
      try {
        // Simple keyword-based alignment check (fallback)
        const aligns = this.checkAlignment(beliefUnit, unit);

        // If embeddings available, use semantic similarity
        if (beliefEmbedding && unit.metadata?.embedding) {
          const similarity = this.computeSimilarity(
            beliefEmbedding,
            unit.metadata.embedding as number[]
          );

          if (similarity >= SEMANTIC_SIMILARITY_THRESHOLD) {
            supports.push(unit);
          } else if (similarity <= (1 - CONTRADICTION_THRESHOLD)) {
            // Check for explicit contradiction keywords
            if (this.checkContradiction(beliefUnit, unit)) {
              contradicts.push(unit);
            }
          }
        } else {
          // Fallback to keyword-based classification
          if (aligns) {
            supports.push(unit);
          } else if (this.checkContradiction(beliefUnit, unit)) {
            contradicts.push(unit);
          }
        }
      } catch (error) {
        logger.debug({ error, unitId: unit.id }, 'Failed to classify evidence unit');
      }
    }

    return { supports, contradicts };
  }

  /**
   * Simple keyword-based alignment check (fallback)
   */
  private checkAlignment(belief: KnowledgeUnit, evidence: KnowledgeUnit): boolean {
    const beliefText = belief.content.toLowerCase();
    const evidenceText = evidence.content.toLowerCase();

    // Check for shared entities
    const beliefEntities = (belief.entities || []).map((e: any) => 
      (e.name || e.id || '').toLowerCase()
    );
    const evidenceEntities = (evidence.entities || []).map((e: any) => 
      (e.name || e.id || '').toLowerCase()
    );
    const entityOverlap = beliefEntities.some(e => evidenceEntities.includes(e));

    // Check for shared themes
    const beliefThemes = (belief.themes || []).map(t => t.toLowerCase());
    const evidenceThemes = (evidence.themes || []).map(t => t.toLowerCase());
    const themeOverlap = beliefThemes.some(t => evidenceThemes.includes(t));

    return entityOverlap || themeOverlap;
  }

  /**
   * Check for explicit contradiction keywords
   */
  private checkContradiction(belief: KnowledgeUnit, evidence: KnowledgeUnit): boolean {
    const beliefText = belief.content.toLowerCase();
    const evidenceText = evidence.content.toLowerCase();

    // Contradiction patterns
    const contradictionPatterns = [
      /\b(not|didn't|wasn't|weren't|isn't|aren't|can't|couldn't|won't|wouldn't|shouldn't)\b/i,
      /\b(but|however|although|despite|instead|rather|opposite|contrary)\b/i,
      /\b(wrong|incorrect|false|mistaken|error|misunderstood)\b/i,
    ];

    // Check if evidence explicitly contradicts belief
    const hasContradictionKeywords = contradictionPatterns.some(pattern => 
      pattern.test(evidenceText)
    );

    // Check for entity overlap with contradiction
    const beliefEntities = (belief.entities || []).map((e: any) => 
      (e.name || e.id || '').toLowerCase()
    );
    const evidenceEntities = (evidence.entities || []).map((e: any) => 
      (e.name || e.id || '').toLowerCase()
    );
    const entityOverlap = beliefEntities.some(e => evidenceEntities.includes(e));

    return hasContradictionKeywords && entityOverlap;
  }

  /**
   * Compute cosine similarity between embeddings
   */
  private computeSimilarity(embedding1: number[], embedding2: number[]): number {
    if (embedding1.length !== embedding2.length) return 0;

    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;

    for (let i = 0; i < embedding1.length; i++) {
      dotProduct += embedding1[i] * embedding2[i];
      norm1 += embedding1[i] * embedding1[i];
      norm2 += embedding2[i] * embedding2[i];
    }

    const denominator = Math.sqrt(norm1) * Math.sqrt(norm2);
    return denominator === 0 ? 0 : dotProduct / denominator;
  }

  /**
   * Determine resolution status from evidence
   */
  private determineStatus(
    supports: KnowledgeUnit[],
    contradicts: KnowledgeUnit[]
  ): BeliefResolutionStatus {
    if (supports.length === 0 && contradicts.length === 0) {
      return 'UNRESOLVED';
    }

    if (supports.length > 0 && contradicts.length === 0) {
      return 'SUPPORTED';
    }

    if (supports.length === 0 && contradicts.length > 0) {
      return 'CONTRADICTED';
    }

    // Mixed evidence
    return 'PARTIALLY_SUPPORTED';
  }

  /**
   * Compute resolution confidence
   */
  private computeResolutionConfidence(
    supports: KnowledgeUnit[],
    contradicts: KnowledgeUnit[]
  ): number {
    const totalEvidence = supports.length + contradicts.length;
    if (totalEvidence === 0) return 0.5; // Neutral if no evidence

    // Weight by evidence confidence
    const supportWeight = supports.reduce((sum, u) => sum + u.confidence, 0);
    const contradictWeight = contradicts.reduce((sum, u) => sum + u.confidence, 0);

    const totalWeight = supportWeight + contradictWeight;
    if (totalWeight === 0) return 0.5;

    // Confidence is proportional to support weight
    const confidence = supportWeight / totalWeight;

    // Adjust based on evidence quantity (more evidence = higher confidence in resolution)
    const quantityBoost = Math.min(totalEvidence / 10, 0.2); // Max 0.2 boost

    return Math.min(1.0, confidence + quantityBoost);
  }

  /**
   * Build human-readable explanation
   */
  private buildExplanation(
    belief: KnowledgeUnit,
    supports: KnowledgeUnit[],
    contradicts: KnowledgeUnit[],
    status: BeliefResolutionStatus
  ): string {
    switch (status) {
      case 'UNRESOLVED':
        return 'This belief has not yet been evaluated against evidence.';
      
      case 'SUPPORTED':
        if (supports.length === 1) {
          return 'This belief was supported by a later experience or fact.';
        }
        return `This belief was supported by ${supports.length} later experiences or facts.`;
      
      case 'CONTRADICTED':
        if (contradicts.length === 1) {
          return 'This belief was contradicted by a later experience or fact.';
        }
        return `This belief was contradicted by ${contradicts.length} later experiences or facts.`;
      
      case 'PARTIALLY_SUPPORTED':
        return `This belief had mixed evidence: ${supports.length} supporting and ${contradicts.length} contradicting experiences or facts.`;
      
      case 'ABANDONED':
        return 'This belief was marked as abandoned.';
      
      default:
        return 'Resolution status unknown.';
    }
  }

  /**
   * Get resolution for a belief unit
   */
  async getResolutionForBelief(
    userId: string,
    beliefUnitId: string
  ): Promise<BeliefResolution | null> {
    const { data, error } = await supabaseAdmin
      .from('belief_resolutions')
      .select('*')
      .eq('user_id', userId)
      .eq('belief_unit_id', beliefUnitId)
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 = no rows
      logger.error({ error }, 'Failed to get belief resolution');
      return null;
    }

    return data || null;
  }

  /**
   * Get all resolutions for a user
   */
  async getResolutionsForUser(
    userId: string,
    status?: BeliefResolutionStatus
  ): Promise<BeliefResolution[]> {
    let query = supabaseAdmin
      .from('belief_resolutions')
      .select('*')
      .eq('user_id', userId)
      .order('last_evaluated_at', { ascending: false });

    if (status) {
      query = query.eq('status', status);
    }

    const { data, error } = await query;

    if (error) {
      logger.error({ error }, 'Failed to get belief resolutions');
      return [];
    }

    return data || [];
  }

  /**
   * Manually abandon a belief
   */
  async abandonBelief(
    userId: string,
    beliefUnitId: string,
    note?: string
  ): Promise<BeliefResolution> {
    const existing = await this.getResolutionForBelief(userId, beliefUnitId);

    if (existing) {
      const { data, error } = await supabaseAdmin
        .from('belief_resolutions')
        .update({
          status: 'ABANDONED',
          explanation: note || 'Manually abandoned by user.',
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id)
        .select()
        .single();

      if (error) throw error;
      return data;
    } else {
      // Create new resolution with ABANDONED status
      const { data, error } = await supabaseAdmin
        .from('belief_resolutions')
        .insert({
          user_id: userId,
          belief_unit_id: beliefUnitId,
          status: 'ABANDONED',
          supporting_units: [],
          contradicting_units: [],
          resolution_confidence: 0.0,
          explanation: note || 'Manually abandoned by user.',
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    }
  }

  /**
   * Re-evaluate all beliefs for a user (background job)
   */
  async reevaluateAllBeliefs(userId: string): Promise<number> {
    try {
      // Get all BELIEF units
      const { data: beliefUnits, error } = await supabaseAdmin
        .from('knowledge_units')
        .select('*')
        .eq('user_id', userId)
        .eq('knowledge_type', 'BELIEF')
        .order('created_at', { ascending: true });

      if (error) {
        logger.error({ error }, 'Failed to get belief units');
        return 0;
      }

      if (!beliefUnits || beliefUnits.length === 0) {
        return 0;
      }

      let evaluated = 0;
      for (const belief of beliefUnits) {
        try {
          await this.evaluateBelief(userId, belief);
          evaluated++;
        } catch (error) {
          logger.warn({ error, beliefId: belief.id }, 'Failed to evaluate belief');
        }
      }

      logger.info({ userId, evaluated, total: beliefUnits.length }, 'Re-evaluated beliefs');
      return evaluated;
    } catch (error) {
      logger.error({ error, userId }, 'Failed to re-evaluate all beliefs');
      return 0;
    }
  }

  /**
   * Get belief language for chat responses
   */
  getBeliefLanguage(resolution: BeliefResolution | null): string {
    if (!resolution) {
      return 'At the time, you believed…';
    }

    switch (resolution.status) {
      case 'UNRESOLVED':
        return 'At the time, you believed…';
      case 'SUPPORTED':
        return 'This belief was later supported by what happened.';
      case 'CONTRADICTED':
        return 'This belief was later contradicted by events.';
      case 'PARTIALLY_SUPPORTED':
        return 'Later experiences gave mixed signals.';
      case 'ABANDONED':
        return 'You later moved away from this belief.';
      default:
        return 'At the time, you believed…';
    }
  }

  /**
   * Check if a belief is eligible for pattern formation
   * Only SUPPORTED and PARTIALLY_SUPPORTED beliefs should form patterns
   */
  async isPatternEligible(
    userId: string,
    beliefUnitId: string
  ): Promise<boolean> {
    const resolution = await this.getResolutionForBelief(userId, beliefUnitId);
    
    if (!resolution) {
      return false; // No resolution = not eligible
    }

    return resolution.status === 'SUPPORTED' || resolution.status === 'PARTIALLY_SUPPORTED';
  }

  /**
   * Get analytics weight for a belief unit
   * Contradicted beliefs get low weight, supported get high weight
   */
  async getAnalyticsWeight(
    userId: string,
    beliefUnitId: string
  ): Promise<'LOW' | 'MEDIUM' | 'HIGH'> {
    const resolution = await this.getResolutionForBelief(userId, beliefUnitId);
    
    if (!resolution) {
      return 'MEDIUM'; // Default weight if no resolution
    }

    switch (resolution.status) {
      case 'CONTRADICTED':
        return 'LOW';
      case 'SUPPORTED':
        return 'HIGH';
      case 'PARTIALLY_SUPPORTED':
        return 'MEDIUM';
      case 'UNRESOLVED':
        return 'MEDIUM';
      case 'ABANDONED':
        return 'LOW';
      default:
        return 'MEDIUM';
    }
  }

  /**
   * Get numeric weight for analytics calculations
   */
  async getNumericWeight(
    userId: string,
    beliefUnitId: string
  ): Promise<number> {
    const weight = await this.getAnalyticsWeight(userId, beliefUnitId);
    
    switch (weight) {
      case 'LOW':
        return 0.3;
      case 'MEDIUM':
        return 0.7;
      case 'HIGH':
        return 1.0;
      default:
        return 0.7;
    }
  }

  /**
   * Batch check pattern eligibility for multiple beliefs
   */
  async batchCheckPatternEligibility(
    userId: string,
    beliefUnitIds: string[]
  ): Promise<Record<string, boolean>> {
    const results: Record<string, boolean> = {};
    
    // Get all resolutions in one query
    const { data: resolutions, error } = await supabaseAdmin
      .from('belief_resolutions')
      .select('belief_unit_id, status')
      .eq('user_id', userId)
      .in('belief_unit_id', beliefUnitIds);

    if (error) {
      logger.error({ error }, 'Failed to batch check pattern eligibility');
      // Return all false on error
      beliefUnitIds.forEach(id => { results[id] = false; });
      return results;
    }

    const resolutionMap = new Map(
      (resolutions || []).map(r => [r.belief_unit_id, r.status])
    );

    beliefUnitIds.forEach(id => {
      const status = resolutionMap.get(id);
      results[id] = status === 'SUPPORTED' || status === 'PARTIALLY_SUPPORTED';
    });

    return results;
  }

  /**
   * Batch get analytics weights for multiple beliefs
   */
  async batchGetAnalyticsWeights(
    userId: string,
    beliefUnitIds: string[]
  ): Promise<Record<string, number>> {
    const results: Record<string, number> = {};
    
    // Get all resolutions in one query
    const { data: resolutions, error } = await supabaseAdmin
      .from('belief_resolutions')
      .select('belief_unit_id, status')
      .eq('user_id', userId)
      .in('belief_unit_id', beliefUnitIds);

    if (error) {
      logger.error({ error }, 'Failed to batch get analytics weights');
      // Return all medium weight on error
      beliefUnitIds.forEach(id => { results[id] = 0.7; });
      return results;
    }

    const resolutionMap = new Map(
      (resolutions || []).map(r => [r.belief_unit_id, r.status])
    );

    beliefUnitIds.forEach(id => {
      const status = resolutionMap.get(id);
      switch (status) {
        case 'CONTRADICTED':
        case 'ABANDONED':
          results[id] = 0.3;
          break;
        case 'SUPPORTED':
          results[id] = 1.0;
          break;
        case 'PARTIALLY_SUPPORTED':
        case 'UNRESOLVED':
        default:
          results[id] = 0.7;
          break;
      }
    });

    return results;
  }
}

export const beliefRealityReconciliationService = new BeliefRealityReconciliationService();

