// =====================================================
// META CONTROL SERVICE
// Purpose: Manage user overrides for meaning interpretation
// =====================================================

import { logger } from '../logger';

import { supabaseAdmin } from './supabaseClient';

export type OverrideScope = 'EVENT' | 'PATTERN' | 'ENTITY' | 'TIME_RANGE' | 'GLOBAL';
export type OverrideType =
  | 'NOT_IMPORTANT'
  | 'JUST_VENTING'
  | 'OUTDATED'
  | 'MISINTERPRETED'
  | 'DO_NOT_TRACK_PATTERN'
  | 'LOWER_CONFIDENCE'
  | 'ARCHIVE';

interface MetaOverride {
  id: string;
  user_id: string;
  scope: OverrideScope;
  target_id: string | null;
  override_type: OverrideType;
  user_note: string | null;
  reversible: boolean;
  created_at: string;
  metadata?: Record<string, any>;
}

interface CreateOverridePayload {
  scope: OverrideScope;
  target_id?: string;
  override_type: OverrideType;
  user_note?: string;
}

export class MetaControlService {
  /**
   * Create a meta override
   */
  async createMetaOverride(userId: string, payload: CreateOverridePayload): Promise<MetaOverride> {
    try {
      // Check if override already exists
      if (payload.target_id) {
        const { data: existing } = await supabaseAdmin
          .from('meta_overrides')
          .select('id')
          .eq('user_id', userId)
          .eq('scope', payload.scope)
          .eq('target_id', payload.target_id)
          .eq('override_type', payload.override_type)
          .single();

        if (existing) {
          // Update existing override
          const { data: updated, error } = await supabaseAdmin
            .from('meta_overrides')
            .update({
              user_note: payload.user_note || null,
              metadata: {
                updated_at: new Date().toISOString(),
              },
            })
            .eq('id', existing.id)
            .select('*')
            .single();

          if (error) throw error;
          await this.applyOverrideEffects(userId, updated as MetaOverride);
          return updated as MetaOverride;
        }
      }

      // Create new override
      const { data: override, error } = await supabaseAdmin
        .from('meta_overrides')
        .insert({
          user_id: userId,
          scope: payload.scope,
          target_id: payload.target_id || null,
          override_type: payload.override_type,
          user_note: payload.user_note || null,
          reversible: true,
          metadata: {},
        })
        .select('*')
        .single();

      if (error) {
        throw error;
      }

      // Apply effects
      await this.applyOverrideEffects(userId, override as MetaOverride);

      logger.info({ userId, overrideId: override.id, type: payload.override_type }, 'Meta override created');

      return override as MetaOverride;
    } catch (error) {
      logger.error({ error, userId, payload }, 'Failed to create meta override');
      throw error;
    }
  }

  /**
   * List all meta overrides for a user
   */
  async listMetaOverrides(userId: string, scope?: OverrideScope): Promise<MetaOverride[]> {
    try {
      let query = supabaseAdmin
        .from('meta_overrides')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (scope) {
        query = query.eq('scope', scope);
      }

      const { data, error } = await query;

      if (error) {
        throw error;
      }

      return (data || []) as MetaOverride[];
    } catch (error) {
      logger.error({ error, userId }, 'Failed to list meta overrides');
      throw error;
    }
  }

  /**
   * Revert a meta override
   */
  async revertMetaOverride(overrideId: string, userId: string): Promise<void> {
    try {
      // Get override first
      const { data: override, error: fetchError } = await supabaseAdmin
        .from('meta_overrides')
        .select('*')
        .eq('id', overrideId)
        .eq('user_id', userId)
        .single();

      if (fetchError || !override) {
        throw new Error('Override not found');
      }

      if (!override.reversible) {
        throw new Error('This override is not reversible');
      }

      // Delete override
      const { error: deleteError } = await supabaseAdmin
        .from('meta_overrides')
        .delete()
        .eq('id', overrideId)
        .eq('user_id', userId);

      if (deleteError) {
        throw deleteError;
      }

      // Revert effects (if needed)
      await this.revertOverrideEffects(userId, override as MetaOverride);

      logger.info({ userId, overrideId }, 'Meta override reverted');
    } catch (error) {
      logger.error({ error, overrideId, userId }, 'Failed to revert meta override');
      throw error;
    }
  }

  /**
   * Check if an event has a specific override
   */
  async hasOverride(
    userId: string,
    targetId: string,
    scope: OverrideScope,
    overrideType?: OverrideType
  ): Promise<boolean> {
    try {
      let query = supabaseAdmin
        .from('meta_overrides')
        .select('id')
        .eq('user_id', userId)
        .eq('scope', scope)
        .eq('target_id', targetId)
        .limit(1);

      if (overrideType) {
        query = query.eq('override_type', overrideType);
      }

      const { data, error } = await query;

      if (error) {
        logger.warn({ error, userId, targetId }, 'Failed to check override');
        return false;
      }

      return (data || []).length > 0;
    } catch (error) {
      logger.warn({ error, userId, targetId }, 'Failed to check override');
      return false;
    }
  }

  /**
   * Get all overrides for a target
   */
  async getOverridesForTarget(
    userId: string,
    targetId: string,
    scope: OverrideScope
  ): Promise<MetaOverride[]> {
    try {
      const { data, error } = await supabaseAdmin
        .from('meta_overrides')
        .select('*')
        .eq('user_id', userId)
        .eq('scope', scope)
        .eq('target_id', targetId);

      if (error) {
        throw error;
      }

      return (data || []) as MetaOverride[];
    } catch (error) {
      logger.warn({ error, userId, targetId }, 'Failed to get overrides for target');
      return [];
    }
  }

