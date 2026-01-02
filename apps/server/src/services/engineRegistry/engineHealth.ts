import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';
import type { EngineHealthRecord } from './types';

/**
 * Tracks engine health and performance
 */
export class EngineHealth {
  /**
   * Record successful engine run
   */
  async recordSuccess(name: string, duration: number): Promise<void> {
    try {
      const { error } = await supabaseAdmin.rpc('update_engine_health_success', {
        p_engine_name: name,
        p_duration: duration,
      });

      if (error) {
        logger.error({ error, name, duration }, 'Failed to record engine success');
      }
    } catch (error) {
      logger.error({ error, name, duration }, 'Failed to record engine success');
    }
  }

  /**
   * Record engine error
   */
  async recordError(name: string, errorMessage: string): Promise<void> {
    try {
      const { error } = await supabaseAdmin.rpc('update_engine_health_error', {
        p_engine_name: name,
        p_error: errorMessage,
      });

      if (error) {
        logger.error({ error, name, errorMessage }, 'Failed to record engine error');
      }
    } catch (error) {
      logger.error({ error, name, errorMessage }, 'Failed to record engine error');
    }
  }

  /**
   * Get health record for an engine
   */
  async getHealth(name: string): Promise<EngineHealthRecord | null> {
    try {
      const { data, error } = await supabaseAdmin
        .from('engine_health')
        .select('*')
        .eq('engine_name', name)
        .single();

      if (error || !data) {
        return null;
      }

      return data as EngineHealthRecord;
    } catch (error) {
      logger.error({ error, name }, 'Failed to get engine health');
      return null;
    }
  }

  /**
   * Get health for all engines
   */
  async getAllHealth(): Promise<EngineHealthRecord[]> {
    try {
      const { data, error } = await supabaseAdmin
        .from('engine_health')
        .select('*')
        .order('engine_name', { ascending: true });

      if (error) {
        logger.error({ error }, 'Failed to get all engine health');
        return [];
      }

      return (data || []) as EngineHealthRecord[];
    } catch (error) {
      logger.error({ error }, 'Failed to get all engine health');
      return [];
    }
  }
}

