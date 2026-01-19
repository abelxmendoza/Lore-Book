// =====================================================
// ENTITY CONFIDENCE SERVICE
// Purpose: Use analytics signals to adjust entity confidence,
// surface uncertainty honestly, and prevent analytics from
// appearing certain when meaning is ambiguous.
// =====================================================

import { logger } from '../logger';

import { supabaseAdmin } from './supabaseClient';

// Constants
const MIN_CONFIDENCE = 0.0;
const MAX_CONFIDENCE = 1.0;
const EPSILON = 0.01; // Minimum change to record
const LOW_CONFIDENCE_THRESHOLD = 0.5;
const DECAY_WINDOW_DAYS = 90; // Entities not seen in 90 days decay
const DECAY_FACTOR = 0.95; // 5% decay per period

// Thresholds for signal extraction
const INTERACTION_DIVERSITY_THRESHOLD = 0.7;
const CONFLICT_THRESHOLD = 0.3;
const MIN_TEMPORAL_DEPTH_DAYS = 30;

export type ConfidenceDerivedFrom = 'USAGE' | 'ANALYTICS' | 'MERGE' | 'CORRECTION' | 'DECAY';

export type AnalyticsSignalType =
  | 'INTERACTION_DIVERSITY'
  | 'RELATIONSHIP_DEPTH'
  | 'TEMPORAL_CONSISTENCY'
  | 'SENTIMENT_STABILITY'
  | 'CONFLICT_RATE';

export interface AnalyticsSignal {
  signal_type: AnalyticsSignalType;
  strength: number; // -1.0 to +1.0
  confidence_weight: number; // 0.0 to 1.0 - how trustworthy the signal is
  description?: string;
}

export interface EntityConfidenceSnapshot {
  id: string;
  entity_id: string;
  user_id: string;
  confidence: number;
  derived_from: ConfidenceDerivedFrom;
  reason: string;
  timestamp: string;
  metadata?: Record<string, any>;
}

export interface AnalyticsGate {
  allow: boolean;
  mode: 'NORMAL' | 'UNCERTAIN' | 'SOFT';
  disclaimer?: string;
}

export class EntityConfidenceService {
  /**
   * Derive analytics signals from entity analytics
   */
  deriveAnalyticsSignals(analytics: any): AnalyticsSignal[] {
    const signals: AnalyticsSignal[] = [];

    // 1. Interaction Diversity Signal
    // High diversity (mentions across varied contexts) = positive signal
    if (analytics.interaction_frequency && analytics.interaction_frequency > INTERACTION_DIVERSITY_THRESHOLD * 100) {
      signals.push({
        signal_type: 'INTERACTION_DIVERSITY',
        strength: +0.2,
        confidence_weight: 0.6,
        description: 'Referenced across varied contexts',
      });
    }

    // 2. Relationship Depth Signal
    // Deep relationships = positive signal
    if (analytics.relationship_depth && analytics.relationship_depth > 70) {
      signals.push({
        signal_type: 'RELATIONSHIP_DEPTH',
        strength: +0.15,
        confidence_weight: 0.7,
        description: 'Deep relationship established',
      });
    } else if (analytics.relationship_depth && analytics.relationship_depth < 30) {
      signals.push({
        signal_type: 'RELATIONSHIP_DEPTH',
        strength: -0.1,
        confidence_weight: 0.5,
        description: 'Shallow relationship - limited depth',
      });
    }

    // 3. Conflict Rate Signal
    // High conflict = negative signal (uncertainty)
    if (analytics.conflict_score && analytics.conflict_score > CONFLICT_THRESHOLD * 100) {
      signals.push({
        signal_type: 'CONFLICT_RATE',
        strength: -0.4,
        confidence_weight: 0.9,
        description: 'Conflicting references detected',
      });
    }

    // 4. Temporal Consistency Signal
    // Limited temporal depth = negative signal
    if (analytics.relationship_duration_days && analytics.relationship_duration_days < MIN_TEMPORAL_DEPTH_DAYS) {
      signals.push({
        signal_type: 'TEMPORAL_CONSISTENCY',
        strength: -0.2,
        confidence_weight: 0.7,
        description: 'Limited time-based continuity',
      });
    } else if (analytics.relationship_duration_days && analytics.relationship_duration_days > 365) {
      signals.push({
        signal_type: 'TEMPORAL_CONSISTENCY',
        strength: +0.15,
        confidence_weight: 0.8,
        description: 'Long-term consistent relationship',
      });
    }

    // 5. Sentiment Stability Signal
    // Stable sentiment = positive signal
    if (analytics.sentiment_score !== undefined) {
      const sentimentStability = Math.abs(analytics.sentiment_score);
      if (sentimentStability > 50) {
        // Strong sentiment (positive or negative) = clear signal
        signals.push({
          signal_type: 'SENTIMENT_STABILITY',
          strength: +0.1,
          confidence_weight: 0.6,
          description: 'Emotionally consistent interactions',
        });
      }
    }

    return signals;
  }

