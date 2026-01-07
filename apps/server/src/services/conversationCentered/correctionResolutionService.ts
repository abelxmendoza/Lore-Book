// =====================================================
// CORRECTION RESOLUTION SERVICE
// Purpose: Handle user corrections, contradictions, and information pruning
// =====================================================

import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';
import { correctionDashboardService } from '../correctionDashboardService';
import { knowledgeTypeEngineService } from '../knowledgeTypeEngineService';
import type { ExtractedUnit } from '../../types/conversationCentered';

export interface CorrectionLink {
  correction_unit_id: string;
  corrected_unit_id: string;
  correction_type: 'EXPLICIT' | 'IMPLICIT' | 'CONTRADICTION';
  confidence: number;
}

export interface ContradictionResolution {
  unit_id: string;
  contradicted_unit_id: string;
  resolution: 'NEW_WINS' | 'OLD_WINS' | 'BOTH_DEPRECATED' | 'NEEDS_REVIEW';
  reason: string;
  confidence: number;
}

/**
 * Service for handling corrections and contradiction resolution
 */
export class CorrectionResolutionService {
  /**
   * Detect if a unit is correcting a previous unit
   */
  async detectCorrection(
    userId: string,
    newUnit: ExtractedUnit,
    conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>
  ): Promise<{
    isCorrection: boolean;
    correctedUnitIds: string[];
    correctionType: 'EXPLICIT' | 'IMPLICIT' | 'CONTRADICTION';
    confidence: number;
  }> {
    // Check if unit is explicitly a CORRECTION type
    if (newUnit.type === 'CORRECTION') {
      const correctedIds = await this.findUnitsBeingCorrected(userId, newUnit, conversationHistory);
      return {
        isCorrection: true,
        correctedUnitIds: correctedIds,
        correctionType: 'EXPLICIT',
        confidence: 0.9,
      };
    }

    // Check for implicit corrections (contradictions with high confidence)
    const contradictions = await this.findContradictions(userId, newUnit);
    if (contradictions.length > 0) {
      // If new unit has higher confidence and is more recent, it's likely a correction
      const recentContradictions = contradictions.filter(c => {
        // New unit wins if it has higher confidence or is explicitly correcting
        return newUnit.confidence > c.confidence || this.isExplicitCorrection(newUnit.content);
      });

      if (recentContradictions.length > 0) {
        return {
          isCorrection: true,
          correctedUnitIds: recentContradictions.map(c => c.id),
          correctionType: 'IMPLICIT',
          confidence: 0.7,
        };
      }
    }

    return {
      isCorrection: false,
      correctedUnitIds: [],
      correctionType: 'CONTRADICTION',
      confidence: 0.0,
    };
  }

  /**
   * Process a correction: link it to corrected units and deprecate them
   */
  async processCorrection(
    userId: string,
    correctionUnit: ExtractedUnit,
    correctedUnitIds: string[],
    correctionType: 'EXPLICIT' | 'IMPLICIT' | 'CONTRADICTION'
  ): Promise<void> {
    try {
      for (const correctedUnitId of correctedUnitIds) {
        // Create correction link
        await this.createCorrectionLink(correctionUnit.id, correctedUnitId, correctionType);

        // Deprecate the corrected unit (this will also record the correction)
        await this.deprecateUnit(userId, correctedUnitId, {
          reason: correctionType === 'EXPLICIT' ? 'Corrected by user' : 'Auto-corrected due to contradiction',
          correction_unit_id: correctionUnit.id,
          correction_type: correctionType,
        });

        // Lower confidence of related units (cascade effect)
        await this.lowerConfidenceOfRelatedUnits(userId, correctedUnitId, 0.2);
      }

      logger.info(
        {
          correctionUnitId: correctionUnit.id,
          correctedUnitIds,
          correctionType,
        },
        'Correction processed'
      );
    } catch (error) {
      logger.error({ error, correctionUnitId: correctionUnit.id }, 'Failed to process correction');
      throw error;
    }
  }

