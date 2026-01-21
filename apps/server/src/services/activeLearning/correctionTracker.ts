// =====================================================
// CORRECTION TRACKER
// Purpose: Track user corrections to extractions
// Expected Impact: Foundation for model improvement
// =====================================================

import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';

export type CorrectionType = 'entity' | 'sentiment' | 'relationship' | 'extraction';

export type UserCorrection = {
  id: string;
  user_id: string;
  correction_type: CorrectionType;
  original_value: string;
  corrected_value: string;
  context?: string;
  source_message_id?: string;
  source_unit_id?: string;
  metadata?: Record<string, any>;
  created_at: string;
  used_for_training: boolean;
};

export type CorrectionInput = {
  correction_type: CorrectionType;
  original_value: string;
  corrected_value: string;
  context?: string;
  source_message_id?: string;
  source_unit_id?: string;
  metadata?: Record<string, any>;
};

/**
 * Tracks user corrections to extractions
 */
export class CorrectionTracker {
  /**
   * Record a user correction
   */
  async recordCorrection(userId: string, correction: CorrectionInput): Promise<UserCorrection> {
    try {
      const { data, error } = await supabaseAdmin
        .from('user_corrections')
        .insert({
          user_id: userId,
          correction_type: correction.correction_type,
          original_value: correction.original_value,
          corrected_value: correction.corrected_value,
          context: correction.context || null,
          source_message_id: correction.source_message_id || null,
          source_unit_id: correction.source_unit_id || null,
          metadata: correction.metadata || {},
        })
        .select()
        .single();

      if (error) {
        throw error;
      }

      logger.info(
        { userId, correctionType: correction.correction_type, correctionId: data.id },
        'User correction recorded'
      );

      return {
        id: data.id,
        user_id: data.user_id,
        correction_type: data.correction_type as CorrectionType,
        original_value: data.original_value,
        corrected_value: data.corrected_value,
        context: data.context || undefined,
        source_message_id: data.source_message_id || undefined,
        source_unit_id: data.source_unit_id || undefined,
        metadata: data.metadata || {},
        created_at: data.created_at,
        used_for_training: data.used_for_training || false,
      };
    } catch (error) {
      logger.error({ error, userId, correction }, 'Failed to record correction');
      throw error;
    }
  }

  /**
   * Get corrections for a user
   */
  async getCorrections(
    userId: string,
    options: {
      correction_type?: CorrectionType;
      used_for_training?: boolean;
      limit?: number;
    } = {}
  ): Promise<UserCorrection[]> {
    try {
      let query = supabaseAdmin
        .from('user_corrections')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (options.correction_type) {
        query = query.eq('correction_type', options.correction_type);
      }

      if (options.used_for_training !== undefined) {
        query = query.eq('used_for_training', options.used_for_training);
      }

      if (options.limit) {
        query = query.limit(options.limit);
      }

      const { data, error } = await query;

      if (error) {
        throw error;
      }

      return (data || []).map((row) => ({
        id: row.id,
        user_id: row.user_id,
        correction_type: row.correction_type as CorrectionType,
        original_value: row.original_value,
        corrected_value: row.corrected_value,
        context: row.context || undefined,
        source_message_id: row.source_message_id || undefined,
        source_unit_id: row.source_unit_id || undefined,
        metadata: row.metadata || {},
        created_at: row.created_at,
        used_for_training: row.used_for_training || false,
      }));
    } catch (error) {
      logger.error({ error, userId, options }, 'Failed to get corrections');
      return [];
    }
  }

  /**
   * Mark corrections as used for training
   */
  async markAsUsedForTraining(correctionIds: string[]): Promise<void> {
    if (correctionIds.length === 0) return;

    try {
      const { error } = await supabaseAdmin
        .from('user_corrections')
        .update({
          used_for_training: true,
          training_used_at: new Date().toISOString(),
        })
        .in('id', correctionIds);

      if (error) {
        throw error;
      }

      logger.info({ count: correctionIds.length }, 'Corrections marked as used for training');
    } catch (error) {
      logger.error({ error, correctionIds }, 'Failed to mark corrections as used for training');
      throw error;
    }
  }

  /**
   * Get correction statistics
   */
  async getCorrectionStats(userId: string): Promise<{
    total: number;
    by_type: Record<CorrectionType, number>;
    used_for_training: number;
    not_used_for_training: number;
  }> {
    try {
      const { data, error } = await supabaseAdmin
        .from('user_corrections')
        .select('correction_type, used_for_training')
        .eq('user_id', userId);

      if (error) {
        throw error;
      }

      const stats = {
        total: data?.length || 0,
        by_type: {
          entity: 0,
          sentiment: 0,
          relationship: 0,
          extraction: 0,
        } as Record<CorrectionType, number>,
        used_for_training: 0,
        not_used_for_training: 0,
      };

      for (const row of data || []) {
        const type = row.correction_type as CorrectionType;
        if (stats.by_type[type] !== undefined) {
          stats.by_type[type]++;
        }

        if (row.used_for_training) {
          stats.used_for_training++;
        } else {
          stats.not_used_for_training++;
        }
      }

      return stats;
    } catch (error) {
      logger.error({ error, userId }, 'Failed to get correction stats');
      return {
        total: 0,
        by_type: {
          entity: 0,
          sentiment: 0,
          relationship: 0,
          extraction: 0,
        },
        used_for_training: 0,
        not_used_for_training: 0,
      };
    }
  }

  /**
   * Detect correction patterns
   */
  async detectCorrectionPatterns(userId: string): Promise<Array<{
    pattern: string;
    frequency: number;
    correction_type: CorrectionType;
  }>> {
    try {
      const corrections = await this.getCorrections(userId, { used_for_training: false });

      const patterns: Map<string, { frequency: number; correction_type: CorrectionType }> = new Map();

      for (const correction of corrections) {
        // Simple pattern: original -> corrected
        const pattern = `${correction.original_value} -> ${correction.corrected_value}`;
        const existing = patterns.get(pattern);

        if (existing) {
          existing.frequency++;
        } else {
          patterns.set(pattern, {
            frequency: 1,
            correction_type: correction.correction_type,
          });
        }
      }

      return Array.from(patterns.entries())
        .map(([pattern, data]) => ({
          pattern,
          frequency: data.frequency,
          correction_type: data.correction_type,
        }))
        .sort((a, b) => b.frequency - a.frequency);
    } catch (error) {
      logger.error({ error, userId }, 'Failed to detect correction patterns');
      return [];
    }
  }
}

export const correctionTracker = new CorrectionTracker();
