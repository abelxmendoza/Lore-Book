import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';

/**
 * Save all engine results
 */
export async function saveEngineResults(userId: string, results: Record<string, any>): Promise<void> {
  try {
    const { error } = await supabaseAdmin
      .from('engine_results')
      .upsert(
        {
          user_id: userId,
          results,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: 'user_id',
        }
      );

    if (error) {
      logger.error({ error, userId }, 'Failed to save engine results');
      throw error;
    }
  } catch (error) {
    logger.error({ error, userId }, 'Error saving engine results');
    throw error;
  }
}

/**
 * Save a single engine result
 */
export async function saveEngineResult(userId: string, engineName: string, result: any): Promise<void> {
  try {
    // Get existing results
    const { data: existing } = await supabaseAdmin
      .from('engine_results')
      .select('results')
      .eq('user_id', userId)
      .single();

    const currentResults = existing?.results || {};
    const updatedResults = {
      ...currentResults,
      [engineName]: result,
    };

    const { error } = await supabaseAdmin
      .from('engine_results')
      .upsert(
        {
          user_id: userId,
          results: updatedResults,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: 'user_id',
        }
      );

    if (error) {
      logger.error({ error, userId, engine: engineName }, 'Failed to save engine result');
      throw error;
    }
  } catch (error) {
    logger.error({ error, userId, engine: engineName }, 'Error saving engine result');
    throw error;
  }
}

/**
 * Get cached engine results
 */
export async function getEngineResults(userId: string): Promise<Record<string, any> | null> {
  try {
    const { data, error } = await supabaseAdmin
      .from('engine_results')
      .select('results')
      .eq('user_id', userId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // No rows returned
        return null;
      }
      logger.error({ error, userId }, 'Failed to get engine results');
      return null;
    }

    return data?.results || null;
  } catch (error) {
    logger.error({ error, userId }, 'Error getting engine results');
    return null;
  }
}