  /**
   * Resolve contradictions between units
   */
  async resolveContradiction(
    userId: string,
    unit1Id: string,
    unit2Id: string,
    resolution: 'NEW_WINS' | 'OLD_WINS' | 'BOTH_DEPRECATED' | 'NEEDS_REVIEW',
    reason?: string
  ): Promise<ContradictionResolution> {
    try {
      const [unit1, unit2] = await Promise.all([
        this.getUnit(unit1Id),
        this.getUnit(unit2Id),
      ]);

      if (!unit1 || !unit2) {
        throw new Error('One or both units not found');
      }

      // Determine which is newer
      const unit1Time = new Date(unit1.created_at).getTime();
      const unit2Time = new Date(unit2.created_at).getTime();
      const newerUnit = unit1Time > unit2Time ? unit1 : unit2;
      const olderUnit = unit1Time > unit2Time ? unit2 : unit1;

      let deprecatedIds: string[] = [];
      let winningId: string;

      switch (resolution) {
        case 'NEW_WINS':
          deprecatedIds = [olderUnit.id];
          winningId = newerUnit.id;
          await this.deprecateUnit(userId, olderUnit.id, {
            reason: 'superseded_by_newer',
            superseded_by: newerUnit.id,
          });
          break;

        case 'OLD_WINS':
          deprecatedIds = [newerUnit.id];
          winningId = olderUnit.id;
          await this.deprecateUnit(userId, newerUnit.id, {
            reason: 'superseded_by_older',
            superseded_by: olderUnit.id,
          });
          break;

        case 'BOTH_DEPRECATED':
          deprecatedIds = [unit1.id, unit2.id];
          winningId = unit1.id; // Arbitrary, both are deprecated
          await Promise.all([
            this.deprecateUnit(userId, unit1.id, {
              reason: 'contradiction_unresolved',
              contradicted_by: unit2.id,
            }),
            this.deprecateUnit(userId, unit2.id, {
              reason: 'contradiction_unresolved',
              contradicted_by: unit1.id,
            }),
          ]);
          break;

        case 'NEEDS_REVIEW':
          // Mark both for review but don't deprecate
          await Promise.all([
            this.markForReview(userId, unit1.id, {
              reason: 'contradiction_needs_review',
              contradicted_by: unit2.id,
            }),
            this.markForReview(userId, unit2.id, {
              reason: 'contradiction_needs_review',
              contradicted_by: unit1.id,
            }),
          ]);
          winningId = unit1.id; // Neither wins yet
          break;
      }

      const result: ContradictionResolution = {
        unit_id: unit1Id,
        contradicted_unit_id: unit2Id,
        resolution,
        reason: reason || `Resolved as ${resolution}`,
        confidence: resolution === 'NEEDS_REVIEW' ? 0.5 : 0.8,
      };

      logger.info({ resolution: result }, 'Contradiction resolved');

      return result;
    } catch (error) {
      logger.error({ error, unit1Id, unit2Id }, 'Failed to resolve contradiction');
      throw error;
    }
  }

  /**
   * Auto-resolve contradictions based on confidence and recency
   */
  async autoResolveContradictions(
    userId: string,
    newUnit: ExtractedUnit
  ): Promise<ContradictionResolution[]> {
    const contradictions = await this.findContradictions(userId, newUnit);
    const resolutions: ContradictionResolution[] = [];

    for (const contradicted of contradictions) {
      // Auto-resolve: newer unit with higher confidence wins
      const newUnitTime = new Date(newUnit.created_at).getTime();
      const oldUnitTime = new Date(contradicted.created_at).getTime();
      const timeDiff = newUnitTime - oldUnitTime;
      const confidenceDiff = newUnit.confidence - contradicted.confidence;

      let resolution: 'NEW_WINS' | 'OLD_WINS' | 'BOTH_DEPRECATED' | 'NEEDS_REVIEW';

      // If new unit is much more recent (>7 days) and has higher confidence, it wins
      if (timeDiff > 7 * 24 * 60 * 60 * 1000 && confidenceDiff > 0.2) {
        resolution = 'NEW_WINS';
      }
      // If old unit has much higher confidence, it wins
      else if (confidenceDiff < -0.3) {
        resolution = 'OLD_WINS';
      }
      // If both have similar confidence and are recent, needs review
      else if (Math.abs(confidenceDiff) < 0.2 && timeDiff < 7 * 24 * 60 * 60 * 1000) {
        resolution = 'NEEDS_REVIEW';
      }
      // Default: newer wins if confidence is similar
      else {
        resolution = 'NEW_WINS';
      }

      const result = await this.resolveContradiction(
        userId,
        newUnit.id,
        contradicted.id,
        resolution,
        `Auto-resolved: ${resolution} (confidence diff: ${confidenceDiff.toFixed(2)}, time diff: ${Math.round(timeDiff / (24 * 60 * 60 * 1000))} days)`
      );

      resolutions.push(result);
    }

    return resolutions;
  }

