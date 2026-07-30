/**
 * When a relational placeholder character is created ("Taylor's Homegirl",
 * "friend of Marcus"), also ensure the named anchor ("Taylor", "Marcus")
 * exists as their own character and is linked to the placeholder.
 *
 * Without this, possessive cards orphan the person they refer to.
 */

import { v4 as uuid } from 'uuid';
import { logger } from '../../logger';
import { parseRelationalPlaceholder } from '../../utils/characterNameMatching';
import { normalizeNameKey, splitPersonName } from '../../utils/nameNormalization';
import { characterRegistry } from '../characterRegistry';
import { characterAuthorityService } from '../characterAuthorityService';
import { characterConnectionService } from '../characterConnectionService';
import { assignCharacterAvatar } from '../characterAvatarService';
import { supabaseAdmin } from '../supabaseClient';

export type EnsureRelationalPossessorResult = {
  possessorId: string | null;
  created: boolean;
  linked: boolean;
  relation?: string;
  anchor?: string;
  skippedReason?: string;
};

function schedulePossessorEnsure(
  work: () => Promise<EnsureRelationalPossessorResult>,
): void {
  void work().catch((err) => {
    logger.warn({ err }, 'relational possessor ensure failed (non-blocking)');
  });
}

async function createPossessorCharacter(
  userId: string,
  cleanName: string,
  relation: string,
  placeholderCharacterId: string,
): Promise<string | null> {
  const characterId = uuid();
  const parts = splitPersonName(cleanName);
  const avatarUrl = await assignCharacterAvatar(characterId);
  const now = new Date().toISOString();

  const { error } = await supabaseAdmin.from('characters').insert({
    id: characterId,
    user_id: userId,
    name: cleanName,
    first_name: parts.firstName || null,
    last_name: parts.lastName || null,
    alias: null,
    status: 'active',
    tags: [],
    importance_level: 'minor',
    relationship_depth: 'mentioned_only',
    avatar_url: avatarUrl,
    metadata: {
      generated_by: 'relational_possessor',
      generated_at: now,
      from_placeholder_character_id: placeholderCharacterId,
      relational_role_to_placeholder: relation,
      identity_note: `Named as the anchor of a possessive/relational label ("…'s ${relation}" / "${relation} of …").`,
    },
    created_at: now,
    updated_at: now,
  });

  if (error) {
    logger.warn({ error, cleanName, userId }, 'Failed to create relational possessor character');
    return null;
  }

  // 'minor' above is just a seed — the canonical scorer supersedes it promptly.
  import('./characterImportanceService').then(({ scoreAndPersistCharacter }) =>
    scoreAndPersistCharacter(userId, characterId)
  ).catch((err) => {
    logger.debug({ err, characterId }, 'Failed to score importance for relational possessor');
  });

  await characterAuthorityService.registerCharacterAuthority(userId, characterId, cleanName, []);
  logger.info(
    { characterId, cleanName, placeholderCharacterId, relation },
    'Created relational possessor character from placeholder',
  );
  return characterId;
}

async function annotatePlaceholderWithPossessor(
  userId: string,
  placeholderCharacterId: string,
  possessorId: string,
  anchor: string,
  relation: string,
): Promise<void> {
  try {
    const { data } = await supabaseAdmin
      .from('characters')
      .select('metadata')
      .eq('id', placeholderCharacterId)
      .eq('user_id', userId)
      .maybeSingle();
    const metadata = {
      ...((data?.metadata as Record<string, unknown> | null) ?? {}),
      supports_anchor: anchor,
      supports_anchor_character_id: possessorId,
      relational_placeholder_relation: relation,
    };
    await supabaseAdmin
      .from('characters')
      .update({ metadata, updated_at: new Date().toISOString() })
      .eq('id', placeholderCharacterId)
      .eq('user_id', userId);
  } catch (err) {
    logger.debug({ err, placeholderCharacterId }, 'Failed to annotate placeholder with possessor');
  }
}

/**
 * Ensure the named anchor of a relational placeholder exists and is associated
 * with the placeholder card. Safe to call fire-and-forget after create/merge.
 */
export async function ensureRelationalPossessorAndLink(
  userId: string,
  placeholderName: string,
  placeholderCharacterId: string,
): Promise<EnsureRelationalPossessorResult> {
  const parsed = parseRelationalPlaceholder(placeholderName);
  if (!parsed) {
    return { possessorId: null, created: false, linked: false, skippedReason: 'not_relational_placeholder' };
  }

  const anchor = parsed.anchor.trim();
  const relation = parsed.relation;
  if (!anchor) {
    return { possessorId: null, created: false, linked: false, skippedReason: 'empty_anchor' };
  }
  if (normalizeNameKey(anchor) === normalizeNameKey(placeholderName)) {
    return { possessorId: null, created: false, linked: false, skippedReason: 'anchor_equals_placeholder' };
  }

  return characterRegistry.runExclusive(userId, async () => {
    const decision = await characterRegistry.classifyForCreation(userId, anchor, {
      sourceEntityType: 'person',
      allowShortAnchor: true,
    });

    let possessorId: string | null = null;
    let created = false;

    if (decision.action === 'merge') {
      possessorId = decision.characterId;
      await characterRegistry.mergeMention(userId, decision.characterId, decision.cleanName, {
        relational_possessor_of: placeholderCharacterId,
      });
    } else if (decision.action === 'create') {
      possessorId = await createPossessorCharacter(
        userId,
        decision.cleanName,
        relation,
        placeholderCharacterId,
      );
      created = Boolean(possessorId);
    } else if (decision.action === 'defer') {
      // Ambiguous anchor — do not invent a new card; leave a pending question.
      await characterRegistry.recordPendingQuestion(
        userId,
        decision.cleanName,
        decision.candidates,
        null,
        decision.rawName,
      );
      return {
        possessorId: null,
        created: false,
        linked: false,
        relation,
        anchor,
        skippedReason: 'anchor_deferred',
      };
    } else {
      return {
        possessorId: null,
        created: false,
        linked: false,
        relation,
        anchor,
        skippedReason: decision.reason,
      };
    }

    if (!possessorId || possessorId === placeholderCharacterId) {
      return {
        possessorId,
        created,
        linked: false,
        relation,
        anchor,
        skippedReason: 'no_possessor_id',
      };
    }

    const linkedCount = await characterConnectionService.recordCoMention(userId, [
      placeholderCharacterId,
      possessorId,
    ]);
    await annotatePlaceholderWithPossessor(
      userId,
      placeholderCharacterId,
      possessorId,
      anchor,
      relation,
    );

    return {
      possessorId,
      created,
      linked: linkedCount >= 0,
      relation,
      anchor,
    };
  });
}

/** Fire-and-forget wrapper used by character create paths. */
export function scheduleEnsureRelationalPossessor(
  userId: string,
  placeholderName: string,
  placeholderCharacterId: string,
): void {
  if (!placeholderCharacterId || !placeholderName?.trim()) return;
  if (!parseRelationalPlaceholder(placeholderName)) return;
  schedulePossessorEnsure(() =>
    ensureRelationalPossessorAndLink(userId, placeholderName, placeholderCharacterId),
  );
}
