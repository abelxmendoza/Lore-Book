/**
 * Persistence layer for character display titles (characters.metadata).
 */

import { randomUUID } from 'crypto';
import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';
import { identityLedgerService } from './identityLedgerService';
import {
  aliasesFromProminenceMap,
  mergeAliasIntoList,
  recordAliasUsage,
  suggestAliasTitlePromotion,
  type AliasProminenceMap,
} from './aliasProminenceService';
import {
  applyNamedPersonMergeProposal,
  applyTitleUpdate,
  buildSuggestedUpdateFromInference,
  lockCharacterTitle,
  proposeMergeContextualWithNamedPerson,
} from './characterTitleStabilityService';
import {
  buildDisplayTitleFromMention,
  buildDisplayTitleFromName,
} from './dynamicCharacterTitleService';
import type {
  CharacterAliasType,
  CharacterDisplayTitle,
} from './personDisplayTitleTypes';
import {
  METADATA_ALIAS_PROMINENCE_KEY as ALIAS_KEY,
  METADATA_CHARACTER_SUBTITLE_KEY as SUBTITLE_KEY,
  METADATA_DISPLAY_TITLE_KEY as TITLE_KEY,
} from './personDisplayTitleTypes';

type CharacterRow = {
  id: string;
  user_id: string;
  name: string;
  alias: string[] | null;
  metadata: Record<string, unknown> | null;
};

function readMetadata(row: CharacterRow) {
  return (row.metadata ?? {}) as Record<string, unknown>;
}

export function displayTitleFromRow(row: CharacterRow): CharacterDisplayTitle {
  const meta = readMetadata(row);
  const stored = meta[TITLE_KEY] as CharacterDisplayTitle | undefined;
  const prominence = (meta[ALIAS_KEY] ?? {}) as AliasProminenceMap;

  if (stored?.primaryTitle) {
    return {
      ...stored,
      characterId: row.id,
      aliases: stored.aliases?.length
        ? stored.aliases
        : aliasesFromProminenceMap(prominence, stored.primaryTitle),
    };
  }

  const built = buildDisplayTitleFromName(row.id, row.name, { stability: 'stable' });
  return {
    ...built.displayTitle,
    aliases: (row.alias ?? []).map((value) => ({
      id: randomUUID(),
      value,
      aliasType: 'nickname' as CharacterAliasType,
      prominenceScore: 0,
      evidenceCount: 0,
    })),
  };
}

async function loadCharacter(userId: string, characterId: string): Promise<CharacterRow | null> {
  const { data, error } = await supabaseAdmin
    .from('characters')
    .select('id, user_id, name, alias, metadata')
    .eq('id', characterId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    logger.warn({ err: error, userId, characterId }, 'characterTitle: load failed');
    return null;
  }
  return data as CharacterRow | null;
}

async function persistTitleState(
  userId: string,
  row: CharacterRow,
  displayTitle: CharacterDisplayTitle,
  extras: { subtitle?: string; prominence?: AliasProminenceMap; syncName?: boolean } = {}
): Promise<CharacterRow> {
  const meta = readMetadata(row);
  const nextMeta: Record<string, unknown> = {
    ...meta,
    [TITLE_KEY]: displayTitle,
  };
  if (extras.subtitle !== undefined) nextMeta[SUBTITLE_KEY] = extras.subtitle;
  if (extras.prominence) nextMeta[ALIAS_KEY] = extras.prominence;

  const patch: Record<string, unknown> = {
    metadata: nextMeta,
    updated_at: new Date().toISOString(),
  };

  if (extras.syncName && displayTitle.primaryTitle.trim()) {
    patch.name = displayTitle.primaryTitle.trim();
  }

  const aliasValues = displayTitle.aliases.map((a) => a.value).filter(Boolean);
  if (aliasValues.length > 0) patch.alias = aliasValues;

  const { data, error } = await supabaseAdmin
    .from('characters')
    .update(patch)
    .eq('id', row.id)
    .eq('user_id', userId)
    .select('id, user_id, name, alias, metadata')
    .single();

  if (error) throw error;
  return data as CharacterRow;
}

