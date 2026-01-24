import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';

import type {
  IdentitySignal,
  IdentityDimension,
  IdentityConflict,
  IdentityCoreProfile,
} from './identityTypes';

/**
 * Storage service for identity core data
 */
export class IdentityStorage {
  /**
   * Save identity signals
   */
  async saveSignals(userId: string, signals: IdentitySignal[]): Promise<any[]> {
    const saved: any[] = [];

    try {
      for (const signal of signals) {
        const { data: row, error } = await supabase
          .from('identity_signals')
          .insert({
            user_id: userId,
            memory_id: signal.memory_id || null,
            type: signal.type,
            text: signal.text,
            evidence: signal.evidence,
            timestamp: signal.timestamp,
            weight: signal.weight,
            confidence: signal.confidence,
            embedding: signal.embedding || null,
          })
          .select()
          .single();

        if (error) {
          logger.error({ error, signal }, 'Error inserting identity signal');
          continue;
        }

        saved.push(row);
      }

      logger.debug({ count: saved.length }, 'Saved identity signals');
    } catch (error) {
      logger.error({ error }, 'Error saving signals');
    }

    return saved;
  }

  /**
   * Save dimensions
   */
  async saveDimensions(userId: string, profileId: string, dimensions: IdentityDimension[]): Promise<any[]> {
    const saved: any[] = [];

    try {
      for (const dimension of dimensions) {
        const { data: dimRow, error: dimError } = await supabase
          .from('identity_dimensions')
          .insert({
            user_id: userId,
            profile_id: profileId,
            name: dimension.name,
            score: dimension.score,
          })
          .select()
          .single();

        if (dimError) {
          logger.error({ error: dimError, dimension }, 'Error inserting dimension');
          continue;
        }

        // Link signals to dimension
        for (const signal of dimension.signals) {
          if (signal.id) {
            await supabaseAdmin.from('identity_dimension_signals').insert({
              dimension_id: dimRow.id,
              signal_id: signal.id,
            });
          }
        }

        saved.push(dimRow);
      }

      logger.debug({ count: saved.length }, 'Saved identity dimensions');
    } catch (error) {
      logger.error({ error }, 'Error saving dimensions');
    }

    return saved;
  }

  /**
   * Save conflicts
   */
  async saveConflicts(userId: string, profileId: string, conflicts: IdentityConflict[]): Promise<any[]> {
    const saved: any[] = [];

    try {
      for (const conflict of conflicts) {
        const { data: row, error } = await supabase
          .from('identity_conflicts')
          .insert({
            user_id: userId,
            profile_id: profileId,
            conflict_name: conflict.conflictName,
            positive_side: conflict.positiveSide,
            negative_side: conflict.negativeSide,
            evidence: conflict.evidence,
            tension: conflict.tension,
          })
          .select()
          .single();

        if (error) {
          logger.error({ error, conflict }, 'Error inserting conflict');
          continue;
        }

        saved.push(row);
      }

      logger.debug({ count: saved.length }, 'Saved identity conflicts');
    } catch (error) {
      logger.error({ error }, 'Error saving conflicts');
    }

    return saved;
  }

  /**
   * Save identity core profile
   */
  async save(userId: string, profile: IdentityCoreProfile): Promise<any> {
    try {
      const { data: profileRow, error: profileError } = await supabase
        .from('identity_core_profiles')
        .insert({
          user_id: userId,
          dimensions: profile.dimensions,
          conflicts: profile.conflicts,
          stability: profile.stability,
          projection: profile.projection,
          summary: profile.summary,
          profile_data: profile,
        })
        .select()
        .single();

      if (profileError) {
        logger.error({ error: profileError, profile }, 'Error inserting profile');
        throw profileError;
      }

      logger.debug({ profileId: profileRow.id }, 'Saved identity core profile');
      return profileRow;
    } catch (error) {
      logger.error({ error, profile }, 'Error saving profile');
      throw error;
    }
  }

