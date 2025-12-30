import { supabaseAdmin } from './supabaseClient';
import { logger } from '../logger';
import { v4 as uuid } from 'uuid';

// Reaction types and labels
export type ReactionTriggerType = 'memory' | 'perception';
export type ReactionType = 'emotional' | 'behavioral' | 'cognitive' | 'physical';

export type ReactionEntry = {
  id: string;
  user_id: string;
  trigger_type: ReactionTriggerType;
  trigger_id: string;
  reaction_type: ReactionType;
  reaction_label: string;
  intensity: number | null;
  duration: string | null;
  description: string | null;
  automatic: boolean;
  coping_response: string | null;
  timestamp_started: string;
  timestamp_resolved: string | null;
  resolution_state?: 'active' | 'resolved' | 'lingering' | 'recurring';
  outcome?: 'avoided' | 'confronted' | 'self_soothed' | 'escalated' | 'processed' | 'other' | null;
  recurrence_count?: number;
  recovery_time_minutes?: number | null;
  intensity_over_time?: number[];
  reflection_prompted_at?: string | null;
  reflection_answered_at?: string | null;
  reflection_response?: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type CreateReactionInput = {
  trigger_type: ReactionTriggerType;
  trigger_id: string;
  reaction_type: ReactionType;
  reaction_label: string;
  intensity?: number; // 0.0 to 1.0
  duration?: string;
  description?: string;
  automatic?: boolean;
  coping_response?: string;
  timestamp_started?: string;
  timestamp_resolved?: string;
};

export type UpdateReactionInput = Partial<Omit<CreateReactionInput, 'trigger_type' | 'trigger_id'>> & {
  timestamp_resolved?: string | null;
  resolution_state?: 'active' | 'resolved' | 'lingering' | 'recurring';
  outcome?: 'avoided' | 'confronted' | 'self_soothed' | 'escalated' | 'processed' | 'other' | null;
  recurrence_count?: number;
  recovery_time_minutes?: number | null;
  intensity_over_time?: number[];
  reflection_response?: string | null;
};

/**
 * Reaction Service
 * 
 * HARD RULE: Reactions never stand alone - they must attach to a memory or perception.
 * This enforces: Feelings and behaviors are responses — not truths.
 */
class ReactionService {
  /**
   * Create a new reaction entry
   */
  async createReaction(userId: string, input: CreateReactionInput): Promise<ReactionEntry> {
    try {
      // Validate trigger exists
      const triggerExists = await this.validateTrigger(userId, input.trigger_type, input.trigger_id);
      if (!triggerExists) {
        throw new Error(`Trigger ${input.trigger_type} with id ${input.trigger_id} not found`);
      }

      const id = uuid();
      const now = new Date().toISOString();

      const { data, error } = await supabaseAdmin
        .from('reaction_entries')
        .insert({
          id,
          user_id: userId,
          trigger_type: input.trigger_type,
          trigger_id: input.trigger_id,
          reaction_type: input.reaction_type,
          reaction_label: input.reaction_label,
          intensity: input.intensity ?? null,
          duration: input.duration || null,
          description: input.description || null,
          automatic: input.automatic ?? true,
          coping_response: input.coping_response || null,
          timestamp_started: input.timestamp_started || now,
          timestamp_resolved: input.timestamp_resolved || null,
          metadata: {},
          created_at: now,
          updated_at: now
        })
        .select('*')
        .single();

      if (error) {
        logger.error({ error, input }, 'Failed to create reaction entry');
        throw error;
      }

      return data as ReactionEntry;
    } catch (error) {
      logger.error({ error, input }, 'Failed to create reaction entry');
      throw error;
    }
  }

  /**
   * Get reactions for a user
   */
  async getReactions(
    userId: string,
    filters?: {
      trigger_type?: ReactionTriggerType;
      trigger_id?: string;
      reaction_type?: ReactionType;
      reaction_label?: string;
      limit?: number;
      offset?: number;
    }
  ): Promise<ReactionEntry[]> {
    try {
      let query = supabaseAdmin
        .from('reaction_entries')
        .select('*')
        .eq('user_id', userId)
        .order('timestamp_started', { ascending: false });

      if (filters?.trigger_type) {
        query = query.eq('trigger_type', filters.trigger_type);
      }
      if (filters?.trigger_id) {
        query = query.eq('trigger_id', filters.trigger_id);
      }
      if (filters?.reaction_type) {
        query = query.eq('reaction_type', filters.reaction_type);
      }
      if (filters?.reaction_label) {
        query = query.eq('reaction_label', filters.reaction_label);
      }
      if (filters?.limit) {
        query = query.limit(filters.limit);
      }
      if (filters?.offset) {
        query = query.offset(filters.offset);
      }

      const { data, error } = await query;

      if (error) {
        logger.error({ error, filters }, 'Failed to get reaction entries');
        throw error;
      }

      return (data as ReactionEntry[]) || [];
    } catch (error) {
      logger.error({ error, filters }, 'Failed to get reaction entries');
      throw error;
    }
  }

  /**
   * Get reactions for a specific trigger (memory or perception)
   */
  async getReactionsForTrigger(
    userId: string,
    triggerType: ReactionTriggerType,
    triggerId: string
  ): Promise<ReactionEntry[]> {
    return this.getReactions(userId, { trigger_type: triggerType, trigger_id: triggerId });
  }

  /**
   * Update a reaction entry
   */
  async updateReaction(
    userId: string,
    reactionId: string,
    input: UpdateReactionInput
  ): Promise<ReactionEntry> {
    try {
      const now = new Date().toISOString();

      const { data, error } = await supabaseAdmin
        .from('reaction_entries')
        .update({
          ...input,
          updated_at: now
        })
        .eq('id', reactionId)
        .eq('user_id', userId)
        .select('*')
        .single();

      if (error) {
        logger.error({ error, reactionId, input }, 'Failed to update reaction entry');
        throw error;
      }

      return data as ReactionEntry;
    } catch (error) {
      logger.error({ error, reactionId, input }, 'Failed to update reaction entry');
      throw error;
    }
  }

  /**
   * Delete a reaction entry
   */
  async deleteReaction(userId: string, reactionId: string): Promise<void> {
    try {
      const { error } = await supabaseAdmin
        .from('reaction_entries')
        .delete()
        .eq('id', reactionId)
        .eq('user_id', userId);

      if (error) {
        logger.error({ error, reactionId }, 'Failed to delete reaction entry');
        throw error;
      }
    } catch (error) {
      logger.error({ error, reactionId }, 'Failed to delete reaction entry');
      throw error;
    }
  }

  /**
   * Get reaction patterns (for therapist mode)
   */
  async getReactionPatterns(userId: string): Promise<{
    byTrigger: Record<string, number>;
    byLabel: Record<string, number>;
    byType: Record<ReactionType, number>;
    intensityAverages: Record<string, number>;
    commonPatterns: Array<{
      trigger_type: ReactionTriggerType;
      reaction_label: string;
      count: number;
      avg_intensity: number;
    }>;
  }> {
    try {
      const reactions = await this.getReactions(userId);

      const byTrigger: Record<string, number> = {};
      const byLabel: Record<string, number> = {};
      const byType: Record<ReactionType, number> = {
        emotional: 0,
        behavioral: 0,
        cognitive: 0,
        physical: 0
      };
      const intensityByLabel: Record<string, number[]> = {};

      reactions.forEach(reaction => {
        // Count by trigger
        const triggerKey = `${reaction.trigger_type}:${reaction.trigger_id}`;
        byTrigger[triggerKey] = (byTrigger[triggerKey] || 0) + 1;

        // Count by label
        byLabel[reaction.reaction_label] = (byLabel[reaction.reaction_label] || 0) + 1;

        // Count by type
        byType[reaction.reaction_type] = (byType[reaction.reaction_type] || 0) + 1;

        // Track intensity
        if (reaction.intensity !== null) {
          if (!intensityByLabel[reaction.reaction_label]) {
            intensityByLabel[reaction.reaction_label] = [];
          }
          intensityByLabel[reaction.reaction_label].push(reaction.intensity);
        }
      });

      // Calculate averages
      const intensityAverages: Record<string, number> = {};
      Object.keys(intensityByLabel).forEach(label => {
        const intensities = intensityByLabel[label];
        intensityAverages[label] = intensities.reduce((a, b) => a + b, 0) / intensities.length;
      });

      // Find common patterns
      const patternMap: Record<string, { count: number; totalIntensity: number }> = {};
      reactions.forEach(reaction => {
        const key = `${reaction.trigger_type}:${reaction.reaction_label}`;
        if (!patternMap[key]) {
          patternMap[key] = { count: 0, totalIntensity: 0 };
        }
        patternMap[key].count += 1;
        if (reaction.intensity !== null) {
          patternMap[key].totalIntensity += reaction.intensity;
        }
      });

      const commonPatterns = Object.entries(patternMap)
        .map(([key, data]) => {
          const [trigger_type, reaction_label] = key.split(':');
          return {
            trigger_type: trigger_type as ReactionTriggerType,
            reaction_label,
            count: data.count,
            avg_intensity: data.totalIntensity / data.count
          };
        })
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

      return {
        byTrigger,
        byLabel,
        byType,
        intensityAverages,
        commonPatterns
      };
    } catch (error) {
      logger.error({ error }, 'Failed to get reaction patterns');
      throw error;
    }
  }

  /**
   * Validate that trigger exists
   */
  private async validateTrigger(
    userId: string,
    triggerType: ReactionTriggerType,
    triggerId: string
  ): Promise<boolean> {
    try {
      if (triggerType === 'memory') {
        const { data } = await supabaseAdmin
          .from('journal_entries')
          .select('id')
          .eq('id', triggerId)
          .eq('user_id', userId)
          .single();
        return !!data;
      } else if (triggerType === 'perception') {
        const { data } = await supabaseAdmin
          .from('perception_entries')
          .select('id')
          .eq('id', triggerId)
          .eq('user_id', userId)
          .single();
        return !!data;
      }
      return false;
    } catch (error) {
      logger.warn({ error, triggerType, triggerId }, 'Failed to validate trigger');
      return false;
    }
  }
}

export const reactionService = new ReactionService();
