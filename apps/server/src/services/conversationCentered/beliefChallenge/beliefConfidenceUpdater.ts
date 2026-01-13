// =====================================================
// BELIEF CONFIDENCE UPDATER
// Purpose: Safely updates belief confidence based on signals
// Rules: Confidence ∈ [0.1, 0.8], never becomes "fact", never drops to zero
// =====================================================

import { logger } from '../../../logger';
import { supabaseAdmin } from '../../../supabaseClient';

export type ConfidenceSignal = 'reinforced' | 'questioned' | 'contradicted';

const MIN_CONFIDENCE = 0.1;
const MAX_CONFIDENCE = 0.8;
const REINFORCED_DELTA = 0.05;
const QUESTIONED_DELTA = -0.05;
const CONTRADICTED_DELTA = -0.1;

/**
 * Update belief confidence based on signal
 * 
 * Rules:
 * - Confidence stays between 0.1 and 0.8
 * - Never becomes "fact" (never reaches 1.0)
 * - Never drops to zero (never reaches 0.0)
 * - Small increments to prevent sudden changes
 * 
 * @param userId User ID
 * @param perceptionId Perception entry ID
 * @param signal Signal type (reinforced, questioned, contradicted)
 */
export async function updateBeliefConfidence(
  userId: string,
  perceptionId: string,
  signal: ConfidenceSignal
): Promise<void> {
  try {
    // Get current confidence
    const { data: perception, error: fetchError } = await supabaseAdmin
      .from('perception_entries')
      .select('confidence_level')
      .eq('id', perceptionId)
      .eq('user_id', userId)
      .single();

    if (fetchError || !perception) {
      logger.warn({ error: fetchError, perceptionId, userId }, 'Failed to fetch perception for confidence update');
      return;
    }

    const currentConfidence = typeof perception.confidence_level === 'number'
      ? perception.confidence_level
      : parseConfidenceLevel(perception.confidence_level);

    // Calculate delta
    const delta =
      signal === 'reinforced' ? REINFORCED_DELTA :
      signal === 'questioned' ? QUESTIONED_DELTA :
      CONTRADICTED_DELTA;

    // Calculate new confidence with bounds
    const newConfidence = Math.max(
      MIN_CONFIDENCE,
      Math.min(MAX_CONFIDENCE, currentConfidence + delta)
    );

    // Update confidence
    const { error: updateError } = await supabaseAdmin
      .from('perception_entries')
      .update({
        confidence_level: newConfidence,
        metadata: {
          ...(typeof perception.metadata === 'object' ? perception.metadata : {}),
          last_confidence_update: new Date().toISOString(),
          confidence_update_signal: signal,
        },
      })
      .eq('id', perceptionId)
      .eq('user_id', userId);

    if (updateError) {
      logger.error({ error: updateError, perceptionId, userId }, 'Failed to update belief confidence');
      return;
    }

    logger.debug(
      {
        perceptionId,
        userId,
        signal,
        oldConfidence: currentConfidence,
        newConfidence,
        delta,
      },
      'Updated belief confidence'
    );
  } catch (error) {
    logger.error({ error, perceptionId, userId, signal }, 'Failed to update belief confidence');
  }
}

/**
 * Parse confidence level from string or number
 */
function parseConfidenceLevel(level: string | number | null | undefined): number {
  if (typeof level === 'number') return level;
  if (typeof level === 'string') {
    const map: Record<string, number> = {
      'very_low': 0.2,
      'low': 0.3,
      'medium': 0.5,
      'high': 0.7,
      'very_high': 0.9,
    };
    return map[level] || 0.5;
  }
  return 0.5;
}