  /**
   * Get profiles for a user
   */
  async getProfiles(userId: string): Promise<IdentityCoreProfile[]> {
    try {
      const { data, error } = await supabase
        .from('identity_core_profiles')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) {
        logger.error({ error }, 'Error fetching profiles');
        return [];
      }

      return (data || []).map((row) => ({
        id: row.id,
        dimensions: row.dimensions || [],
        conflicts: row.conflicts || [],
        stability: row.stability || { volatility: 0, anchors: [], unstableTraits: [] },
        projection: row.projection || { trajectory: [], predictedIdentity: 'Unknown' },
        summary: row.summary || '',
        user_id: row.user_id,
        created_at: row.created_at,
        updated_at: row.updated_at,
      }));
    } catch (error) {
      logger.error({ error }, 'Error getting profiles');
      return [];
    }
  }

  /**
   * Get signals for a user
   */
  async getSignals(userId: string, limit: number = 100): Promise<IdentitySignal[]> {
    try {
      const { data, error } = await supabase
        .from('identity_signals')
        .select('*')
        .eq('user_id', userId)
        .order('timestamp', { ascending: false })
        .limit(limit);

      if (error) {
        logger.error({ error }, 'Error fetching signals');
        return [];
      }

      return (data || []).map((row) => ({
        id: row.id,
        type: row.type,
        text: row.text,
        evidence: row.evidence,
        timestamp: row.timestamp,
        weight: row.weight,
        confidence: row.confidence,
        embedding: row.embedding || [],
        memory_id: row.memory_id,
        user_id: row.user_id,
        created_at: row.created_at,
      }));
    } catch (error) {
      logger.error({ error }, 'Error getting signals');
      return [];
    }
  }

  /**
   * Link identity signals to memory components (bidirectional)
   */
  async linkSignalsToComponents(signals: any[], components: any[]): Promise<void> {
    try {
      // Create links in identity_signal_memory_component_links table
      for (const signal of signals) {
        if (!signal.id) continue;

        for (const component of components) {
          if (!component.id) continue;

          // Insert link (ignore duplicates)
          await supabaseAdmin
            .from('identity_signal_memory_component_links')
            .insert({
              signal_id: signal.id,
              component_id: component.id,
            })
            .then(({ error }) => {
              if (error && error.code !== '23505') { // Ignore duplicate key errors
                logger.debug({ error, signalId: signal.id, componentId: component.id }, 'Failed to link signal to component');
              }
            });
        }
      }

      logger.debug({ signalCount: signals.length, componentCount: components.length }, 'Linked signals to components');
    } catch (error) {
      logger.error({ error }, 'Error linking signals to components');
      // Don't throw - this is non-critical
    }
  }

  /**
   * Update existing profile
   */
  async updateProfile(profileId: string, profile: Partial<IdentityCoreProfile>): Promise<any> {
    try {
      const { data, error } = await supabaseAdmin
        .from('identity_core_profiles')
        .update({
          dimensions: profile.dimensions,
          conflicts: profile.conflicts,
          stability: profile.stability,
          projection: profile.projection,
          summary: profile.summary,
          profile_data: profile,
          updated_at: new Date().toISOString(),
        })
        .eq('id', profileId)
        .select()
        .single();

      if (error) {
        logger.error({ error, profileId }, 'Error updating profile');
        throw error;
      }

      return { data };
    } catch (error) {
      logger.error({ error, profileId }, 'Error updating profile');
      throw error;
    }
  }

  /**
   * Create timeline events for identity changes
   */
  async createTimelineEvents(
    userId: string,
    profileId: string,
    dimensions: any[],
    conflicts: any[],
    stability: any
  ): Promise<void> {
    try {
      const events: any[] = [];

      // Event for each dimension
      for (const dim of dimensions) {
        events.push({
          user_id: userId,
          profile_id: profileId,
          event_type: 'dimension_added',
          description: `Identity dimension "${dim.name}" detected (score: ${((dim.score || 0) * 100).toFixed(0)}%)`,
          metadata: {
            dimension_name: dim.name,
            dimension_score: dim.score,
            signal_count: dim.signals?.length || 0,
          },
          timestamp: new Date().toISOString(),
        });
      }

      // Event for each conflict
      for (const conflict of conflicts) {
        events.push({
          user_id: userId,
          profile_id: profileId,
          event_type: 'conflict_detected',
          description: `Identity conflict detected: ${conflict.conflictName} (tension: ${((conflict.tension || 0) * 100).toFixed(0)}%)`,
          metadata: {
            conflict_name: conflict.conflictName,
            positive_side: conflict.positiveSide,
            negative_side: conflict.negativeSide,
            tension: conflict.tension,
          },
          timestamp: new Date().toISOString(),
        });
      }

      // Event for stability shift
      if (stability.volatility !== undefined) {
        const volatilityStatus = stability.volatility > 0.7 ? 'High volatility (identity shifting)' :
                                  stability.volatility > 0.4 ? 'Moderate volatility (exploring)' :
                                  'Stable identity';
        events.push({
          user_id: userId,
          profile_id: profileId,
          event_type: 'stability_shift',
          description: `Identity stability: ${volatilityStatus}`,
          metadata: {
            volatility: stability.volatility,
            anchor_count: stability.anchors?.length || 0,
            unstable_trait_count: stability.unstableTraits?.length || 0,
          },
          timestamp: new Date().toISOString(),
        });
      }

      // Insert events (ignore if table doesn't exist)
      if (events.length > 0) {
        await supabaseAdmin
          .from('identity_timeline_events')
          .insert(events)
          .then(({ error }) => {
            if (error && error.code !== '42P01') {
              logger.debug({ error }, 'Failed to create identity timeline events');
            }
          });
      }
    } catch (error) {
      logger.debug({ error }, 'Failed to create identity timeline events (table may not exist)');
      // Don't throw - this is non-critical
    }
  }
}

