import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';

import type { ContinuityProfile } from './continuityTypes';

/**
 * Handles storage and retrieval of continuity profiles
 */
export class ContinuityProfileStorage {
  /**
   * Save continuity profile
   */
  async saveProfile(userId: string, profile: ContinuityProfile): Promise<void> {
    try {
      // Get current version
      const { data: existing } = await supabaseAdmin
        .from('continuity_profiles')
        .select('version')
        .eq('user_id', userId)
        .order('computed_at', { ascending: false })
        .limit(1)
        .single();

      const nextVersion = existing?.version ? existing.version + 1 : 1;

      const { error } = await supabaseAdmin
        .from('continuity_profiles')
        .insert({
          user_id: userId,
          profile_data: profile,
          computed_at: profile.computed_at,
          version: nextVersion,
        });

      if (error) {
        logger.error({ error, userId }, 'Failed to save continuity profile');
        throw error;
      }

      logger.debug({ userId, version: nextVersion }, 'Saved continuity profile');
    } catch (error) {
      logger.error({ error, userId }, 'Failed to save continuity profile');
      throw error;
    }
  }

  /**
   * Get latest continuity profile
   */
  async getProfile(userId: string): Promise<ContinuityProfile | null> {
    try {
      const { data, error } = await supabaseAdmin
        .from('continuity_profiles')
        .select('profile_data')
        .eq('user_id', userId)
        .order('computed_at', { ascending: false })
        .limit(1)
        .single();

      if (error || !data) {
        return null;
      }

      return data.profile_data as ContinuityProfile;
    } catch (error) {
      logger.error({ error, userId }, 'Failed to get continuity profile');
      return null;
    }
  }

  /**
   * Get profile history
   */
  async getProfileHistory(userId: string, limit: number = 10): Promise<ContinuityProfile[]> {
    try {
      const { data, error } = await supabaseAdmin
        .from('continuity_profiles')
        .select('profile_data, computed_at, version')
        .eq('user_id', userId)
        .order('computed_at', { ascending: false })
        .limit(limit);

      if (error) {
        logger.error({ error, userId }, 'Failed to get profile history');
        return [];
      }

      return (data || []).map(d => d.profile_data as ContinuityProfile);
    } catch (error) {
      logger.error({ error, userId }, 'Failed to get profile history');
      return [];
    }
  }
}
