import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';

import type { ShadowProfile } from './shadowTypes';

export const saveShadowProfile = async (userId: string, profile: ShadowProfile): Promise<void> => {
  try {
    const { error } = await supabaseAdmin.from('shadow_profiles').upsert(
      {
        user_id: userId,
        shadow_archetypes: profile.shadow_archetypes,
        dominant_shadow: profile.dominant_shadow,
        shadow_loops: profile.shadow_loops,
        shadow_triggers: profile.shadow_triggers,
        conflict_map: profile.conflict_map || {},
        projection: profile.projection,
        summary: profile.summary,
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: 'user_id',
      }
    );

    if (error) {
      logger.error({ error, userId }, 'Failed to save shadow profile');
      throw error;
    }
  } catch (error) {
    logger.error({ error, userId }, 'Error saving shadow profile');
    throw error;
  }
};

export const getShadowProfile = async (userId: string): Promise<ShadowProfile | null> => {
  try {
    const { data, error } = await supabaseAdmin
      .from('shadow_profiles')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // No rows returned
        return null;
      }
      logger.error({ error, userId }, 'Failed to get shadow profile');
      throw error;
    }

    return data as ShadowProfile;
  } catch (error) {
    logger.error({ error, userId }, 'Error getting shadow profile');
    return null;
  }
};

