// =====================================================
// BELIEF EVALUATOR
// Purpose: Evaluates beliefs for patterns (repetition, reward correlation, contradictions)
// =====================================================

import { logger } from '../../../logger';
import { supabaseAdmin } from '../../supabaseClient';

import type { BeliefEvaluation } from './types';

/**
 * Evaluate a belief for patterns that indicate it might need gentle exploration
 * 
 * @param userId User ID
 * @param perceptionId Perception entry ID to evaluate
 * @returns Evaluation with repetition count, reward correlation, and contradiction count
 */
export async function evaluateBelief(
  userId: string,
  perceptionId: string
): Promise<BeliefEvaluation> {
  try {
    // Get the perception to evaluate
    const { data: perception } = await supabaseAdmin
      .from('perception_entries')
      .select('content, subject_alias')
      .eq('id', perceptionId)
      .eq('user_id', userId)
      .single();

    if (!perception) {
      logger.warn({ perceptionId, userId }, 'Perception not found for evaluation');
      return {
        repetitionCount: 0,
        rewardCorrelation: 0,
        contradictingEvidenceCount: 0,
      };
    }

    // Count similar perceptions (same subject, within last 90 days)
    // This counts how many times this belief pattern has appeared
    const { count: repetitionCount } = await supabaseAdmin
      .from('perception_entries')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('subject_alias', perception.subject_alias)
      .eq('retracted', false)
      .gte('created_at', new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()); // Last 90 days

    // Reward correlation (check if actions influenced by this perception had positive/negative rewards)
    // Note: strategy_actions table may not exist, so we handle gracefully
    let rewardCorrelation = 0;
    try {
      const { data: actions } = await supabaseAdmin
        .from('strategy_actions')
        .select('reward, metadata')
        .eq('user_id', userId)
        .gte('created_at', new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString());

      if (actions && actions.length > 0) {
        const relevantActions = actions.filter(
          (a: any) =>
            a.metadata?.influencing_perception_id === perceptionId ||
            a.metadata?.influencing_perceptions?.includes(perceptionId)
        );

        if (relevantActions.length > 0) {
          const avgReward =
            relevantActions.reduce((sum: number, a: any) => sum + (a.reward || 0), 0) /
            relevantActions.length;
          // Normalize to -1.0 to 1.0 (assuming rewards are typically -1 to 1)
          rewardCorrelation = Math.max(-1, Math.min(1, avgReward));
        }
      }
    } catch (error) {
      // Table doesn't exist or query failed - that's okay, we'll use 0
      logger.debug({ error }, 'strategy_actions table not available, skipping reward correlation');
    }

    // Contradicting evidence (journal entries that contradict this perception)
    // This checks for explicit contradiction links in metadata
    let contradictingEvidenceCount = 0;
    try {
      const { count } = await supabaseAdmin
        .from('journal_entries')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .contains('metadata->contradicts_perception_ids', [perceptionId])
        .gte('created_at', new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString());
      
      contradictingEvidenceCount = count || 0;
    } catch (error) {
      // Query failed - that's okay, we'll use 0
      logger.debug({ error }, 'Failed to query contradicting evidence');
    }

    return {
      repetitionCount: repetitionCount || 0,
      rewardCorrelation,
      contradictingEvidenceCount: contradictingEvidenceCount || 0,
    };
  } catch (error) {
    logger.error({ error, perceptionId, userId }, 'Failed to evaluate belief');
    return {
      repetitionCount: 0,
      rewardCorrelation: 0,
      contradictingEvidenceCount: 0,
    };
  }
}
