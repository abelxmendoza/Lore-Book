/**
 * Restore missing Character Book entries from surviving evidence:
 * people_places, omega_entities, merge metadata (previous_names), and identity index.
 */

import { randomUUID } from 'node:crypto';

import { logger } from '../logger';
import { classifyEntity, isCharacterEligible, isUnknownEntity } from './entities/entityClassifier';
import { classifyMentionKind } from '../utils/entityMentionClassifier';
import { normalizeNameKey } from '../utils/nameNormalization';
import { assignCharacterAvatar } from './characterAvatarService';
import { characterAuthorityService } from './characterAuthorityService';
import { characterFoundationService } from './characterFoundationService';
import { characterIdentityIndexService } from './characterIdentityIndexService';
import { characterRegistry } from './characterRegistry';
import { selfCharacterService } from './selfCharacterService';
import { supabaseAdmin } from './supabaseClient';

export type CharacterRestoreReport = {
  beforeCount: number;
  afterCount: number;
  fromPeoplePlaces: number;
  fromOmegaEntities: number;
  fromMergeHistory: number;
  fromIdentityIndex: number;
  restoredNames: string[];
  skippedNames: string[];
};

type CharacterRow = {
  id: string;
  name: string;
  alias?: string[] | null;
  metadata?: Record<string, unknown> | null;
};

const NON_PERSON_NAME_PATTERNS = [
  /\b(club|metro|lounge|bar|cafe|restaurant|studio|warehouse|office|park|beach)\b/i,
  /^(the|a|an)\s+/i,
];

function cleanDisplayName(value: string): string {
  return value.trim().replace(/\s+/g, ' ').replace(/[.,;:!?]+$/, '');
}

function looksLikeNonPersonName(name: string): boolean {
  const normalized = normalizeNameKey(name);
  if (!normalized) return true;
  if (normalized.split(' ').length > 5) return true;
  if (classifyMentionKind(name).kind !== 'person') return true;
  return NON_PERSON_NAME_PATTERNS.some((pattern) => pattern.test(name));
}

function parseNameParts(fullName: string): { firstName: string; lastName: string | null } {
  const parts = cleanDisplayName(fullName).split(' ').filter(Boolean);
  return {
    firstName: parts[0] ?? fullName,
    lastName: parts.length > 1 ? parts.slice(1).join(' ') : null,
  };
}

async function getUserIdentityNames(userId: string): Promise<Set<string>> {
  const names = new Set<string>();
  try {
    const { data } = await supabaseAdmin.auth.admin.getUserById(userId);
    const fullName = String(data.user?.user_metadata?.full_name ?? data.user?.user_metadata?.name ?? '').trim();
    if (fullName) {
      names.add(normalizeNameKey(fullName));
      fullName.split(/\s+/).forEach((part) => {
        if (part.length > 1) names.add(normalizeNameKey(part));
      });
    }
  } catch {
    /* non-blocking */
  }
  return names;
}

function isReservedSelfName(name: string): boolean {
  return /^(me|myself|self|you)$/i.test(name.trim());
}

function buildKnownNameKeys(characters: CharacterRow[]): Set<string> {
  const keys = new Set<string>();
  for (const character of characters) {
    if (character.name) keys.add(normalizeNameKey(character.name));
    for (const alias of character.alias ?? []) {
      if (alias?.trim()) keys.add(normalizeNameKey(alias));
    }
    const metadata = character.metadata ?? {};
    for (const alias of (metadata.aliases_learned_from_merges as string[] | undefined) ?? []) {
      if (alias?.trim()) keys.add(normalizeNameKey(alias));
    }
    for (const previous of (metadata.previous_names as string[] | undefined) ?? []) {
      if (previous?.trim()) keys.add(normalizeNameKey(previous));
    }
  }
  return keys;
}

function collectMergeRestoreNames(characters: CharacterRow[]): string[] {
  const names = new Set<string>();

  for (const character of characters) {
    const metadata = character.metadata ?? {};

    for (const value of (metadata.previous_names as string[] | undefined) ?? []) {
      if (value?.trim()) names.add(cleanDisplayName(value));
    }
    for (const value of (metadata.aliases_learned_from_merges as string[] | undefined) ?? []) {
      if (value?.trim()) names.add(cleanDisplayName(value));
    }
    for (const value of character.alias ?? []) {
      if (value?.trim()) names.add(cleanDisplayName(value));
    }

    if (character.name?.includes(' / ')) {
      for (const part of character.name.split(' / ')) {
        if (part.trim()) names.add(cleanDisplayName(part));
      }
    }

    const officialName = metadata.official_name;
    if (typeof officialName === 'string' && officialName.trim()) {
      names.add(cleanDisplayName(officialName));
    }
  }

  return Array.from(names);
}

class CharacterRestoreService {
  private async loadCharacters(userId: string): Promise<CharacterRow[]> {
    const { data, error } = await supabaseAdmin
      .from('characters')
      .select('id, name, alias, metadata')
      .eq('user_id', userId);
    if (error) throw error;
    return (data ?? []) as CharacterRow[];
  }

