import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';
import type {
  Intervention,
  InterventionStats,
  InterventionType,
  InterventionSeverity,
  InterventionStatus,
} from './types';

/**
 * Handles storage and retrieval of interventions
 */
export class InterventionStorage {
  /**
   * Save interventions
   */
  async saveInterventions(interventions: Intervention[]): Promise<Intervention[]> {
    if (interventions.length === 0) return [];

    try {
      const { data, error } = await supabaseAdmin
        .from('interventions')
        .insert(
          interventions.map(i => ({
            user_id: i.user_id,
            type: i.type,
            severity: i.severity,
            confidence: i.confidence,
            message: i.message,
            timestamp: i.timestamp,
            related_events: i.related_events || [],
            related_entries: i.related_entries || [],
            context: i.context || {},
            status: i.status || 'pending',
            metadata: i.metadata || {},
          }))
        )
        .select();

      if (error) {
        logger.error({ error }, 'Failed to save interventions');
        return [];
      }

      logger.debug({ count: data?.length }, 'Saved interventions');
      return (data || []) as Intervention[];
    } catch (error) {
      logger.error({ error }, 'Failed to save interventions');
      return [];
    }
  }

  /**
   * Get active interventions for user
   */
  async getActiveInterventions(
    userId: string,
    limit?: number,
    minSeverity?: InterventionSeverity
  ): Promise<Intervention[]> {
    try {
      let query = supabaseAdmin
        .from('interventions')
        .select('*')
        .eq('user_id', userId)
        .eq('status', 'pending')
        .order('severity', { ascending: false })
        .order('timestamp', { ascending: false });

      if (minSeverity) {
        const severityOrder: Record<string, number> = {
          critical: 4,
          high: 3,
          medium: 2,
          low: 1,
        };
        const minOrder = severityOrder[minSeverity];
        // Filter by severity using a subquery or filter
        // For now, we'll filter in memory after fetching
      }

      if (limit) {
        query = query.limit(limit);
      }

      const { data, error } = await query;

      if (error) {
        logger.error({ error }, 'Failed to get active interventions');
        return [];
      }

      let interventions = (data || []) as Intervention[];

      // Filter by minimum severity if specified
      if (minSeverity) {
        const severityOrder: Record<string, number> = {
          critical: 4,
          high: 3,
          medium: 2,
          low: 1,
        };
        const minOrder = severityOrder[minSeverity];
        interventions = interventions.filter(
          i => severityOrder[i.severity] >= minOrder
        );
      }

      return interventions;
    } catch (error) {
      logger.error({ error }, 'Failed to get active interventions');
      return [];
    }
  }

  /**
   * Update intervention status
   */
  async updateStatus(
    interventionId: string,
    status: InterventionStatus
  ): Promise<boolean> {
    try {
      const updateData: any = {
        status,
        updated_at: new Date().toISOString(),
      };

      if (status === 'acknowledged') {
        updateData.acknowledged_at = new Date().toISOString();
      } else if (status === 'resolved') {
        updateData.resolved_at = new Date().toISOString();
      }

      const { error } = await supabaseAdmin
        .from('interventions')
        .update(updateData)
        .eq('id', interventionId);

      if (error) {
        logger.error({ error, interventionId }, 'Failed to update intervention status');
        return false;
      }

      return true;
    } catch (error) {
      logger.error({ error, interventionId }, 'Failed to update intervention status');
      return false;
    }
  }

  /**
   * Get intervention statistics
   */
  async getStats(userId: string): Promise<InterventionStats> {
    try {
      const { data, error } = await supabaseAdmin
        .from('interventions')
        .select('type, severity, status')
        .eq('user_id', userId);

      if (error || !data) {
        return {
          total_interventions: 0,
          by_type: {} as Record<InterventionType, number>,
          by_severity: {} as Record<InterventionSeverity, number>,
          by_status: {} as Record<InterventionStatus, number>,
          critical_count: 0,
          unresolved_count: 0,
        };
      }

      const stats: InterventionStats = {
        total_interventions: data.length,
        by_type: {} as Record<InterventionType, number>,
        by_severity: {} as Record<InterventionSeverity, number>,
        by_status: {} as Record<InterventionStatus, number>,
        critical_count: 0,
        unresolved_count: 0,
      };

      data.forEach(i => {
        stats.by_type[i.type as InterventionType] = (stats.by_type[i.type as InterventionType] || 0) + 1;
        stats.by_severity[i.severity as InterventionSeverity] = (stats.by_severity[i.severity as InterventionSeverity] || 0) + 1;
        stats.by_status[i.status as InterventionStatus] = (stats.by_status[i.status as InterventionStatus] || 0) + 1;

        if (i.severity === 'critical') {
          stats.critical_count++;
        }

        if (i.status === 'pending' || i.status === 'acknowledged') {
          stats.unresolved_count++;
        }
      });

      return stats;
    } catch (error) {
      logger.error({ error }, 'Failed to get intervention stats');
      return {
        total_interventions: 0,
        by_type: {} as Record<InterventionType, number>,
        by_severity: {} as Record<InterventionSeverity, number>,
        by_status: {} as Record<InterventionStatus, number>,
        critical_count: 0,
        unresolved_count: 0,
      };
    }
  }
}