  /**
   * Prune deprecated units (remove or mark as inactive)
   */
  async pruneDeprecatedUnits(userId: string, olderThanDays: number = 30): Promise<number> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

      // Find deprecated units older than cutoff
      const { data: deprecatedUnits, error } = await supabaseAdmin
        .from('extracted_units')
        .select('id')
        .eq('user_id', userId)
        .eq('metadata->>deprecated', 'true')
        .lt('created_at', cutoffDate.toISOString());

      if (error) {
        throw error;
      }

      if (!deprecatedUnits || deprecatedUnits.length === 0) {
        return 0;
      }

      // Mark as pruned (don't delete, just mark)
      // Update each unit's metadata
      for (const unit of deprecatedUnits) {
        const { data: existingUnit, error: fetchError } = await supabaseAdmin
          .from('extracted_units')
          .select('metadata')
          .eq('id', unit.id)
          .single();

        if (fetchError) continue;

        const existingMetadata = (existingUnit?.metadata || {}) as Record<string, any>;

        const { error: updateError } = await supabaseAdmin
          .from('extracted_units')
          .update({
            metadata: {
              ...existingMetadata,
              pruned: true,
              pruned_at: new Date().toISOString(),
            },
          })
          .eq('id', unit.id);

        if (updateError) {
          logger.warn({ error: updateError, unitId: unit.id }, 'Failed to mark unit as pruned');
        }
      }

      if (updateError) {
        throw updateError;
      }

      logger.info({ count: deprecatedUnits.length, userId }, 'Deprecated units pruned');

