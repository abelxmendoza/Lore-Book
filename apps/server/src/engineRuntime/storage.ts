import { logger } from '../logger';
import { supabaseAdmin } from '../supabaseClient';
import type { EngineResult, EngineResults } from './types';

/**
 * Save engine results for a user
 */
export async function saveEngineResults(userId: string, results: EngineResults): Promise<void> {
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
      logger.error({ error, userId }, 'Error saving engine results');
      throw error;
    }

    logger.debug({ userId, engines: Object.keys(results).length }, 'Saved engine results');
  } catch (error) {
    logger.error({ error, userId }, 'Error saving engine results');
    throw error;
  }
}

/**
 * Save a single engine result
 */
export async function saveEngineResult(
  userId: string,
  engineName: string,
  result: EngineResult
): Promise<void> {
  try {
    // Get existing results
    const { data: existing, error: fetchError } = await supabaseAdmin
      .from('engine_results')
      .select('results')
      .eq('user_id', userId)
      .single();

    if (fetchError && fetchError.code !== 'PGRST116') {
      // PGRST116 is "not found", which is okay
      logger.error({ error: fetchError }, 'Error fetching existing results');
    }

    const existingResults: EngineResults = existing?.results || {};

    // Update with new result
    const updatedResults: EngineResults = {
      ...existingResults,
      [engineName]: result,
    };

    await saveEngineResults(userId, updatedResults);
  } catch (error) {
    logger.error({ error, userId, engine: engineName }, 'Error saving single engine result');
    throw error;
  }
}

/**
 * Get cached engine results for a user
 */
export async function getEngineResults(userId: string): Promise<EngineResults | null> {
  try {
    const { data, error } = await supabaseAdmin
      .from('engine_results')
      .select('results')
      .eq('user_id', userId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // Not found
        return null;
      }
      logger.error({ error }, 'Error fetching engine results');
      return null;
    }

    return data?.results || null;
  } catch (error) {
    logger.error({ error, userId }, 'Error getting engine results');
    return null;
  }
}

