// =====================================================
// ALIAS LEARNING SERVICE (Phase-Safe)
// Purpose: Learn soft alias mappings like "the kids"
// Rules: Never auto-apply, only assist resolution later, requires repetition
// =====================================================

import { logger } from '../../../logger';
import { supabaseAdmin } from '../../../supabaseClient';
import type { AliasHypothesis, ConfidenceScore } from './types';

const INITIAL_CONFIDENCE = 0.35;
const CONFIDENCE_INCREMENT = 0.1;
const MAX_CONFIDENCE = 0.75;
const MIN_EVIDENCE_COUNT = 2; // Require at least 2 observations
const MIN_CONFIDENCE_FOR_USE = 0.5; // Minimum confidence to use in resolution

/**
 * Learn alias mapping
 * Only creates hypothesis - never auto-applies
 */
export async function learnAlias(
  userId: string,
  alias: string,
  entityIds: string[],
  scope: AliasHypothesis['scope'],
  context?: {
    location?: string;
    household?: string;
  }
): Promise<AliasHypothesis | null> {
  try {
    // Guardrail: Need at least 2 entities for group alias
    if (entityIds.length < 2) {
      return null;
    }

    // Normalize alias
    const normalizedAlias = alias.toLowerCase().trim();

    // Check if alias hypothesis already exists
    const existing = await findExistingAliasHypothesis(
      userId,
      normalizedAlias,
      entityIds,
      scope
    );

    if (existing) {
      // Update existing hypothesis
      const updatedConfidence = Math.min(
        MAX_CONFIDENCE,
        existing.confidence + CONFIDENCE_INCREMENT
      );

      const updated: AliasHypothesis = {
        ...existing,
        confidence: updatedConfidence,
        evidence_count: existing.evidence_count + 1,
        last_observed_at: new Date().toISOString(),
        metadata: {
          ...(existing.metadata || {}),
          last_update: new Date().toISOString(),
          location: context?.location,
          household: context?.household,
        },
      };

      // Store in metadata (on all referenced entities)
      await storeAliasHypothesisInMetadata(userId, updated);

      logger.debug(
        {
          userId,
          alias: normalizedAlias,
          entityCount: entityIds.length,
          confidence: updatedConfidence,
          evidenceCount: updated.evidence_count,
        },
        'Updated alias hypothesis'
      );

      return updated;
    } else {
      // Create new hypothesis
      const newHypothesis: AliasHypothesis = {
        alias: normalizedAlias,
        refers_to_entity_ids: entityIds,
        scope,
        confidence: INITIAL_CONFIDENCE,
        evidence_count: 1,
        last_observed_at: new Date().toISOString(),
        first_observed_at: new Date().toISOString(),
        metadata: {
          location: context?.location,
          household: context?.household,
        },
      };

      // Store in metadata
      await storeAliasHypothesisInMetadata(userId, newHypothesis);

      logger.debug(
        {
          userId,
          alias: normalizedAlias,
          entityCount: entityIds.length,
          scope,
        },
        'Created new alias hypothesis'
      );

      return newHypothesis;
    }
  } catch (error) {
    logger.error({ error, userId, alias, entityIds }, 'Failed to learn alias');
    return null;
  }
}

/**
 * Get alias hypothesis for resolution assistance
 * Only returns if confidence >= MIN_CONFIDENCE_FOR_USE and evidence_count >= MIN_EVIDENCE_COUNT
 */
export async function getAliasHypothesis(
  userId: string,
  alias: string,
  scope?: AliasHypothesis['scope']
): Promise<AliasHypothesis | null> {
  try {
    const normalizedAlias = alias.toLowerCase().trim();

    // Search all characters for alias hypotheses
    const { data: characters } = await supabaseAdmin
      .from('characters')
      .select('id, metadata')
      .eq('user_id', userId);

    if (!characters) {
      return null;
    }

    for (const character of characters) {
      const metadata = character.metadata || {};
      const aliasHypotheses = (metadata.alias_hypotheses || []) as AliasHypothesis[];

      const matching = aliasHypotheses.find(
        h =>
          h.alias === normalizedAlias &&
          (scope === undefined || h.scope === scope) &&
          h.confidence >= MIN_CONFIDENCE_FOR_USE &&
          h.evidence_count >= MIN_EVIDENCE_COUNT
      );

      if (matching) {
        return matching;
      }
    }

    return null;
  } catch (error) {
    logger.debug({ error, userId, alias }, 'Failed to get alias hypothesis');
    return null;
  }
}

/**
 * Find existing alias hypothesis
 */
async function findExistingAliasHypothesis(
  userId: string,
  alias: string,
  entityIds: string[],
  scope: AliasHypothesis['scope']
): Promise<AliasHypothesis | null> {
  try {
    // Check first entity's metadata
    const { data: character } = await supabaseAdmin
      .from('characters')
      .select('metadata')
      .eq('id', entityIds[0])
      .eq('user_id', userId)
      .single();

    if (!character || !character.metadata) {
      return null;
    }

    const metadata = character.metadata;
    const aliasHypotheses = (metadata.alias_hypotheses || []) as AliasHypothesis[];

    // Find matching hypothesis (same alias, same entities, same scope)
    return (
      aliasHypotheses.find(
        h =>
          h.alias === alias &&
          h.scope === scope &&
          arraysEqual(h.refers_to_entity_ids.sort(), entityIds.sort())
      ) || null
    );
  } catch (error) {
    logger.debug({ error, alias, entityIds }, 'Failed to find existing alias hypothesis');
    return null;
  }
}

/**
 * Store alias hypothesis in metadata (on all referenced entities)
 */
async function storeAliasHypothesisInMetadata(
  userId: string,
  hypothesis: AliasHypothesis
): Promise<void> {
  try {
    // Store on all referenced entities
    for (const entityId of hypothesis.refers_to_entity_ids) {
      const { data: character } = await supabaseAdmin
        .from('characters')
        .select('metadata')
        .eq('id', entityId)
        .eq('user_id', userId)
        .single();

      if (!character) {
        continue;
      }

      const metadata = character.metadata || {};
      const aliasHypotheses = (metadata.alias_hypotheses || []) as AliasHypothesis[];

      // Remove old hypothesis if exists (same alias, same scope)
      const filtered = aliasHypotheses.filter(
        h => !(h.alias === hypothesis.alias && h.scope === hypothesis.scope)
      );

      // Add updated hypothesis
      filtered.push(hypothesis);

      await supabaseAdmin
        .from('characters')
        .update({
          metadata: {
            ...metadata,
            alias_hypotheses: filtered,
            last_alias_hypothesis_update: new Date().toISOString(),
          },
        })
        .eq('id', entityId)
        .eq('user_id', userId);
    }
  } catch (error) {
    logger.error({ error, hypothesis }, 'Failed to store alias hypothesis in metadata');
  }
}

/**
 * Check if two arrays are equal (order-independent)
 */
function arraysEqual<T>(arr1: T[], arr2: T[]): boolean {
  if (arr1.length !== arr2.length) {
    return false;
  }

  const set1 = new Set(arr1);
  return arr2.every(item => set1.has(item));
}
