import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';

import type { PersonalityTrait, PersonalityInsight } from './types';

/**
 * Handles storage and retrieval of personality data
 */
export class PersonalityStorage {
  /**
   * Save personality traits
   */
  async saveTraits(traits: PersonalityTrait[]): Promise<PersonalityTrait[]> {
    if (traits.length === 0) return [];

    try {
      const { data, error } = await supabaseAdmin
        .from('personality_traits')
        .upsert(
          traits.map(t => ({
            user_id: t.user_id,
            trait: t.trait,
            evidence: t.evidence,
            confidence: t.confidence,
            frequency: t.frequency,
            first_detected: t.first_detected,
            last_detected: t.last_detected,
            metadata: t.metadata || {},
          })),
          { onConflict: 'user_id,trait' }
        )
        .select();

      if (error) {
        logger.error({ error }, 'Failed to save personality traits');
        return [];
      }

      return (data || []) as PersonalityTrait[];
    } catch (error) {
      logger.error({ error }, 'Failed to save personality traits');
      return [];
    }
  }

  /**
   * Get personality traits for a user
   */
  async getTraits(userId: string): Promise<PersonalityTrait[]> {
    try {
      const { data, error } = await supabaseAdmin
        .from('personality_traits')
        .select('*')
        .eq('user_id', userId)
        .order('frequency', { ascending: false });

      if (error) {
        logger.error({ error }, 'Failed to get personality traits');
        return [];
      }

      return (data || []) as PersonalityTrait[];
    } catch (error) {
      logger.error({ error }, 'Failed to get personality traits');
      return [];
    }
  }

  /**
   * Save insights
   */
  async saveInsights(insights: PersonalityInsight[]): Promise<void> {
    if (insights.length === 0) return;

    try {
      const { error } = await supabaseAdmin
        .from('personality_insights')
        .insert(
          insights.map(i => ({
            user_id: i.user_id,
            type: i.type,
            message: i.message,
            confidence: i.confidence,
            timestamp: i.timestamp,
            trait: i.trait,
            metadata: i.metadata || {},
          }))
        );

      if (error) {
        logger.error({ error }, 'Failed to save personality insights');
      }
    } catch (error) {
      logger.error({ error }, 'Failed to save personality insights');
    }
  }
}

