// =====================================================
// TRAINING DATA COLLECTOR
// Purpose: Collect confirmed entities, sentiment labels, relationships
// Expected Impact: Data for fine-tuning models
// =====================================================

import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';
import { correctionTracker } from './correctionTracker';

export type DatasetType = 'entity' | 'sentiment' | 'relationship';

export type TrainingSample = {
  input: string;
  output: string | Record<string, any>;
  label?: string;
  metadata?: Record<string, any>;
};

export type TrainingDataset = {
  id: string;
  user_id: string;
  dataset_type: DatasetType;
  data: TrainingSample[];
  sample_count: number;
  created_at: string;
  last_used_at?: string;
};

/**
 * Collects training data from user corrections
 */
export class TrainingDataCollector {
  /**
   * Build training dataset from corrections
   */
  async buildDataset(
    userId: string,
    datasetType: DatasetType,
    minSamples: number = 10
  ): Promise<TrainingDataset | null> {
    try {
      // Get corrections for this type
      const corrections = await correctionTracker.getCorrections(userId, {
        correction_type: datasetType as any,
        used_for_training: false,
      });

      if (corrections.length < minSamples) {
        logger.debug(
          { userId, datasetType, correctionCount: corrections.length, minSamples },
          'Not enough corrections to build dataset'
        );
        return null;
      }

      // Convert corrections to training samples
      const samples = this.convertCorrectionsToSamples(corrections, datasetType);

      // Store dataset
      const { data, error } = await supabaseAdmin
        .from('training_datasets')
        .insert({
          user_id: userId,
          dataset_type: datasetType,
          data: samples,
          sample_count: samples.length,
        })
        .select()
        .single();

      if (error) {
        throw error;
      }

      // Mark corrections as used
      const correctionIds = corrections.map(c => c.id);
      await correctionTracker.markAsUsedForTraining(correctionIds);

      logger.info(
        { userId, datasetType, sampleCount: samples.length, datasetId: data.id },
        'Training dataset built'
      );

      return {
        id: data.id,
        user_id: data.user_id,
        dataset_type: data.dataset_type as DatasetType,
        data: samples,
        sample_count: data.sample_count || samples.length,
        created_at: data.created_at,
        last_used_at: data.last_used_at || undefined,
      };
    } catch (error) {
      logger.error({ error, userId, datasetType }, 'Failed to build training dataset');
      return null;
    }
  }

  /**
   * Convert corrections to training samples
   */
  private convertCorrectionsToSamples(
    corrections: Array<{
      original_value: string;
      corrected_value: string;
      context?: string;
      metadata?: Record<string, any>;
    }>,
    datasetType: DatasetType
  ): TrainingSample[] {
    return corrections.map((correction) => {
      const input = correction.context || correction.original_value;
      const output = correction.corrected_value;

      return {
        input,
        output,
        label: datasetType === 'sentiment' ? output : undefined,
        metadata: {
          ...correction.metadata,
          original_value: correction.original_value,
        },
      };
    });
  }

  /**
   * Get training dataset
   */
  async getDataset(userId: string, datasetType: DatasetType): Promise<TrainingDataset | null> {
    try {
      const { data, error } = await supabaseAdmin
        .from('training_datasets')
        .select('*')
        .eq('user_id', userId)
        .eq('dataset_type', datasetType)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error || !data) {
        return null;
      }

      return {
        id: data.id,
        user_id: data.user_id,
        dataset_type: data.dataset_type as DatasetType,
        data: data.data as TrainingSample[],
        sample_count: data.sample_count || 0,
        created_at: data.created_at,
        last_used_at: data.last_used_at || undefined,
      };
    } catch (error) {
      logger.error({ error, userId, datasetType }, 'Failed to get training dataset');
      return null;
    }
  }

  /**
   * Update dataset last used timestamp
   */
  async updateLastUsed(datasetId: string): Promise<void> {
    try {
      await supabaseAdmin
        .from('training_datasets')
        .update({
          last_used_at: new Date().toISOString(),
        })
        .eq('id', datasetId);
    } catch (error) {
      logger.warn({ error, datasetId }, 'Failed to update dataset last used timestamp');
    }
  }

  /**
   * Get dataset statistics
   */
  async getDatasetStats(userId: string): Promise<{
    total_datasets: number;
    by_type: Record<DatasetType, number>;
    total_samples: number;
  }> {
    try {
      const { data, error } = await supabaseAdmin
        .from('training_datasets')
        .select('dataset_type, sample_count')
        .eq('user_id', userId);

      if (error) {
        throw error;
      }

      const stats = {
        total_datasets: data?.length || 0,
        by_type: {
          entity: 0,
          sentiment: 0,
          relationship: 0,
        } as Record<DatasetType, number>,
        total_samples: 0,
      };

      for (const row of data || []) {
        const type = row.dataset_type as DatasetType;
        if (stats.by_type[type] !== undefined) {
          stats.by_type[type]++;
        }
        stats.total_samples += row.sample_count || 0;
      }

      return stats;
    } catch (error) {
      logger.error({ error, userId }, 'Failed to get dataset stats');
      return {
        total_datasets: 0,
        by_type: {
          entity: 0,
          sentiment: 0,
          relationship: 0,
        },
        total_samples: 0,
      };
    }
  }
}

export const trainingDataCollector = new TrainingDataCollector();
