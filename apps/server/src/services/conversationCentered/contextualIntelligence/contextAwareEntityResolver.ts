// =====================================================
// CONTEXT-AWARE ENTITY RESOLVER (Phase-Safe)
// Purpose: Resolve ambiguous references using local context only
// Rules: Only resolve if single dominant candidate, confidence ≥ 0.7
// =====================================================

import { logger } from '../../../logger';
import { supabaseAdmin } from '../../supabaseClient';

import type { EntityResolutionCandidate, ConfidenceScore } from './types';

const MIN_CONFIDENCE_THRESHOLD = 0.7;

/**
 * Resolve ambiguous entity reference using context
 * Only resolves if confidence >= 0.7 and single dominant candidate
 */
export async function resolveAmbiguousEntity(
  userId: string,
  referenceText: string,
  contextEntityIds: string[],
  additionalContext?: {
    location?: string;
    household?: string;
    recentConversations?: string[];
  }
): Promise<EntityResolutionCandidate | null> {
  try {
    // Guardrail: If no context entities, cannot resolve
    if (contextEntityIds.length === 0) {
      return null;
    }

    // Guardrail: If multiple candidates with similar confidence, do nothing
    if (contextEntityIds.length > 1) {
      // Check if we can narrow down using additional context
      const narrowed = await narrowDownCandidates(
        userId,
        referenceText,
        contextEntityIds,
        additionalContext
      );

      if (!narrowed || narrowed.length !== 1) {
        logger.debug(
          { referenceText, candidateCount: contextEntityIds.length },
          'Multiple candidates, cannot resolve with confidence'
        );
        return null;
      }

      // Use narrowed candidate
      const candidateId = narrowed[0];
      const confidence = await calculateResolutionConfidence(
        userId,
        referenceText,
        candidateId,
        additionalContext
      );

      if (confidence >= MIN_CONFIDENCE_THRESHOLD) {
        return {
          reference_text: referenceText,
          resolved_entity_id: candidateId,
          confidence,
          rationale: generateRationale(referenceText, candidateId, additionalContext),
        };
      }

      return null;
    }

    // Single candidate - check confidence
    const candidateId = contextEntityIds[0];
    const confidence = await calculateResolutionConfidence(
      userId,
      referenceText,
      candidateId,
      additionalContext
    );

    // Guardrail: Only resolve if confidence >= 0.7
    if (confidence < MIN_CONFIDENCE_THRESHOLD) {
      logger.debug(
        { referenceText, candidateId, confidence },
        'Confidence below threshold, not resolving'
      );
      return null;
    }

    return {
      reference_text: referenceText,
      resolved_entity_id: candidateId,
      confidence,
      rationale: generateRationale(referenceText, candidateId, additionalContext),
    };
  } catch (error) {
    logger.error({ error, userId, referenceText }, 'Failed to resolve ambiguous entity');
    return null;
  }
}

/**
 * Narrow down candidates using additional context
 */
async function narrowDownCandidates(
  userId: string,
  referenceText: string,
  candidateIds: string[],
  context?: {
    location?: string;
    household?: string;
    recentConversations?: string[];
  }
): Promise<string[] | null> {
  if (!context || candidateIds.length <= 1) {
    return candidateIds.length === 1 ? candidateIds : null;
  }

  // Check household context
  if (context.household) {
    const householdMembers = await getHouseholdMembers(userId, context.household);
    const householdCandidateIds = householdMembers
      .map(m => m.characterId)
      .filter(id => candidateIds.includes(id));

    if (householdCandidateIds.length === 1) {
      return householdCandidateIds;
    } else if (householdCandidateIds.length > 0) {
      // Multiple household members - check if reference matches a group
      if (isGroupReference(referenceText)) {
        return householdCandidateIds; // Return all household members
      }
    }
  }

  // Check alias matches
  const aliasMatches: string[] = [];
  for (const candidateId of candidateIds) {
    const hasAlias = await checkAliasMatch(userId, candidateId, referenceText);
    if (hasAlias) {
      aliasMatches.push(candidateId);
    }
  }

  if (aliasMatches.length === 1) {
    return aliasMatches;
  }

  // Cannot narrow down
  return null;
}