  /**
   * Update entity confidence based on analytics signals
   */
  async updateEntityConfidenceFromAnalytics(
    userId: string,
    entityId: string,
    entityType: 'CHARACTER' | 'LOCATION' | 'ORG',
    analytics: any
  ): Promise<void> {
    try {
      // Get current confidence
      const baseConfidence = await this.getCurrentEntityConfidence(userId, entityId, entityType);
      if (baseConfidence === null) {
        logger.debug({ userId, entityId }, 'Entity not found, skipping confidence update');
        return;
      }

      // Derive signals
      const signals = this.deriveAnalyticsSignals(analytics);

      if (signals.length === 0) {
        return; // No signals to process
      }

      // Calculate weighted impact
      let delta = 0;
      const explanations: string[] = [];

      for (const signal of signals) {
        const weightedImpact = signal.strength * signal.confidence_weight;
        delta += weightedImpact;
        explanations.push(this.describeSignal(signal));
      }

      // Clamp to valid range
      const newConfidence = Math.max(
        MIN_CONFIDENCE,
        Math.min(MAX_CONFIDENCE, baseConfidence + delta)
      );

      // Only update if change is meaningful
      if (Math.abs(newConfidence - baseConfidence) < EPSILON) {
        return; // No meaningful change
      }

      // Save snapshot
      await this.saveConfidenceSnapshot({
        entity_id: entityId,
        user_id: userId,
        confidence: newConfidence,
        derived_from: 'ANALYTICS',
        reason: explanations.join('; '),
        metadata: { signals, old_confidence: baseConfidence },
      });

      // Update entity confidence
      await this.updateEntityConfidence(userId, entityId, entityType, newConfidence);

      logger.info(
        { userId, entityId, oldConfidence: baseConfidence, newConfidence, delta },
        'Updated entity confidence from analytics'
      );
    } catch (error) {
      logger.error({ error, userId, entityId }, 'Failed to update entity confidence from analytics');
    }
  }