      return deprecatedUnits.length;
    } catch (error) {
      logger.error({ error, userId }, 'Failed to prune deprecated units');
      throw error;
    }
  }

  // =====================================================
  // PRIVATE HELPER METHODS
  // =====================================================

  private async findUnitsBeingCorrected(
    userId: string,
    correctionUnit: ExtractedUnit,
    conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>
  ): Promise<string[]> {
    // Look for units mentioned in recent conversation history
    if (conversationHistory && conversationHistory.length > 0) {
      const recentMessages = conversationHistory.slice(-5).map(m => m.content).join(' ');
      
      // Find units that match entities or content from recent messages
      const { data: recentUnits } = await supabaseAdmin
        .from('extracted_units')
        .select('id, content, entity_ids, created_at')
        .eq('user_id', userId)
        .neq('id', correctionUnit.id)
        .eq('metadata->>deprecated', 'false')
        .overlaps('entity_ids', correctionUnit.entity_ids || [])
        .order('created_at', { ascending: false })
        .limit(10);

      if (recentUnits && recentUnits.length > 0) {
        // Return units that are likely being corrected (same entities, recent)
        return recentUnits.map(u => u.id);
      }
    }

    // Fallback: find units with same entities
    const { data: relatedUnits } = await supabaseAdmin
      .from('extracted_units')
      .select('id')
      .eq('user_id', userId)
      .neq('id', correctionUnit.id)
      .eq('metadata->>deprecated', 'false')
      .overlaps('entity_ids', correctionUnit.entity_ids || [])
      .order('created_at', { ascending: false })
      .limit(5);

    return relatedUnits?.map(u => u.id) || [];
  }

  private async findContradictions(
    userId: string,
    unit: ExtractedUnit
  ): Promise<ExtractedUnit[]> {
    // Find units with same type and overlapping entities that contradict
    const { data: relatedUnits } = await supabaseAdmin
      .from('extracted_units')
      .select('*')
      .eq('user_id', userId)
      .eq('type', unit.type)
      .neq('id', unit.id)
      .eq('metadata->>deprecated', 'false')
      .overlaps('entity_ids', unit.entity_ids || []);

    if (!relatedUnits || relatedUnits.length === 0) {
      return [];
    }

    // Check for semantic contradictions
    const contradictions: ExtractedUnit[] = [];
    for (const related of relatedUnits) {
      if (this.isContradictory(unit.content, related.content)) {
        contradictions.push(related);
      }
    }

    return contradictions;
  }

  private isContradictory(text1: string, text2: string): boolean {
    const negations = ['not', "don't", "doesn't", "didn't", "won't", "can't", "isn't", "aren't", "wasn't", "weren't", 'never', 'no'];
    const lower1 = text1.toLowerCase();
    const lower2 = text2.toLowerCase();

    // Check if one contains negation and the other doesn't, with similar base content
    const hasNegation1 = negations.some(n => lower1.includes(n));
    const hasNegation2 = negations.some(n => lower2.includes(n));

    if (hasNegation1 !== hasNegation2) {
      // Extract base content (remove negation words)
      const base1 = negations.reduce((acc, n) => acc.replace(new RegExp(`\\b${n}\\b`, 'gi'), ''), lower1).trim();
      const base2 = negations.reduce((acc, n) => acc.replace(new RegExp(`\\b${n}\\b`, 'gi'), ''), lower2).trim();

      // Simple similarity check
      if (base1.length > 10 && base2.length > 10) {
        const similarity = this.simpleSimilarity(base1, base2);
        if (similarity > 0.6) {
          return true;
        }
      }
    }

    // Check for explicit correction phrases
    const correctionPhrases = ['actually', 'i meant', 'i mean', 'correction', 'i was wrong', 'scratch that'];
    const hasCorrectionPhrase = correctionPhrases.some(phrase => lower1.includes(phrase) || lower2.includes(phrase));
    
    if (hasCorrectionPhrase) {
      const similarity = this.simpleSimilarity(lower1, lower2);
      if (similarity > 0.5) {
        return true;
      }
    }

    return false;
  }

  private simpleSimilarity(text1: string, text2: string): number {
    const words1 = new Set(text1.toLowerCase().split(/\s+/));
    const words2 = new Set(text2.toLowerCase().split(/\s+/));
    const intersection = new Set([...words1].filter(w => words2.has(w)));
    const union = new Set([...words1, ...words2]);
    return intersection.size / union.size;
  }

  private isExplicitCorrection(content: string): boolean {
    const correctionPhrases = [
      'actually',
      'i meant',
      'i mean',
      'correction',
      'i was wrong',
      'scratch that',
      'never mind',
      'ignore that',
      'forget that',
      'i take that back',
    ];
    const lower = content.toLowerCase();
    return correctionPhrases.some(phrase => lower.includes(phrase));
  }

  private async createCorrectionLink(
    correctionUnitId: string,
    correctedUnitId: string,
    correctionType: 'EXPLICIT' | 'IMPLICIT' | 'CONTRADICTION'
  ): Promise<void> {
    // Get existing metadata
    const { data: unit, error: fetchError } = await supabaseAdmin
      .from('extracted_units')
      .select('metadata')
      .eq('id', correctionUnitId)
      .single();

    if (fetchError) {
      throw fetchError;
    }

    const existingMetadata = (unit?.metadata || {}) as Record<string, any>;
    const corrections = Array.isArray(existingMetadata.corrections) ? existingMetadata.corrections : [];

    // Add new correction link
    corrections.push({
      corrected_unit_id: correctedUnitId,
      correction_type: correctionType,
      created_at: new Date().toISOString(),
    });

    // Update metadata
    const { error } = await supabaseAdmin
      .from('extracted_units')
      .update({
        metadata: {
          ...existingMetadata,
          corrections,
        },
      })
      .eq('id', correctionUnitId);

    if (error) {
      throw error;
    }
  }

  private async deprecateUnit(
    userId: string,
    unitId: string,
    reason: Record<string, any>
  ): Promise<void> {
    // Get full unit before deprecation
    const { data: unit, error: fetchError } = await supabaseAdmin
      .from('extracted_units')
      .select('*')
      .eq('id', unitId)
      .eq('user_id', userId)
      .single();

    if (fetchError) {
      throw fetchError;
    }

    // Check epistemic rules: EXPERIENCE and FEELING cannot be corrected
    const knowledgeUnitId = unit.metadata?.knowledge_unit_id;
    if (knowledgeUnitId) {
      const { data: knowledgeUnit } = await supabaseAdmin
        .from('knowledge_units')
        .select('*')
        .eq('id', knowledgeUnitId)
        .single();

      if (knowledgeUnit && !knowledgeTypeEngineService.canBeCorrected(knowledgeUnit)) {
        logger.info(
          { unitId, knowledgeType: knowledgeUnit.knowledge_type },
          'Cannot correct EXPERIENCE or FEELING unit - skipping deprecation'
        );
        return; // Don't deprecate - experiences and feelings are never "wrong"
      }
    }

    const beforeSnapshot = { ...unit };
    const existingMetadata = (unit?.metadata || {}) as Record<string, any>;
    const newConfidence = Math.max((unit?.confidence || 0.6) * 0.3, 0.1);

    // Update with deprecated flag and lower confidence
    const { error } = await supabaseAdmin
      .from('extracted_units')
      .update({
        metadata: {
          ...existingMetadata,
          deprecated: true,
          deprecated_at: new Date().toISOString(),
          deprecation_reason: reason,
        },
        confidence: newConfidence,
      })
      .eq('id', unitId)
      .eq('user_id', userId);

    if (error) {
      throw error;
    }

    // Record correction
    const deprecationReason = reason.reason || reason.deprecated_reason || 'Unit deprecated';
    const correctionType =
      reason.correction_type === 'EXPLICIT'
        ? 'USER_CORRECTION'
        : reason.correction_type === 'IMPLICIT'
        ? 'AUTO_CONTRADICTION'
        : 'CONFIDENCE_DOWNGRADE';

    correctionDashboardService
      .recordCorrection(
        userId,
        'UNIT',
        unitId,
        correctionType,
        beforeSnapshot,
        { ...beforeSnapshot, metadata: { ...existingMetadata, deprecated: true }, confidence: newConfidence },
        deprecationReason,
        'SYSTEM',
        true,
        reason
      )
      .catch(err => logger.warn({ err, unitId }, 'Failed to record correction for deprecated unit'));
  }

  private async markForReview(
    userId: string,
    unitId: string,
    reason: Record<string, any>
  ): Promise<void> {
    // Get existing metadata
    const { data: unit, error: fetchError } = await supabaseAdmin
      .from('extracted_units')
      .select('metadata')
      .eq('id', unitId)
      .eq('user_id', userId)
      .single();

    if (fetchError) {
      throw fetchError;
    }

    const existingMetadata = (unit?.metadata || {}) as Record<string, any>;

    // Update with review flag
    const { error } = await supabaseAdmin
      .from('extracted_units')
      .update({
        metadata: {
          ...existingMetadata,
          needs_review: true,
          review_reason: reason,
          marked_for_review_at: new Date().toISOString(),
        },
      })
      .eq('id', unitId)
      .eq('user_id', userId);

    if (error) {
      throw error;
    }
  }

  private async lowerConfidenceOfRelatedUnits(
    userId: string,
    unitId: string,
    decayFactor: number
  ): Promise<void> {
    // Get the unit to find related ones
    const unit = await this.getUnit(unitId);
    if (!unit) return;

    // Find units with same entities
    const { data: relatedUnits, error: fetchError } = await supabaseAdmin
      .from('extracted_units')
      .select('id, confidence, metadata')
      .eq('user_id', userId)
      .neq('id', unitId)
      .overlaps('entity_ids', unit.entity_ids || []);

    if (fetchError || !relatedUnits) {
      logger.warn({ error: fetchError, unitId }, 'Failed to fetch related units');
      return;
    }

    // Update each related unit's confidence
    for (const related of relatedUnits) {
      const metadata = (related.metadata || {}) as Record<string, any>;
      if (metadata.deprecated) continue; // Skip already deprecated

      const newConfidence = Math.max(related.confidence * (1 - decayFactor), 0.2);

      const { error } = await supabaseAdmin
        .from('extracted_units')
        .update({ confidence: newConfidence })
        .eq('id', related.id);

      if (error) {
        logger.warn({ error, unitId: related.id }, 'Failed to lower confidence');
      }
    }
  }

  private async getUnit(unitId: string): Promise<ExtractedUnit | null> {
    const { data, error } = await supabaseAdmin
      .from('extracted_units')
      .select('*')
      .eq('id', unitId)
      .single();

    if (error || !data) {
      return null;
    }

    return data as ExtractedUnit;
  }
}

export const correctionResolutionService = new CorrectionResolutionService();