  private async createCharacterFromName(
    userId: string,
    rawName: string,
    source: 'merge_history' | 'identity_index',
    identityNames: Set<string>
  ): Promise<string | null> {
    const name = cleanDisplayName(rawName);
    if (!name || looksLikeNonPersonName(name)) return null;
    if (isReservedSelfName(name)) return null;
    if (identityNames.has(normalizeNameKey(name))) return null;

    const classification = classifyEntity(name);
    if (!isCharacterEligible(classification.type) && !isUnknownEntity(classification.type)) {
      return null;
    }

    const decision = await characterRegistry.classifyForCreation(userId, name);
    if (decision.action === 'reject') return null;
    if (decision.action === 'merge') return decision.characterId;

    const cleanName = decision.cleanName;
    if (!cleanName || looksLikeNonPersonName(cleanName)) return null;
    const characterId = randomUUID();
    const { firstName, lastName } = parseNameParts(cleanName);
    const avatarUrl = await assignCharacterAvatar(characterId);

    const { error } = await supabaseAdmin.from('characters').insert({
      id: characterId,
      user_id: userId,
      name: cleanName,
      alias: null,
      status: 'active',
      tags: [],
      first_name: firstName,
      last_name: lastName,
      importance_level: 'supporting',
      relationship_depth: 'mentioned_only',
      avatar_url: avatarUrl,
      metadata: {
        mention_count: 1,
        restored_at: new Date().toISOString(),
        restored_from: source,
        generated_by: 'character_restore',
      },
    });

    if (error) {
      logger.debug({ error, userId, name: cleanName }, 'character restore insert failed');
      return null;
    }

    await characterAuthorityService.registerCharacterAuthority(userId, characterId, cleanName, []);
    identityNames.add(normalizeNameKey(cleanName));
    return characterId;
  }

  async restoreAllCharacters(userId: string): Promise<CharacterRestoreReport> {
    await selfCharacterService.repairSelfCharacterIdentity(userId);

    const before = await this.loadCharacters(userId);
    const report: CharacterRestoreReport = {
      beforeCount: before.length,
      afterCount: before.length,
      fromPeoplePlaces: 0,
      fromOmegaEntities: 0,
      fromMergeHistory: 0,
      fromIdentityIndex: 0,
      restoredNames: [],
      skippedNames: [],
    };

    const foundationStats = await characterFoundationService.generateAllCharacters(userId);
    report.fromPeoplePlaces = foundationStats.created;

    const { data: omegaEntities } = await supabaseAdmin
      .from('omega_entities')
      .select('id, primary_name, type, aliases, mention_count')
      .eq('user_id', userId)
      .in('type', ['PERSON', 'CHARACTER']);

    for (const entity of omegaEntities ?? []) {
      const beforeIds = new Set((await this.loadCharacters(userId)).map((row) => row.id));
      const id = await characterFoundationService.promoteOmegaEntityToCharacter(userId, {
        id: entity.id,
        primary_name: entity.primary_name,
        type: entity.type,
        aliases: entity.aliases,
        mention_count: entity.mention_count ?? 1,
      }, null, { forcePromote: true });
      if (!id) continue;
      if (!beforeIds.has(id)) {
        report.fromOmegaEntities += 1;
        report.restoredNames.push(entity.primary_name);
      }
    }

    let characters = await this.loadCharacters(userId);
    const identityNames = await getUserIdentityNames(userId);
    const knownKeys = buildKnownNameKeys(characters);
    const mergeCandidates = collectMergeRestoreNames(characters);

    for (const candidate of mergeCandidates) {
      const key = normalizeNameKey(candidate);
      if (!key || knownKeys.has(key) || identityNames.has(key)) {
        report.skippedNames.push(candidate);
        continue;
      }
      const createdId = await this.createCharacterFromName(userId, candidate, 'merge_history', identityNames);
      if (createdId) {
        report.fromMergeHistory += 1;
        report.restoredNames.push(candidate);
        knownKeys.add(key);
      } else {
        report.skippedNames.push(candidate);
      }
    }

    characters = await this.loadCharacters(userId);
    const { data: indexRows } = await supabaseAdmin
      .from('character_identity_index')
      .select('mention, character_id')
      .eq('user_id', userId)
      .limit(500);

    const liveIds = new Set(characters.map((row) => row.id));
    for (const row of indexRows ?? []) {
      const mention = String(row.mention ?? '').trim();
      const key = normalizeNameKey(mention);
      if (!mention || !key || knownKeys.has(key) || identityNames.has(key)) continue;
      if (row.character_id && liveIds.has(row.character_id)) continue;

      const createdId = await this.createCharacterFromName(userId, mention, 'identity_index', identityNames);
      if (createdId) {
        report.fromIdentityIndex += 1;
        report.restoredNames.push(mention);
        knownKeys.add(key);
      }
    }

    await characterIdentityIndexService.rebuild(userId);
    await characterAuthorityService.seedAuthorityLinks(userId);

    const after = await this.loadCharacters(userId);
    report.afterCount = after.length;
    report.restoredNames = [...new Set(report.restoredNames)].sort((a, b) => a.localeCompare(b));
    report.skippedNames = [...new Set(report.skippedNames)].sort((a, b) => a.localeCompare(b));

    logger.info({ userId, report }, 'Character book restore completed');
    return report;
  }
}

export const characterRestoreService = new CharacterRestoreService();