  /**
   * Apply confidence decay for entities not seen recently
   */
  async applyConfidenceDecay(userId: string): Promise<void> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - DECAY_WINDOW_DAYS);

      // Get entities with low recent activity
      // This is a simplified version - in production, you'd check actual usage
      const { data: entities, error } = await supabaseAdmin
        .from('entities')
        .select('id, confidence, updated_at')
        .eq('user_id', userId)
        .lt('updated_at', cutoffDate.toISOString())
        .gt('confidence', 0.1); // Only decay entities with some confidence

      if (error) throw error;

      for (const entity of entities || []) {
        const decayedConfidence = entity.confidence * DECAY_FACTOR;

        if (decayedConfidence < 0.1) {
          continue; // Don't decay below minimum
        }

        await this.saveConfidenceSnapshot({
          entity_id: entity.id,
          user_id: userId,
          confidence: decayedConfidence,
          derived_from: 'DECAY',
          reason: 'No reinforcing signal in recent activity',
          metadata: { old_confidence: entity.confidence },
        });

        await this.updateEntityConfidence(userId, entity.id, 'CHARACTER', decayedConfidence);
      }

      logger.info({ userId, decayedCount: entities?.length || 0 }, 'Applied confidence decay');
    } catch (error) {
      logger.error({ error, userId }, 'Failed to apply confidence decay');
    }
  }

  /**
   * Determine if analytics should be surfaced based on confidence
   */
  shouldSurfaceAnalytics(userId: string, entityId: string, entityType: 'CHARACTER' | 'LOCATION' | 'ORG'): Promise<AnalyticsGate> {
    return this.getEntityConfidenceGate(userId, entityId, entityType);
  }

  /**
   * Get confidence gate for entity
   */
  async getEntityConfidenceGate(
    userId: string,
    entityId: string,
    entityType: 'CHARACTER' | 'LOCATION' | 'ORG'
  ): Promise<AnalyticsGate> {
    try {
      const confidence = await this.getCurrentEntityConfidence(userId, entityId, entityType);

      if (confidence === null) {
        return { allow: true, mode: 'NORMAL' };
      }

      if (confidence < LOW_CONFIDENCE_THRESHOLD) {
        return {
          allow: true,
          mode: 'UNCERTAIN',
          disclaimer: 'This analysis is tentative due to limited clarity.',
        };
      }

      // Check for active overrides (from correction system)
      const hasOverrides = await this.hasActiveOverrides(userId, entityId);
      if (hasOverrides) {
        return {
          allow: true,
          mode: 'SOFT',
          disclaimer: 'Interpretation adjusted based on your feedback.',
        };
      }

      return { allow: true, mode: 'NORMAL' };
    } catch (error) {
      logger.error({ error, userId, entityId }, 'Failed to get confidence gate');
      return { allow: true, mode: 'NORMAL' };
    }
  }

  /**
   * Get current entity confidence
   */
  private async getCurrentEntityConfidence(
    userId: string,
    entityId: string,
    entityType: 'CHARACTER' | 'LOCATION' | 'ORG'
  ): Promise<number | null> {
    try {
      // Try entities table first
      const { data: entity, error } = await supabaseAdmin
        .from('entities')
        .select('confidence')
        .eq('id', entityId)
        .eq('user_id', userId)
        .single();

      if (!error && entity) {
        return entity.confidence || 0.5;
      }

      // Try characters table
      if (entityType === 'CHARACTER') {
        const { data: character } = await supabaseAdmin
          .from('characters')
          .select('metadata')
          .eq('id', entityId)
          .eq('user_id', userId)
          .single();

        if (character?.metadata?.confidence) {
          return character.metadata.confidence;
        }
      }

      // Default confidence
      return 0.5;
    } catch (error) {
      logger.debug({ error, userId, entityId }, 'Failed to get entity confidence');
      return 0.5; // Default
    }
  }

  /**
   * Update entity confidence
   */
  private async updateEntityConfidence(
    userId: string,
    entityId: string,
    entityType: 'CHARACTER' | 'LOCATION' | 'ORG',
    confidence: number
  ): Promise<void> {
    try {
      // Update entities table
      await supabaseAdmin
        .from('entities')
        .update({ confidence, updated_at: new Date().toISOString() })
        .eq('id', entityId)
        .eq('user_id', userId);

      // Also update in type-specific tables if needed
      if (entityType === 'CHARACTER') {
        const { data: character } = await supabaseAdmin
          .from('characters')
          .select('metadata')
          .eq('id', entityId)
          .eq('user_id', userId)
          .single();

        if (character) {
          await supabaseAdmin
            .from('characters')
            .update({
              metadata: { ...(character.metadata || {}), confidence },
              updated_at: new Date().toISOString(),
            })
            .eq('id', entityId)
            .eq('user_id', userId);
        }
      }
    } catch (error) {
      logger.error({ error, userId, entityId }, 'Failed to update entity confidence');
    }
  }

  /**
   * Save confidence snapshot
   */
  private async saveConfidenceSnapshot(snapshot: Omit<EntityConfidenceSnapshot, 'id' | 'timestamp'>): Promise<void> {
    try {
      await supabaseAdmin.from('entity_confidence_snapshots').insert({
        entity_id: snapshot.entity_id,
        user_id: snapshot.user_id,
        confidence: snapshot.confidence,
        derived_from: snapshot.derived_from,
        reason: snapshot.reason,
        metadata: snapshot.metadata || {},
      });
    } catch (error) {
      logger.error({ error, snapshot }, 'Failed to save confidence snapshot');
    }
  }

  /**
   * Check for active overrides
   */
  private async hasActiveOverrides(userId: string, entityId: string): Promise<boolean> {
    try {
      // Check meta_overrides table for this entity
      const { data, error } = await supabaseAdmin
        .from('meta_overrides')
        .select('id')
        .eq('user_id', userId)
        .eq('entity_id', entityId)
        .in('override_type', ['LOWER_CONFIDENCE', 'MISINTERPRETED'])
        .eq('is_active', true)
        .limit(1);

      if (error) {
        logger.debug({ error }, 'Failed to check overrides');
        return false;
      }

      return (data?.length || 0) > 0;
    } catch (error) {
      logger.debug({ error }, 'Failed to check overrides');
      return false;
    }
  }

  /**
   * Describe signal for human-readable explanation
   */
  private describeSignal(signal: AnalyticsSignal): string {
    if (signal.description) {
      return signal.description;
    }

    switch (signal.signal_type) {
      case 'INTERACTION_DIVERSITY':
        return 'Referenced across varied contexts';
      case 'RELATIONSHIP_DEPTH':
        return signal.strength > 0 ? 'Deep relationship established' : 'Shallow relationship';
      case 'CONFLICT_RATE':
        return 'Conflicting references detected';
      case 'TEMPORAL_CONSISTENCY':
        return signal.strength > 0 ? 'Long-term consistent relationship' : 'Limited time-based continuity';
      case 'SENTIMENT_STABILITY':
        return 'Emotionally consistent interactions';
      default:
        return 'Derived analytic signal';
    }
  }

  /**
   * Soften analytics language for low confidence
   */
  softenAnalyticsLanguage(analytics: any, confidence: number): any {
    if (confidence >= LOW_CONFIDENCE_THRESHOLD) {
      return analytics; // No softening needed
    }

    // Create a softened version with tentative language
    const softened = { ...analytics };
    
    // Add confidence-aware descriptions
    softened._confidence = confidence;
    softened._tentative = true;
    
    return softened;
  }

  /**
   * Get confidence history for an entity
   */
  async getConfidenceHistory(
    userId: string,
    entityId: string
  ): Promise<EntityConfidenceSnapshot[]> {
    try {
      const { data, error } = await supabaseAdmin
        .from('entity_confidence_snapshots')
        .select('*')
        .eq('entity_id', entityId)
        .eq('user_id', userId)
        .order('timestamp', { ascending: false })
        .limit(50);

      if (error) throw error;

      return (data || []) as EntityConfidenceSnapshot[];
    } catch (error) {
      logger.error({ error, userId, entityId }, 'Failed to get confidence history');
      return [];
    }
  }
}

export const entityConfidenceService = new EntityConfidenceService();

