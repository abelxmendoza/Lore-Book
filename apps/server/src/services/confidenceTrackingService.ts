// =====================================================
// CONFIDENCE TRACKING SERVICE
// Purpose: Track and explain confidence evolution
// =====================================================

import { logger } from '../logger';
import { supabaseAdmin } from './supabaseClient';

interface ConfidenceSnapshot {
  id: string;
  event_id: string;
  user_id: string;
  confidence: number;
  reason: string;
  recorded_at: string;
  metadata?: Record<string, any>;
}

interface ConfidenceChange {
  old_confidence: number;
  new_confidence: number;
  reason: string;
}

export class ConfidenceTrackingService {
  /**
   * Record a confidence snapshot for an event
   */
  async recordConfidenceSnapshot(
    userId: string,
    eventId: string,
    confidence: number,
    reason: string,
    metadata?: Record<string, any>
  ): Promise<void> {
    try {
      await supabaseAdmin.from('event_confidence_snapshots').insert({
        user_id: userId,
        event_id: eventId,
        confidence,
        reason,
        metadata: metadata || {},
      });
    } catch (error) {
      logger.warn({ error, userId, eventId }, 'Failed to record confidence snapshot');
    }
  }

  /**
   * Get confidence history for an event
   */
  async getConfidenceHistory(eventId: string, userId: string): Promise<ConfidenceSnapshot[]> {
    try {
      const { data, error } = await supabaseAdmin
        .from('event_confidence_snapshots')
        .select('*')
        .eq('event_id', eventId)
        .eq('user_id', userId)
        .order('recorded_at', { ascending: true });

      if (error) {
        throw error;
      }

      return (data || []) as ConfidenceSnapshot[];
    } catch (error) {
      logger.error({ error, eventId, userId }, 'Failed to get confidence history');
      return [];
    }
  }

  /**
   * Derive reason for confidence change
   */
  deriveConfidenceChangeReason(
    oldEvent: { confidence: number; source_unit_ids?: string[] },
    newEvent: { confidence: number; source_unit_ids?: string[] }
  ): string {
    if (newEvent.confidence > oldEvent.confidence) {
      const unitIncrease =
        (newEvent.source_unit_ids?.length || 0) - (oldEvent.source_unit_ids?.length || 0);
      if (unitIncrease > 0) {
        return `Additional confirming information added (${unitIncrease} new sources)`;
      }
      return 'Additional confirming information added';
    }

    if (newEvent.confidence < oldEvent.confidence) {
      return 'Conflicting or unclear information detected';
    }

    return 'Re-evaluated with new context';
  }

  /**
   * Check if confidence changed and record snapshot if needed
   */
  async trackConfidenceChange(
    userId: string,
    eventId: string,
    oldConfidence: number,
    newConfidence: number,
    oldEvent?: { source_unit_ids?: string[] },
    newEvent?: { source_unit_ids?: string[] }
  ): Promise<void> {
    // Only record if confidence changed significantly (more than 0.05)
    if (Math.abs(newConfidence - oldConfidence) < 0.05) {
      return;
    }

    const reason = this.deriveConfidenceChangeReason(
      { confidence: oldConfidence, source_unit_ids: oldEvent?.source_unit_ids },
      { confidence: newConfidence, source_unit_ids: newEvent?.source_unit_ids }
    );

    await this.recordConfidenceSnapshot(userId, eventId, newConfidence, reason, {
      old_confidence: oldConfidence,
      change_amount: newConfidence - oldConfidence,
    });
  }
}

export const confidenceTrackingService = new ConfidenceTrackingService();