  /**
   * Apply override effects
   */
  private async applyOverrideEffects(userId: string, override: MetaOverride): Promise<void> {
    try {
      switch (override.override_type) {
        case 'NOT_IMPORTANT':
          await this.reduceSalience(override.target_id, userId);
          await this.lowerConfidence(override.target_id, userId, 'User marked as not important');
          break;

        case 'JUST_VENTING':
          // Prevent pattern formation - handled in pattern detection
          await this.annotateContext(override.target_id, userId, 'Expressive, not declarative');
          break;

        case 'OUTDATED':
          await this.markAsHistorical(override.target_id, userId);
          await this.lowerRecencyWeight(override.target_id, userId);
          break;

        case 'MISINTERPRETED':
          await this.flagForReevaluation(override.target_id, userId);
          // Could enqueue MRQ here if needed
          break;

        case 'DO_NOT_TRACK_PATTERN':
          // Blacklist pattern generation - handled in pattern detection
          break;

        case 'LOWER_CONFIDENCE':
          await this.decreaseConfidence(override.target_id, userId, 0.2);
          break;

        case 'ARCHIVE':
          await this.archiveTarget(override.target_id, userId);
          break;
      }
    } catch (error) {
      logger.warn({ error, overrideId: override.id }, 'Failed to apply override effects');
    }
  }

  /**
   * Revert override effects
   */
  private async revertOverrideEffects(userId: string, override: MetaOverride): Promise<void> {
    // Most effects are query-time filters, so reverting just means removing the override
    // Some effects like confidence changes might need to be restored, but for simplicity
    // we'll just remove the override and let the system recalculate
    logger.debug({ overrideId: override.id }, 'Override reverted - effects will be recalculated');
  }

  /**
   * Reduce salience (importance) of a target
   */
  private async reduceSalience(targetId: string | null, userId: string): Promise<void> {
    if (!targetId) return;
    // Store in metadata for query-time filtering
    await supabaseAdmin
      .from('resolved_events')
      .update({
        metadata: {
          salience_reduced: true,
          salience_reduced_at: new Date().toISOString(),
        },
      })
      .eq('id', targetId)
      .eq('user_id', userId);
  }

  /**
   * Lower confidence of a target
   */
  private async lowerConfidence(
    targetId: string | null,
    userId: string,
    reason: string
  ): Promise<void> {
    if (!targetId) return;
    // Get current event
    const { data: event } = await supabaseAdmin
      .from('resolved_events')
      .select('confidence')
      .eq('id', targetId)
      .eq('user_id', userId)
      .single();

    if (event) {
      const newConfidence = Math.max(0.1, (event.confidence || 0.5) * 0.7);
      await supabaseAdmin
        .from('resolved_events')
        .update({
          confidence: newConfidence,
          metadata: {
            confidence_lowered: true,
            confidence_lowered_reason: reason,
            confidence_lowered_at: new Date().toISOString(),
          },
        })
        .eq('id', targetId)
        .eq('user_id', userId);
    }
  }

  /**
   * Annotate context
   */
  private async annotateContext(
    targetId: string | null,
    userId: string,
    annotation: string
  ): Promise<void> {
    if (!targetId) return;
    await supabaseAdmin
      .from('resolved_events')
      .update({
        metadata: {
          context_annotation: annotation,
          context_annotated_at: new Date().toISOString(),
        },
      })
      .eq('id', targetId)
      .eq('user_id', userId);
  }

  /**
   * Mark as historical
   */
  private async markAsHistorical(targetId: string | null, userId: string): Promise<void> {
    if (!targetId) return;
    await supabaseAdmin
      .from('resolved_events')
      .update({
        metadata: {
          is_historical: true,
          marked_historical_at: new Date().toISOString(),
        },
      })
      .eq('id', targetId)
      .eq('user_id', userId);
  }

  /**
   * Lower recency weight
   */
  private async lowerRecencyWeight(targetId: string | null, userId: string): Promise<void> {
    if (!targetId) return;
    await supabaseAdmin
      .from('resolved_events')
      .update({
        metadata: {
          recency_weight_reduced: true,
          recency_weight_reduced_at: new Date().toISOString(),
        },
      })
      .eq('id', targetId)
      .eq('user_id', userId);
  }

  /**
   * Flag for reevaluation
   */
  private async flagForReevaluation(targetId: string | null, userId: string): Promise<void> {
    if (!targetId) return;
    await supabaseAdmin
      .from('resolved_events')
      .update({
        metadata: {
          needs_reevaluation: true,
          flagged_for_reevaluation_at: new Date().toISOString(),
        },
      })
      .eq('id', targetId)
      .eq('user_id', userId);
  }

  /**
   * Decrease confidence by delta
   */
  private async decreaseConfidence(
    targetId: string | null,
    userId: string,
    delta: number
  ): Promise<void> {
    if (!targetId) return;
    const { data: event } = await supabaseAdmin
      .from('resolved_events')
      .select('confidence')
      .eq('id', targetId)
      .eq('user_id', userId)
      .single();

    if (event) {
      const newConfidence = Math.max(0.1, (event.confidence || 0.5) - delta);
      await supabaseAdmin
        .from('resolved_events')
        .update({
          confidence: newConfidence,
        })
        .eq('id', targetId)
        .eq('user_id', userId);
    }
  }

  /**
   * Archive target
   */
  private async archiveTarget(targetId: string | null, userId: string): Promise<void> {
    if (!targetId) return;
    await supabaseAdmin
      .from('resolved_events')
      .update({
        metadata: {
          archived: true,
          archived_at: new Date().toISOString(),
        },
      })
      .eq('id', targetId)
      .eq('user_id', userId);
  }
}

export const metaControlService = new MetaControlService();

