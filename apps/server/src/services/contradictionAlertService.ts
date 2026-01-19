// =====================================================
// CONTRADICTION ALERT SERVICE
// Purpose: Surface "You Might Be Wrong" moments
// when beliefs are contradicted or confidence drops
// =====================================================

import { logger } from '../logger';

import { beliefRealityReconciliationService } from './beliefRealityReconciliationService';
import { supabaseAdmin } from './supabaseClient';

export type ContradictionAlertAction = 'REVIEW' | 'ABANDON' | 'DISMISS' | 'NOT_NOW';

export interface ContradictionAlert {
  id: string;
  user_id: string;
  belief_unit_id: string;
  belief_content: string;
  resolution_status: string;
  resolution_confidence: number;
  contradicting_evidence_ids: string[];
  supporting_evidence_ids: string[];
  suggested_action: ContradictionAlertAction;
  user_action?: ContradictionAlertAction | null;
  dismissed_at?: string | null;
  created_at: string;
  metadata: Record<string, any>;
}

export class ContradictionAlertService {
  /**
   * Check if a belief should trigger a contradiction alert
   */
  async shouldTriggerAlert(
    userId: string,
    beliefUnitId: string
  ): Promise<boolean> {
    try {
      const resolution = await beliefRealityReconciliationService.getResolutionForBelief(
        userId,
        beliefUnitId
      );

      if (!resolution) {
        return false; // No resolution yet, no alert
      }

      // Trigger if:
      // 1. Belief is CONTRADICTED with low confidence (< 0.5)
      // 2. Belief is PARTIALLY_SUPPORTED with very low confidence (< 0.3)
      // 3. Confidence dropped significantly since last evaluation

      if (resolution.status === 'CONTRADICTED' && resolution.resolution_confidence < 0.5) {
        return true;
      }

      if (resolution.status === 'PARTIALLY_SUPPORTED' && resolution.resolution_confidence < 0.3) {
        return true;
      }

      return false;
    } catch (error) {
      logger.error({ error, userId, beliefUnitId }, 'Failed to check if alert should trigger');
      return false;
    }
  }

  /**
   * Create a contradiction alert for a belief
   */
  async createAlert(
    userId: string,
    beliefUnitId: string
  ): Promise<ContradictionAlert | null> {
    try {
      // Check if alert already exists and not dismissed
      const existing = await this.getActiveAlert(userId, beliefUnitId);
      if (existing) {
        return existing; // Return existing alert
      }

      const resolution = await beliefRealityReconciliationService.getResolutionForBelief(
        userId,
        beliefUnitId
      );

      if (!resolution) {
        return null; // No resolution, can't create alert
      }

      // Get belief content
      const { data: beliefUnit } = await supabaseAdmin
        .from('knowledge_units')
        .select('content')
        .eq('id', beliefUnitId)
        .eq('user_id', userId)
        .single();

      if (!beliefUnit) {
        logger.warn({ userId, beliefUnitId }, 'Belief unit not found for alert');
        return null;
      }

      // Determine suggested action based on confidence
      let suggestedAction: ContradictionAlertAction = 'REVIEW';
      if (resolution.resolution_confidence < 0.2) {
        suggestedAction = 'ABANDON'; // Very low confidence, suggest abandonment
      } else if (resolution.resolution_confidence < 0.4) {
        suggestedAction = 'REVIEW'; // Low confidence, suggest review
      }

      const alert: Omit<ContradictionAlert, 'id' | 'created_at'> = {
        user_id: userId,
        belief_unit_id: beliefUnitId,
        belief_content: beliefUnit.content,
        resolution_status: resolution.status,
        resolution_confidence: resolution.resolution_confidence,
        contradicting_evidence_ids: resolution.contradicting_units || [],
        supporting_evidence_ids: resolution.supporting_units || [],
        suggested_action: suggestedAction,
        user_action: null,
        dismissed_at: null,
        metadata: {
          explanation: resolution.explanation,
          last_evaluated_at: resolution.last_evaluated_at,
        },
      };

      const { data, error } = await supabaseAdmin
        .from('contradiction_alerts')
        .insert(alert)
        .select()
        .single();

      if (error) {
        throw error;
      }

      logger.info({ userId, beliefUnitId, alertId: data.id }, 'Created contradiction alert');

      return data as ContradictionAlert;
    } catch (error) {
      logger.error({ error, userId, beliefUnitId }, 'Failed to create contradiction alert');
      return null;
    }
  }

  /**
   * Get active (non-dismissed) alert for a belief
   */
  async getActiveAlert(
    userId: string,
    beliefUnitId: string
  ): Promise<ContradictionAlert | null> {
    try {
      const { data, error } = await supabaseAdmin
        .from('contradiction_alerts')
        .select('*')
        .eq('user_id', userId)
        .eq('belief_unit_id', beliefUnitId)
        .is('dismissed_at', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (error || !data) {
        return null;
      }

      return data as ContradictionAlert;
    } catch (error) {
      logger.debug({ error, userId, beliefUnitId }, 'No active alert found');
      return null;
    }
  }

  /**
   * Get all active alerts for a user
   */
  async getActiveAlerts(
    userId: string,
    limit: number = 10
  ): Promise<ContradictionAlert[]> {
    try {
      const { data, error } = await supabaseAdmin
        .from('contradiction_alerts')
        .select('*')
        .eq('user_id', userId)
        .is('dismissed_at', null)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) {
        throw error;
      }

      return (data || []) as ContradictionAlert[];
    } catch (error) {
      logger.error({ error, userId }, 'Failed to get active alerts');
      return [];
    }
  }

  /**
   * Handle user action on alert
   */
  async handleUserAction(
    userId: string,
    alertId: string,
    action: ContradictionAlertAction
  ): Promise<boolean> {
    try {
      const update: Partial<ContradictionAlert> = {
        user_action: action,
      };

      if (action === 'DISMISS' || action === 'NOT_NOW') {
        update.dismissed_at = new Date().toISOString();
      }

      if (action === 'ABANDON') {
        // Mark belief as abandoned
        const { data: alert } = await supabaseAdmin
          .from('contradiction_alerts')
          .select('belief_unit_id')
          .eq('id', alertId)
          .eq('user_id', userId)
          .single();

        if (alert) {
          await beliefRealityReconciliationService.abandonBelief(
            userId,
            alert.belief_unit_id,
            'User abandoned via contradiction alert'
          );
        }

        update.dismissed_at = new Date().toISOString();
      }

      const { error } = await supabaseAdmin
        .from('contradiction_alerts')
        .update(update)
        .eq('id', alertId)
        .eq('user_id', userId);

      if (error) {
        throw error;
      }

      logger.info({ userId, alertId, action }, 'User action on contradiction alert');

      return true;
    } catch (error) {
      logger.error({ error, userId, alertId, action }, 'Failed to handle user action');
      return false;
    }
  }

  /**
   * Check and create alerts for beliefs that need attention
   * Called after belief evaluation
   */
  async checkAndCreateAlerts(
    userId: string,
    beliefUnitId: string
  ): Promise<void> {
    try {
      const shouldTrigger = await this.shouldTriggerAlert(userId, beliefUnitId);
      if (shouldTrigger) {
        await this.createAlert(userId, beliefUnitId);
      }
    } catch (error) {
      logger.debug({ error, userId, beliefUnitId }, 'Failed to check/create alert (non-blocking)');
    }
  }
}

export const contradictionAlertService = new ContradictionAlertService();