/**
 * Calculate resolution confidence
 */
async function calculateResolutionConfidence(
  userId: string,
  referenceText: string,
  candidateId: string,
  context?: {
    location?: string;
    household?: string;
    recentConversations?: string[];
  }
): Promise<ConfidenceScore> {
  let confidence = 0.5; // Base confidence

  // Check alias match (+0.3)
  const hasAlias = await checkAliasMatch(userId, candidateId, referenceText);
  if (hasAlias) {
    confidence += 0.3;
  }

  // Check household context (+0.2)
  if (context?.household) {
    const householdMembers = await getHouseholdMembers(userId, context.household);
    const isHouseholdMember = householdMembers.some(m => m.characterId === candidateId);
    if (isHouseholdMember) {
      confidence += 0.2;
    }
  }

  // Check recent mentions (+0.1)
  if (context?.recentConversations && context.recentConversations.length > 0) {
    const { data: character } = await supabaseAdmin
      .from('characters')
      .select('name')
      .eq('id', candidateId)
      .eq('user_id', userId)
      .single();

    if (character) {
      const recentMentions = context.recentConversations.filter(msg =>
        msg.toLowerCase().includes(character.name.toLowerCase())
      );
      if (recentMentions.length > 0) {
        confidence += 0.1;
      }
    }
  }

  return Math.min(1.0, confidence);
}

/**
 * Check if character has alias matching reference
 */
async function checkAliasMatch(
  userId: string,
  characterId: string,
  referenceText: string
): Promise<boolean> {
  try {
    const { data: character } = await supabaseAdmin
      .from('characters')
      .select('alias, name')
      .eq('id', characterId)
      .eq('user_id', userId)
      .single();

    if (!character) {
      return false;
    }

    const normalizedReference = referenceText.toLowerCase().trim();
    const aliases = Array.isArray(character.alias) ? character.alias : [];
    const name = character.name.toLowerCase();

    return (
      name === normalizedReference ||
      aliases.some(alias => alias.toLowerCase() === normalizedReference)
    );
  } catch (error) {
    logger.debug({ error, characterId, referenceText }, 'Failed to check alias match');
    return false;
  }
}

/**
 * Get household members
 */
async function getHouseholdMembers(
  userId: string,
  householdName: string
): Promise<Array<{ characterId: string; characterName: string }>> {
  try {
    const { data: characters } = await supabaseAdmin
      .from('characters')
      .select('id, name, metadata')
      .eq('user_id', userId);

    if (!characters) {
      return [];
    }

    const members: Array<{ characterId: string; characterName: string }> = [];

    for (const character of characters) {
      const metadata = character.metadata || {};
      const households = (metadata.households || []) as Array<{
        name: string;
        relationship: string;
      }>;

      const householdMatch = households.find(
        hh =>
          hh.name.toLowerCase().includes(householdName.toLowerCase()) ||
          householdName.toLowerCase().includes(hh.name.toLowerCase())
      );

      if (householdMatch) {
        members.push({
          characterId: character.id,
          characterName: character.name,
        });
      }
    }

    return members;
  } catch (error) {
    logger.debug({ error, householdName }, 'Failed to get household members');
    return [];
  }
}

/**
 * Check if reference is a group reference (e.g., "the kids", "everyone")
 */
function isGroupReference(referenceText: string): boolean {
  const groupPatterns = [
    /^the\s+(kids|children|boys|girls|guys|people|family|everyone)$/i,
    /^(kids|children|boys|girls|guys|people|family|everyone)$/i,
  ];

  return groupPatterns.some(pattern => pattern.test(referenceText.trim()));
}

/**
 * Generate rationale for resolution
 */
function generateRationale(
  referenceText: string,
  candidateId: string,
  context?: {
    location?: string;
    household?: string;
    recentConversations?: string[];
  }
): string {
  const parts: string[] = [];

  if (context?.household) {
    parts.push(`Household context: ${context.household}`);
  }

  if (context?.location) {
    parts.push(`Location: ${context.location}`);
  }

  return parts.length > 0
    ? `Resolved "${referenceText}" based on: ${parts.join(', ')}`
    : `Resolved "${referenceText}" based on context`;
}
