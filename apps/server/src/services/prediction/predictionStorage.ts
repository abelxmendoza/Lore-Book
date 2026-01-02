import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';
import type { Prediction, PredictionStats, PredictionType, PredictionStatus, PredictionConfidence } from './types';

/**
 * Handles storage and retrieval of predictions
 */
export class PredictionStorage {
  /**
   * Save predictions
   */
  async savePredictions(predictions: Prediction[]): Promise<Prediction[]> {
    if (predictions.length === 0) return [];

    try {
      const { data, error } = await supabaseAdmin
        .from('predictions')
        .insert(
          predictions.map(p => ({
            user_id: p.user_id,
            type: p.type,
            title: p.title,
            description: p.description,
            predicted_value: p.predicted_value,
            predicted_date: p.predicted_date,
            predicted_date_range: p.predicted_date_range,
            confidence: p.confidence,
            confidence_score: p.confidence_score,
            status: p.status || 'pending',
            source_patterns: p.source_patterns,
            source_data: p.source_data,
            metadata: p.metadata,
            expires_at: p.expires_at,
          }))
        )
        .select();

      if (error) {
        logger.error({ error }, 'Failed to save predictions');
        return [];
      }

      logger.debug({ count: data?.length }, 'Saved predictions');
      return (data || []) as Prediction[];
    } catch (error) {
      logger.error({ error }, 'Failed to save predictions');
      return [];
    }
  }

  /**
   * Get active predictions for user
   */
  async getActivePredictions(
    userId: string,
    limit?: number,
    type?: PredictionType
  ): Promise<Prediction[]> {
    try {
      let query = supabaseAdmin
        .from('predictions')
        .select('*')
        .eq('user_id', userId)
        .eq('status', 'pending')
        .order('confidence_score', { ascending: false })
        .order('predicted_date', { ascending: true });

      if (type) {
        query = query.eq('type', type);
      }

      if (limit) {
        query = query.limit(limit);
      }

      const { data, error } = await query;

      if (error) {
        logger.error({ error }, 'Failed to get active predictions');
        return [];
      }

      return (data || []) as Prediction[];
    } catch (error) {
      logger.error({ error }, 'Failed to get active predictions');
      return [];
    }
  }

  /**
   * Get predictions by date range
   */
  async getPredictionsByDateRange(
    userId: string,
    startDate: string,
    endDate: string
  ): Promise<Prediction[]> {
    try {
      const { data, error } = await supabaseAdmin
        .from('predictions')
        .select('*')
        .eq('user_id', userId)
        .gte('predicted_date', startDate)
        .lte('predicted_date', endDate)
        .order('predicted_date', { ascending: true });

      if (error) {
        logger.error({ error }, 'Failed to get predictions by date range');
        return [];
      }

      return (data || []) as Prediction[];
    } catch (error) {
      logger.error({ error }, 'Failed to get predictions by date range');
      return [];
    }
  }

  /**
   * Update prediction status
   */
  async updateStatus(
    predictionId: string,
    status: PredictionStatus
  ): Promise<boolean> {
    try {
      const { error } = await supabaseAdmin
        .from('predictions')
        .update({
          status,
          updated_at: new Date().toISOString(),
        })
        .eq('id', predictionId);

      if (error) {
        logger.error({ error, predictionId }, 'Failed to update prediction status');
        return false;
      }

      return true;
    } catch (error) {
      logger.error({ error, predictionId }, 'Failed to update prediction status');
      return false;
    }
  }

  /**
   * Mark expired predictions
   */
  async markExpired(userId: string): Promise<number> {
    try {
      const { data, error } = await supabaseAdmin
        .from('predictions')
        .update({
          status: 'expired',
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', userId)
        .eq('status', 'pending')
        .lt('expires_at', new Date().toISOString())
        .select();

      if (error) {
        logger.error({ error }, 'Failed to mark expired predictions');
        return 0;
      }

      return data?.length || 0;
    } catch (error) {
      logger.error({ error }, 'Failed to mark expired predictions');
      return 0;
    }
  }

  /**
   * Get prediction statistics
   */
  async getStats(userId: string): Promise<PredictionStats> {
    try {
      const { data, error } = await supabaseAdmin
        .from('predictions')
        .select('type, status, confidence, confidence_score')
        .eq('user_id', userId);

      if (error || !data) {
        return {
          total_predictions: 0,
          by_type: {} as Record<PredictionType, number>,
          by_status: {} as Record<PredictionStatus, number>,
          by_confidence: {} as Record<PredictionConfidence, number>,
          average_confidence: 0,
        };
      }

      const stats: PredictionStats = {
        total_predictions: data.length,
        by_type: {} as Record<PredictionType, number>,
        by_status: {} as Record<PredictionStatus, number>,
        by_confidence: {} as Record<PredictionConfidence, number>,
        average_confidence: 0,
      };

      // Count by type
      data.forEach(p => {
        stats.by_type[p.type as PredictionType] = (stats.by_type[p.type as PredictionType] || 0) + 1;
        stats.by_status[p.status as PredictionStatus] = (stats.by_status[p.status as PredictionStatus] || 0) + 1;
        stats.by_confidence[p.confidence as PredictionConfidence] = (stats.by_confidence[p.confidence as PredictionConfidence] || 0) + 1;
      });

      // Calculate average confidence
      const confidences = data.map(p => p.confidence_score).filter(c => c !== null);
      stats.average_confidence = confidences.length > 0
        ? confidences.reduce((sum, c) => sum + c, 0) / confidences.length
        : 0;

      // Calculate accuracy rate (confirmed / (confirmed + refuted))
      const confirmed = data.filter(p => p.status === 'confirmed').length;
      const refuted = data.filter(p => p.status === 'refuted').length;
      if (confirmed + refuted > 0) {
        stats.accuracy_rate = confirmed / (confirmed + refuted);
      }

      return stats;
    } catch (error) {
      logger.error({ error }, 'Failed to get prediction stats');
      return {
        total_predictions: 0,
        by_type: {} as Record<PredictionType, number>,
        by_status: {} as Record<PredictionStatus, number>,
        by_confidence: {} as Record<PredictionConfidence, number>,
        average_confidence: 0,
      };
    }
  }
}

