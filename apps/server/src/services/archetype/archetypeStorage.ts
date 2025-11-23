import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';
import type { ArchetypeSignal, ArchetypeProfile, ArchetypeTransition, ArchetypeDistortion } from './types';

/**
 * Handles storage and retrieval of archetype data
 */
export class ArchetypeStorage {
  /**
   * Save archetype signals
   */
  async saveSignals(signals: ArchetypeSignal[]): Promise<ArchetypeSignal[]> {
    if (signals.length === 0) return [];

    try {
      const { data, error } = await supabaseAdmin
        .from('archetype_signals')
        .insert(
          signals.map(s => ({
            user_id: s.user_id,
            entry_id: s.entry_id,
            label: s.label,
            confidence: s.confidence,
            evidence: s.evidence,
            timestamp: s.timestamp || new Date().toISOString(),
            metadata: s.metadata || {},
          }))
        )
        .select();

      if (error) {
        logger.error({ error }, 'Failed to save archetype signals');
        return [];
      }

      return (data || []) as ArchetypeSignal[];
    } catch (error) {
      logger.error({ error }, 'Failed to save archetype signals');
      return [];
    }
  }

  /**
   * Save archetype profile
   */
  async saveProfile(profile: ArchetypeProfile): Promise<void> {
    try {
      const { error } = await supabaseAdmin
        .from('archetype_profiles')
        .upsert(
          {
            user_id: profile.user_id,
            dominant: profile.dominant,
            secondary: profile.secondary,
            shadow: profile.shadow,
            distribution: profile.distribution,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id' }
        );

      if (error) {
        logger.error({ error }, 'Failed to save archetype profile');
      }
    } catch (error) {
      logger.error({ error }, 'Failed to save archetype profile');
    }
  }

  /**
   * Save transitions
   */
  async saveTransitions(transitions: ArchetypeTransition[]): Promise<void> {
    if (transitions.length === 0) return;

    try {
      const { error } = await supabaseAdmin
        .from('archetype_transitions')
        .insert(
          transitions.map(t => ({
            user_id: t.user_id,
            from_archetype: t.from,
            to_archetype: t.to,
            weight: t.weight,
            evidence: t.evidence,
            timestamp: t.timestamp || new Date().toISOString(),
            metadata: t.metadata || {},
          }))
        );

      if (error) {
        logger.error({ error }, 'Failed to save archetype transitions');
      }
    } catch (error) {
      logger.error({ error }, 'Failed to save archetype transitions');
    }
  }

  /**
   * Save distortions
   */
  async saveDistortions(distortions: ArchetypeDistortion[]): Promise<void> {
    if (distortions.length === 0) return;

    try {
      const { error } = await supabaseAdmin
        .from('archetype_distortions')
        .insert(
          distortions.map(d => ({
            user_id: d.user_id,
            archetype: d.archetype,
            distortion: d.distortion,
            confidence: d.confidence,
            indicators: d.indicators,
            timestamp: d.timestamp || new Date().toISOString(),
            metadata: d.metadata || {},
          }))
        );

      if (error) {
        logger.error({ error }, 'Failed to save archetype distortions');
      }
    } catch (error) {
      logger.error({ error }, 'Failed to save archetype distortions');
    }
  }

  /**
   * Get archetype profile for a user
   */
  async getProfile(userId: string): Promise<ArchetypeProfile | null> {
    try {
      const { data, error } = await supabaseAdmin
        .from('archetype_profiles')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (error || !data) {
        return null;
      }

      return data as ArchetypeProfile;
    } catch (error) {
      logger.error({ error }, 'Failed to get archetype profile');
      return null;
    }
  }
}