export const characterTitleService = {
  async getTitle(userId: string, characterId: string) {
    const row = await loadCharacter(userId, characterId);
    if (!row) return null;
    const meta = readMetadata(row);
    return {
      displayTitle: displayTitleFromRow(row),
      characterSubtitle: typeof meta[SUBTITLE_KEY] === 'string' ? meta[SUBTITLE_KEY] : undefined,
    };
  },

  async patchTitle(
    userId: string,
    characterId: string,
    input: {
      primaryTitle: string;
      characterSubtitle?: string;
      stability?: CharacterDisplayTitle['stability'];
      userConfirmed?: boolean;
    }
  ) {
    const row = await loadCharacter(userId, characterId);
    if (!row) return null;

    const current = displayTitleFromRow(row);
    const built = buildDisplayTitleFromName(characterId, input.primaryTitle, {
      stability: input.stability ?? 'stable',
    });
    if (built.rejected) {
      throw new Error('Cannot set bare title without context');
    }

    const result = applyTitleUpdate({
      current,
      proposal: {
        proposedPrimaryTitle: built.displayTitle.primaryTitle,
        proposedTitleType: built.displayTitle.titleType,
        proposedParts: built.displayTitle.titleParts,
        reason: 'user_edit',
        stability: input.stability ?? 'stable',
        preservePreviousAsAlias: true,
      },
      userConfirmed: input.userConfirmed ?? true,
      force: true,
    });

    await identityLedgerService.recordMutation({
      userId,
      entityId: characterId,
      entityType: 'character',
      mutationType: 'ENTITY_UPDATED',
      previousValue: { primaryTitle: current.primaryTitle },
      newValue: { primaryTitle: result.displayTitle.primaryTitle },
      reason: 'character_title_user_edit',
      source: 'USER',
    });

    const updated = await persistTitleState(userId, row, result.displayTitle, {
      subtitle: input.characterSubtitle,
      syncName: true,
    });

    return {
      displayTitle: displayTitleFromRow(updated),
      characterSubtitle: input.characterSubtitle,
      applied: result.applied,
    };
  },

  async addAlias(
    userId: string,
    characterId: string,
    input: { value: string; aliasType: CharacterAliasType }
  ) {
    const row = await loadCharacter(userId, characterId);
    if (!row) return null;

    const current = displayTitleFromRow(row);
    const meta = readMetadata(row);
    const prominence = (meta[ALIAS_KEY] ?? {}) as AliasProminenceMap;
    const nextProminence = recordAliasUsage(prominence, input.value, input.aliasType);
    const nextTitle = {
      ...current,
      aliases: mergeAliasIntoList(current.aliases, input.value, input.aliasType),
    };

    await identityLedgerService.recordMutation({
      userId,
      entityId: characterId,
      entityType: 'character',
      mutationType: 'ALIAS_ADDED',
      newValue: { alias: input.value, aliasType: input.aliasType },
      source: 'USER',
    });

    const updated = await persistTitleState(userId, row, nextTitle, { prominence: nextProminence });
    return displayTitleFromRow(updated);
  },

  async promoteAlias(userId: string, characterId: string, aliasId: string) {
    const row = await loadCharacter(userId, characterId);
    if (!row) return null;

    const current = displayTitleFromRow(row);
    const alias = current.aliases.find((a) => a.id === aliasId || a.value.toLowerCase() === aliasId.toLowerCase());
    if (!alias) throw new Error('Alias not found');

    const result = applyTitleUpdate({
      current,
      proposal: {
        proposedPrimaryTitle: alias.value,
        proposedTitleType:
          alias.aliasType === 'stage_name' ? 'stage_name' : alias.aliasType === 'nickname' ? 'nickname' : current.titleType,
        proposedParts: { ...current.titleParts, nickname: alias.value },
        reason: 'user_promoted_alias',
        stability: 'stable',
        preservePreviousAsAlias: true,
      },
      userConfirmed: true,
      force: true,
    });

    const updated = await persistTitleState(userId, row, result.displayTitle, { syncName: true });
    return displayTitleFromRow(updated);
  },

  async lockTitle(userId: string, characterId: string) {
    const row = await loadCharacter(userId, characterId);
    if (!row) return null;
    const locked = lockCharacterTitle(displayTitleFromRow(row));
    const updated = await persistTitleState(userId, row, locked);
    return displayTitleFromRow(updated);
  },

  async suggestTitleUpdate(userId: string, characterId: string) {
    const row = await loadCharacter(userId, characterId);
    if (!row) return null;

    const current = displayTitleFromRow(row);
    const meta = readMetadata(row);
    const prominence = (meta[ALIAS_KEY] ?? {}) as AliasProminenceMap;
    const suggestion = suggestAliasTitlePromotion(current, prominence);
    if (!suggestion) return { suggestion: null, displayTitle: current };

    return { suggestion, displayTitle: { ...current, stability: 'suggested_update' as const } };
  },

  async resolveReference(
    userId: string,
    characterId: string,
    input: {
      namedPerson?: string;
      preferContextualPrimary?: boolean;
      subtitle?: string;
      userConfirmed?: boolean;
    }
  ) {
    const row = await loadCharacter(userId, characterId);
    if (!row) return null;

    const current = displayTitleFromRow(row);
    if (!input.namedPerson?.trim()) {
      return { displayTitle: current, applied: false, reason: 'named_person_required' };
    }

    const proposal = proposeMergeContextualWithNamedPerson(current, input.namedPerson.trim(), {
      preferContextualPrimary: input.preferContextualPrimary,
      subtitle: input.subtitle,
    });

    const result = applyNamedPersonMergeProposal(current, proposal, input.userConfirmed ?? false);
    if (!result.applied) {
      return { displayTitle: result.displayTitle, applied: false, proposal, reason: result.reason };
    }

    const updated = await persistTitleState(userId, row, result.displayTitle, {
      subtitle: input.subtitle,
      syncName: true,
    });

    return {
      displayTitle: displayTitleFromRow(updated),
      applied: true,
      proposal,
    };
  },

  async inferTitleFromMention(
    userId: string,
    characterId: string,
    mention: { text: string; rolePhrase?: string; messageId?: string }
  ) {
    const row = await loadCharacter(userId, characterId);
    if (!row) return null;

    const current = displayTitleFromRow(row);
    const built = buildDisplayTitleFromMention(characterId, mention);
    if (built.rejected) return { rejected: true, reason: built.rejectionReason };

    const suggestion = buildSuggestedUpdateFromInference(current, built.displayTitle.primaryTitle);
    if (!suggestion) return { displayTitle: current, applied: false };

    const result = applyTitleUpdate({ current, proposal: suggestion, userConfirmed: false });
    if (result.applied) {
      const updated = await persistTitleState(userId, row, result.displayTitle, {
        subtitle: built.characterSubtitle,
      });
      return { displayTitle: displayTitleFromRow(updated), applied: true, suggestion };
    }

    return { displayTitle: result.displayTitle, applied: false, suggestion };
  },
};

export type CharacterTitleService = typeof characterTitleService;
