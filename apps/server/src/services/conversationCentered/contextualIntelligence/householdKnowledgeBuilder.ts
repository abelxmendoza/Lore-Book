// =====================================================
// HOUSEHOLD KNOWLEDGE BUILDER (Phase-Safe)
// Purpose: Build hypotheses about living arrangements and dependency
// Rules: Confidence increases with repetition, decays without reinforcement, never treated as fact
// =====================================================

import { logger } from '../../../logger';
import { supabaseAdmin } from '../../../supabaseClient';
import type { HouseholdHypothesis, ConfidenceScore } from './types';

const INITIAL_CONFIDENCE = 0.4;
const CONFIDENCE_INCREMENT = 0.1;
const MAX_CONFIDENCE = 0.8;
const CONFIDENCE_DECAY_RATE = 0.05; // Per 30 days without reinforcement
const MIN_CONFIDENCE = 0.2;

/**
 * Update household hypothesis based on new signal
 * Returns updated hypothesis (never overwrites, only updates confidence)
 */
export async function updateHouseholdHypotheses(
  userId: string,
  signal: {
    subject_entity_id: string;
    related_entity_id: string;
    hypothesis_type: HouseholdHypothesis['hypothesis_type'];
    location?: string;
  }
): Promise<HouseholdHypothesis | null> {
  try {
    // Check if hypothesis already exists
    const existing = await findExistingHypothesis(
      userId,
      signal.subject_entity_id,
      signal.related_entity_id,
      signal.hypothesis_type
    );

    if (existing) {
      // Update existing hypothesis (increase confidence, evidence count)
      const updatedConfidence = Math.min(
        MAX_CONFIDENCE,
        existing.confidence + CONFIDENCE_INCREMENT
      );

      const updated: HouseholdHypothesis = {
        ...existing,
        confidence: updatedConfidence,
        evidence_count: existing.evidence_count + 1,
        last_observed_at: new Date().toISOString(),
        metadata: {
          ...(existing.metadata || {}),
          last_update: new Date().toISOString(),
          location: signal.location,
        },
      };

      // Store in character metadata (hypothesis, not fact)
      await storeHypothesisInMetadata(userId, updated);

      logger.debug(
        {
          userId,
          hypothesisType: signal.hypothesis_type,
          confidence: updatedConfidence,
          evidenceCount: updated.evidence_count,
        },
        'Updated household hypothesis'
      );

      return updated;
    } else {
      // Create new hypothesis
      const newHypothesis: HouseholdHypothesis = {
        hypothesis_type: signal.hypothesis_type,
        subject_entity_id: signal.subject_entity_id,
        related_entity_id: signal.related_entity_id,
        confidence: INITIAL_CONFIDENCE,
        evidence_count: 1,
        last_observed_at: new Date().toISOString(),
        first_observed_at: new Date().toISOString(),
        metadata: {
          location: signal.location,
        },
      };

      // Store in character metadata
      await storeHypothesisInMetadata(userId, newHypothesis);

      logger.debug(
        {
          userId,
          hypothesisType: signal.hypothesis_type,
          subjectId: signal.subject_entity_id,
          relatedId: signal.related_entity_id,
        },
        'Created new household hypothesis'
      );

      return newHypothesis;
    }
  } catch (error) {
    logger.error({ error, userId, signal }, 'Failed to update household hypothesis');
    return null;
  }
}

/**
 * Find existing hypothesis
 */
async function findExistingHypothesis(
  userId: string,
  subjectId: string,
  relatedId: string,
  hypothesisType: HouseholdHypothesis['hypothesis_type']
): Promise<HouseholdHypothesis | null> {
  try {
    // Check subject character metadata
    const { data: subjectCharacter } = await supabaseAdmin
      .from('characters')
      .select('metadata')
      .eq('id', subjectId)
      .eq('user_id', userId)
      .single();

    if (!subjectCharacter || !subjectCharacter.metadata) {
      return null;
    }

    const metadata = subjectCharacter.metadata;
    const hypotheses = (metadata.household_hypotheses || []) as HouseholdHypothesis[];

    return (
      hypotheses.find(
        h =>
          h.related_entity_id === relatedId && h.hypothesis_type === hypothesisType
      ) || null
    );
  } catch (error) {
    logger.debug({ error, subjectId, relatedId }, 'Failed to find existing hypothesis');
    return null;
  }
}

/**
 * Store hypothesis in character metadata
 */
async function storeHypothesisInMetadata(
  userId: string,
  hypothesis: HouseholdHypothesis
): Promise<void> {
  try {
    // Update subject character metadata
    const { data: subjectCharacter } = await supabaseAdmin
      .from('characters')
      .select('metadata')
      .eq('id', hypothesis.subject_entity_id)
      .eq('user_id', userId)
      .single();

    if (!subjectCharacter) {
      logger.warn(
        { subjectId: hypothesis.subject_entity_id },
        'Subject character not found for hypothesis storage'
      );
      return;
    }

    const metadata = subjectCharacter.metadata || {};
    const hypotheses = (metadata.household_hypotheses || []) as HouseholdHypothesis[];

    // Remove old hypothesis if exists
    const filtered = hypotheses.filter(
      h =>
        !(
          h.related_entity_id === hypothesis.related_entity_id &&
          h.hypothesis_type === hypothesis.hypothesis_type
        )
    );

    // Add updated hypothesis
    filtered.push(hypothesis);

    await supabaseAdmin
      .from('characters')
      .update({
        metadata: {
          ...metadata,
          household_hypotheses: filtered,
          last_household_hypothesis_update: new Date().toISOString(),
        },
      })
      .eq('id', hypothesis.subject_entity_id)
      .eq('user_id', userId);
  } catch (error) {
    logger.error({ error, hypothesis }, 'Failed to store hypothesis in metadata');
  }
}

/**
 * Decay confidence for hypotheses without reinforcement
 * Should be called periodically (e.g., daily cron job)
 */
export async function decayHouseholdHypotheses(userId: string): Promise<void> {
  try {
    const { data: characters } = await supabaseAdmin
      .from('characters')
      .select('id, metadata')
      .eq('user_id', userId);

    if (!characters) {
      return;
    }

    for (const character of characters) {
      const metadata = character.metadata || {};
      const hypotheses = (metadata.household_hypotheses || []) as HouseholdHypothesis[];

      if (hypotheses.length === 0) {
        continue;
      }

      const updatedHypotheses = hypotheses.map(h => {
        const lastObserved = new Date(h.last_observed_at).getTime();
        const daysSince = (Date.now() - lastObserved) / (1000 * 60 * 60 * 24);
        const decayPeriods = Math.floor(daysSince / 30); // 30-day periods

        if (decayPeriods > 0) {
          const newConfidence = Math.max(
            MIN_CONFIDENCE,
            h.confidence - decayPeriods * CONFIDENCE_DECAY_RATE
          );

          return {
            ...h,
            confidence: newConfidence,
          };
        }

        return h;
      });

      // Only update if changed
      const hasChanges = updatedHypotheses.some(
        (h, i) => h.confidence !== hypotheses[i].confidence
      );

      if (hasChanges) {
        await supabaseAdmin
          .from('characters')
          .update({
            metadata: {
              ...metadata,
              household_hypotheses: updatedHypotheses,
            },
          })
          .eq('id', character.id)
          .eq('user_id', userId);
      }
    }

    logger.debug({ userId }, 'Decayed household hypotheses');
  } catch (error) {
    logger.error({ error, userId }, 'Failed to decay household hypotheses');
  }
}
