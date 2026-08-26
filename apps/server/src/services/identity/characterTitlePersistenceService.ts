/**
 * Persistence layer for character display titles (characters.metadata).
 */

import { logger } from '../../logger';

import { supabaseAdmin } from '../supabaseClient';
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
import { identityLedgerService } from './identityLedgerService';
import {
  METADATA_ALIAS_PROMINENCE_KEY as ALIAS_KEY,
  METADATA_CHARACTER_SUBTITLE_KEY as SUBTITLE_KEY,
  METADATA_DISPLAY_TITLE_KEY as TITLE_KEY,
  type CharacterAlias,
  type CharacterAliasType,
  type CharacterDisplayTitle,
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

function aliasRecord(value: string, aliasType: CharacterAliasType = 'nickname'): CharacterAlias {
  return {
    id: `legacy-${value.trim().toLowerCase().replace(/\s+/g, '-')}`,
    value,
    aliasType,
    prominenceScore: 0,
    evidenceCount: 0,
  };
}

/** Union metadata aliases with the characters.alias column so adds never wipe known nicknames. */
function coalesceAliases(
  primaryTitle: string,
  storedAliases: CharacterAlias[] | undefined,
  prominence: AliasProminenceMap,
  rowAliases: string[] | null | undefined,
): CharacterAlias[] {
  const fromStored = storedAliases?.length
    ? storedAliases
    : aliasesFromProminenceMap(prominence, primaryTitle);
  const byKey = new Map<string, CharacterAlias>();
  const primaryKey = primaryTitle.trim().toLowerCase();
  for (const alias of fromStored) {
    const key = alias.value.trim().toLowerCase();
    if (key && key !== primaryKey) byKey.set(key, alias);
  }
  for (const value of rowAliases ?? []) {
    const trimmed = value.trim();
    const key = trimmed.toLowerCase();
    if (!key || key === primaryKey || byKey.has(key)) continue;
    byKey.set(key, aliasRecord(trimmed));
  }
  return [...byKey.values()];
}

export function displayTitleFromRow(row: CharacterRow): CharacterDisplayTitle {
  const meta = readMetadata(row);
  const stored = meta[TITLE_KEY] as CharacterDisplayTitle | undefined;
  const prominence = (meta[ALIAS_KEY] ?? {}) as AliasProminenceMap;

  if (stored?.primaryTitle) {
    return {
      ...stored,
      characterId: row.id,
      aliases: coalesceAliases(
        stored.primaryTitle,
        stored.aliases,
        prominence,
        row.alias,
      ),
    };
  }

  const built = buildDisplayTitleFromName(row.id, row.name, { stability: 'stable' });
  return {
    ...built.displayTitle,
    aliases: coalesceAliases(
      built.displayTitle.primaryTitle,
      undefined,
      prominence,
      row.alias,
    ),
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

  // Keep characters.alias in lockstep with the title alias list (source of truth
  // after displayTitleFromRow coalesces column + metadata).
  patch.alias = displayTitle.aliases.map((a) => a.value.trim()).filter(Boolean);

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
    const trimmed = input.primaryTitle.trim();
    const userConfirmed = input.userConfirmed ?? true;
    const built = buildDisplayTitleFromName(characterId, trimmed, {
      stability: input.stability ?? 'stable',
    });

    // User edits on the card must always stick — including kinship-only labels
    // like "Tía Maribel" that inference would reject as bare titles.
    if (built.rejected && !userConfirmed) {
      throw new Error('Cannot set bare title without context');
    }

    const proposedPrimary = userConfirmed ? trimmed : built.displayTitle.primaryTitle;
    const proposedType = built.rejected
      ? built.displayTitle.titleType
      : built.displayTitle.titleType;
    const proposedParts = built.rejected ? {} : built.displayTitle.titleParts;

    const result = applyTitleUpdate({
      current,
      proposal: {
        proposedPrimaryTitle: proposedPrimary,
        proposedTitleType: proposedType,
        proposedParts,
        reason: 'user_edit',
        stability: input.stability ?? 'stable',
        preservePreviousAsAlias: true,
      },
      userConfirmed,
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

    const aliasValue = input.value.trim().replace(/\s+/g, ' ');
    if (!aliasValue) throw new Error('Alias cannot be empty');

    const primaryKey = (row.name || '').trim().toLowerCase();
    if (aliasValue.toLowerCase() === primaryKey) {
      throw new Error('Alias cannot match the character\'s primary name');
    }

    const current = displayTitleFromRow(row);
    const meta = readMetadata(row);
    const prominence = (meta[ALIAS_KEY] ?? {}) as AliasProminenceMap;
    const nextProminence = recordAliasUsage(prominence, aliasValue, input.aliasType);
    const nextTitle = {
      ...current,
      aliases: mergeAliasIntoList(current.aliases, aliasValue, input.aliasType),
    };

    // Persist first so a ledger hiccup never blocks alias writes.
    const updated = await persistTitleState(userId, row, nextTitle, { prominence: nextProminence });

    void identityLedgerService.recordMutation({
      userId,
      entityId: characterId,
      entityType: 'character',
      mutationType: 'ALIAS_ADDED',
      newValue: { alias: aliasValue, aliasType: input.aliasType },
      source: 'USER',
    });

    return displayTitleFromRow(updated);
  },

  async removeAlias(userId: string, characterId: string, aliasId: string) {
    const row = await loadCharacter(userId, characterId);
    if (!row) return null;

    const current = displayTitleFromRow(row);
    const needle = aliasId.trim().toLowerCase();
    const alias = current.aliases.find(
      (a) => a.id.toLowerCase() === needle || a.value.trim().toLowerCase() === needle,
    );
    if (!alias) throw new Error('Alias not found');

    const nextAliases = current.aliases.filter(
      (a) => a.value.trim().toLowerCase() !== alias.value.trim().toLowerCase(),
    );
    const titleUsesAlias = current.primaryTitle
      .toLowerCase()
      .includes(alias.value.trim().toLowerCase());
    let nextTitle: CharacterDisplayTitle = { ...current, aliases: nextAliases };
    if (titleUsesAlias && current.stability !== 'locked') {
      const rebuilt = buildDisplayTitleFromName(characterId, row.name, { stability: 'stable' });
      nextTitle = {
        ...(rebuilt.rejected ? current : rebuilt.displayTitle),
        primaryTitle: rebuilt.rejected ? row.name : rebuilt.displayTitle.primaryTitle,
        aliases: nextAliases,
        stability: 'stable',
      };
    }

    const meta = readMetadata(row);
    const prominence = { ...((meta[ALIAS_KEY] ?? {}) as AliasProminenceMap) };
    const aliasKey = alias.value.trim().toLowerCase();
    for (const key of Object.keys(prominence)) {
      if (key.toLowerCase() === aliasKey || prominence[key]?.value?.trim().toLowerCase() === aliasKey) {
        delete prominence[key];
      }
    }

    const updated = await persistTitleState(userId, row, nextTitle, { prominence });

    void identityLedgerService.recordMutation({
      userId,
      entityId: characterId,
      entityType: 'character',
      mutationType: 'ALIAS_REMOVED',
      previousValue: { alias: alias.value },
      source: 'USER',
    });

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
