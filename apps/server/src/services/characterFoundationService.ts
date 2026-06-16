/**
 * Character Foundation Service — Sprint C
 *
 * Canonical Person Entity → Character Record
 *
 * Pipeline:
 *   people_places (type='person')
 *   → promoteEntityToCharacter()
 *   → characters (one per entity, stable forever)
 *   → character_memories (evidence chain: character → journal_entry)
 *
 * Deduplication: characters are keyed on metadata.source_entity_id.
 * One entity = one character, always. source_entity_id in metadata is the
 * authoritative dedup key — no fuzzy name matching in the foundation pipeline.
 */

import { v4 as uuid } from 'uuid';
import { logger } from '../logger';
import { splitPersonName } from '../utils/nameNormalization';
import { shouldDeferCharacterPromotion } from '../utils/entityMentionClassifier';
import { classifyEntity, isCharacterEligible, isUnknownEntity } from './entities/entityClassifier';
import { characterRegistry } from './characterRegistry';
import { assignCharacterAvatar } from './characterAvatarService';
import { supabaseAdmin } from './supabaseClient';
import type { PeoplePlaceEntity } from '../types';

function parseNameParts(fullName: string): { firstName: string; lastName: string } {
  const parts = splitPersonName(fullName);
  return { firstName: parts.firstName, lastName: parts.lastName ?? '' };
}

type CharacterRow = {
  id: string;
  user_id: string;
  name: string;
  alias: string[] | null;
  status: string;
  first_appearance: string | null;
  metadata: Record<string, unknown>;
  tags: string[];
  avatar_url?: string | null;
  created_at?: string;
  updated_at?: string;
};

type CharacterMemoryRow = {
  id: string;
  user_id: string;
  character_id: string;
  journal_entry_id: string;
  role: string;
  metadata: Record<string, unknown>;
};

class CharacterFoundationService {
  // Cache user identity names per userId to avoid repeated auth lookups
  private readonly _identityCache = new Map<string, string[]>();

  private async getUserIdentityNames(userId: string): Promise<string[]> {
    if (this._identityCache.has(userId)) return this._identityCache.get(userId)!;
    try {
      const { data } = await supabaseAdmin.auth.admin.getUserById(userId);
      const meta = data.user?.user_metadata ?? {};
      const fullName = String(meta.full_name ?? meta.name ?? '').trim();
      if (!fullName) {
        this._identityCache.set(userId, []);
        return [];
      }
      const names = new Set<string>();
      names.add(fullName.toLowerCase());
      fullName.split(/\s+/).filter(p => p.length > 1).forEach(p => names.add(p.toLowerCase()));
      const result = Array.from(names);
      this._identityCache.set(userId, result);
      return result;
    } catch {
      return [];
    }
  }

  private async isSelfEntity(userId: string, name: string): Promise<boolean> {
    const userNames = await this.getUserIdentityNames(userId);
    if (userNames.length === 0) return false;
    const n = name.toLowerCase().trim();
    return userNames.some(self =>
      n === self ||
      // "Abel" matches "Abel Mendoza" — block single-name self-references too
      (!self.includes(' ') && (n === self || n.startsWith(self + ' ') || n.endsWith(' ' + self)))
    );
  }

  /**
   * Promote a canonical person entity to a character record.
   * Idempotent: safe to call multiple times for the same entity.
   * Returns the character id.
   */
  async promoteEntityToCharacter(
    userId: string,
    entity: PeoplePlaceEntity,
    threadId: string | null = null
  ): Promise<string | null> {
    if (entity.type !== 'person') {
      logger.debug({ entityName: entity.name, type: entity.type }, 'Skipping non-person entity');
      return null;
    }

    const classification = classifyEntity(entity.name);
    if (!isCharacterEligible(classification.type) && !isUnknownEntity(classification.type)) {
      logger.debug({ entityName: entity.name, classification }, 'Skipping entity that is not character-eligible');
      return null;
    }

    // The user is the narrator/main character — never add them to their own book
    if (await this.isSelfEntity(userId, entity.name)) {
      logger.debug({ name: entity.name }, 'Skipping self-entity: user is the narrator');
      return null;
    }

    return characterRegistry.runExclusive(userId, async () => {
    // ── 1. Dedup check: look up by source_entity_id (primary key) ───────────
    const { data: existingByEntityId } = await supabaseAdmin
      .from('characters')
      .select('id, name, alias, metadata')
      .eq('user_id', userId)
      .eq('metadata->>source_entity_id', entity.id)
      .limit(1);

    if (existingByEntityId?.[0]) {
      const existing = existingByEntityId[0] as CharacterRow;
      await this.updateCharacter(existing, entity);
      logger.debug({ characterId: existing.id, name: entity.name }, 'Updated existing character');
      return existing.id;
    }

    const mentions = entity.total_mentions ?? entity.related_entries?.length ?? 1;
    if (shouldDeferCharacterPromotion(entity.name, mentions)) {
      logger.debug({ name: entity.name, mentions }, 'Deferring entity to promotion candidate (not auto-creating character)');
      return null;
    }

    // ── 3. Create new character ──────────────────────────────────────────────
    // NOTE: Fuzzy name matching (findSimilarCharacter) is intentionally NOT
    // used here. The source_entity_id is the authoritative dedup key for the
    // foundation pipeline. Jaro-Winkler matching causes cross-person merges
    // (e.g. "Abuela" matches "Abel Mendoza" on the "Abe" prefix). Fuzzy
    // matching is reserved for future character reconciliation workflows.
    // Registry choke point: cross-pipeline dedup, junk gate, gray-zone defer.
    // This is what stops "Kelly who's handling onboarding" from becoming a
    // second Kelly card when the omega pipeline already created "Kelly".
    const decision = await characterRegistry.classifyForCreation(userId, entity.name);
    if (decision.action === 'reject') {
      logger.debug({ name: entity.name, reason: decision.reason }, 'Registry rejected character creation (foundation)');
      return null;
    }
    if (decision.action === 'merge') {
      await characterRegistry.mergeMention(userId, decision.characterId, decision.cleanName, { source_entity_id: entity.id });
      logger.info({ mention: entity.name, mergedInto: decision.matchedName }, 'Registry merged foundation mention into existing character');
      return decision.characterId;
    }
    if (decision.action === 'defer') {
      await characterRegistry.recordPendingQuestion(userId, decision.cleanName, decision.candidates, threadId ?? null, decision.rawName);
      return null;
    }
    const cleanedName = decision.cleanName;

    const characterId = uuid();
    const aliases = Array.from(new Set(entity.corrected_names ?? [])).filter(
      a => a.toLowerCase() !== cleanedName.toLowerCase()
    );

    const firstAppearance = entity.first_mentioned_at
      ? new Date(entity.first_mentioned_at).toISOString().split('T')[0]
      : null;

    const { firstName, lastName } = parseNameParts(cleanedName);
    const avatarUrl = await assignCharacterAvatar(characterId, { archetype: entity.type === 'person' ? 'human' : null });
    const character: CharacterRow = {
      id: characterId,
      user_id: userId,
      name: cleanedName,
      alias: aliases.length > 0 ? aliases : null,
      status: 'active',
      first_appearance: firstAppearance,
      tags: [],
      avatar_url: avatarUrl,
      metadata: {
        source_entity_id: entity.id,
        mention_count: entity.total_mentions,
        source_memory_count: entity.related_entries?.length ?? 0,
        source_entry_ids: entity.related_entries ?? [],
        generated_by: 'character_foundation',
        generated_at: new Date().toISOString(),
        first_name: firstName || undefined,
        last_name: lastName || undefined,
      },
    };

    const { error } = await supabaseAdmin.from('characters').insert(character);
    if (error) {
      logger.error({ error, name: entity.name }, 'Failed to create character');
      return null;
    }

    logger.info({ characterId, name: entity.name, aliases }, 'Created new character');
    return characterId;
    });
  }

  /**
   * Update an existing character with the latest entity data.
   */
  private async updateCharacter(
    existing: CharacterRow,
    entity: PeoplePlaceEntity
  ): Promise<void> {
    const mergedAliases = Array.from(new Set([
      ...(existing.alias ?? []),
      ...(entity.corrected_names ?? []),
    ])).filter(a => a.toLowerCase() !== existing.name.toLowerCase());

    const firstAppearance = entity.first_mentioned_at
      ? new Date(entity.first_mentioned_at).toISOString().split('T')[0]
      : existing.first_appearance;

    await supabaseAdmin
      .from('characters')
      .update({
        alias: mergedAliases.length > 0 ? mergedAliases : null,
        first_appearance: firstAppearance,
        updated_at: new Date().toISOString(),
        ...(existing.avatar_url ? {} : { avatar_url: await assignCharacterAvatar(existing.id) }),
        metadata: {
          ...(existing.metadata ?? {}),
          source_entity_id: entity.id,
          mention_count: entity.total_mentions,
          source_memory_count: entity.related_entries?.length ?? 0,
          source_entry_ids: entity.related_entries ?? [],
          last_refreshed_at: new Date().toISOString(),
        },
      })
      .eq('id', existing.id);
  }

  /**
   * Link a character to all journal entries that mention them.
   * Idempotent — skips existing (character_id, journal_entry_id) pairs.
   */
  async linkCharacterToMemories(
    userId: string,
    characterId: string,
    entryIds: string[]
  ): Promise<number> {
    if (!entryIds.length) return 0;

    // Fetch existing links to avoid duplicates
    const { data: existing } = await supabaseAdmin
      .from('character_memories')
      .select('journal_entry_id')
      .eq('character_id', characterId)
      .eq('user_id', userId);

    const alreadyLinked = new Set((existing ?? []).map((r: any) => r.journal_entry_id));
    const toLink = entryIds.filter(id => !alreadyLinked.has(id));

    if (!toLink.length) return 0;

    const rows: CharacterMemoryRow[] = toLink.map(entryId => ({
      id: uuid(),
      user_id: userId,
      character_id: characterId,
      journal_entry_id: entryId,
      role: 'mentioned',
      metadata: { source: 'character_foundation' },
    }));

    const { error } = await supabaseAdmin.from('character_memories').insert(rows);
    if (error) {
      logger.error({ error, characterId }, 'Failed to link character to memories');
      return 0;
    }

    return toLink.length;
  }

  /**
   * Promote ALL person entities for a user to characters.
   * Creates characters and evidence links in one pass.
   * Returns stats for reporting.
   */
  async generateAllCharacters(userId: string): Promise<{
    created: number;
    updated: number;
    skipped: number;
    memoriesLinked: number;
  }> {
    const stats = { created: 0, updated: 0, skipped: 0, memoriesLinked: 0 };

    const { data: entities, error } = await supabaseAdmin
      .from('people_places')
      .select('*')
      .eq('user_id', userId)
      .eq('type', 'person')
      .order('total_mentions', { ascending: false });

    if (error) {
      logger.error({ error, userId }, 'Failed to fetch person entities');
      return stats;
    }

    const personEntities = (entities ?? []) as PeoplePlaceEntity[];
    logger.info({ userId, count: personEntities.length }, 'Promoting person entities to characters');

    for (const entity of personEntities) {
      const wasNew = !(await this.characterExistsForEntity(userId, entity.id));
      const characterId = await this.promoteEntityToCharacter(userId, entity);

      if (!characterId) {
        stats.skipped++;
        continue;
      }

      if (wasNew) {
        stats.created++;
      } else {
        stats.updated++;
      }

      const linked = await this.linkCharacterToMemories(
        userId,
        characterId,
        entity.related_entries ?? []
      );
      stats.memoriesLinked += linked;
    }

    return stats;
  }

  private async characterExistsForEntity(userId: string, entityId: string): Promise<boolean> {
    const { data } = await supabaseAdmin
      .from('characters')
      .select('id')
      .eq('user_id', userId)
      .eq('metadata->>source_entity_id', entityId)
      .limit(1);
    return Boolean(data?.length);
  }

  /**
   * Fetch characters with their evidence chain for a user.
   */
  async listCharactersWithEvidence(userId: string): Promise<Array<{
    id: string;
    name: string;
    aliases: string[];
    firstSeen: string | null;
    mentionCount: number;
    memoryCount: number;
    sourceEntityId: string | null;
    entryIds: string[];
  }>> {
    const { data, error } = await supabaseAdmin
      .from('characters')
      .select('id, name, alias, first_appearance, metadata')
      .eq('user_id', userId)
      .order('created_at', { ascending: true });

    if (error) {
      logger.error({ error }, 'Failed to list characters');
      return [];
    }

    return (data ?? []).map((row: any) => ({
      id: row.id,
      name: row.name,
      aliases: row.alias ?? [],
      firstSeen: row.first_appearance,
      mentionCount: row.metadata?.mention_count ?? 0,
      memoryCount: row.metadata?.source_memory_count ?? 0,
      sourceEntityId: row.metadata?.source_entity_id ?? null,
      entryIds: row.metadata?.source_entry_ids ?? [],
    }));
  }

  /**
   * Promote an omega_entities record (PERSON/CHARACTER) to the characters table.
   * Called from the chat ingestion pipeline so chat-mentioned people appear in
   * the Characters Book. Deduped by metadata.omega_entity_id — safe to call
   * multiple times for the same entity.
   */
  async promoteOmegaEntityToCharacter(
    userId: string,
    entity: { id: string; primary_name: string; type: string; aliases?: string[] | null; mention_count?: number },
    threadId?: string | null
  ): Promise<string | null> {
    if (entity.type !== 'PERSON' && entity.type !== 'CHARACTER') return null;

    const classification = classifyEntity(entity.primary_name);
    if (!isCharacterEligible(classification.type) && !isUnknownEntity(classification.type)) {
      logger.debug({ name: entity.primary_name, classification }, 'Skipping omega entity that is not character-eligible');
      return null;
    }

    // The user is the narrator/main character — never add them to their own book
    if (await this.isSelfEntity(userId, entity.primary_name)) {
      logger.debug({ name: entity.primary_name }, 'Skipping self-entity (chat): user is the narrator');
      return null;
    }

    const { data: existing } = await supabaseAdmin
      .from('characters')
      .select('id')
      .eq('user_id', userId)
      .eq('metadata->>omega_entity_id', entity.id)
      .limit(1);

    if (existing?.[0]) return existing[0].id as string;

    // Registry choke point: cross-pipeline dedup, junk gate, gray-zone defer.
    const decision = await characterRegistry.classifyForCreation(userId, entity.primary_name);
    if (decision.action === 'reject') {
      logger.debug({ name: entity.primary_name, reason: decision.reason }, 'Registry rejected character creation (chat)');
      import('./misclassifiedEntityRouter').then(({ misclassifiedEntityRouter }) => {
        misclassifiedEntityRouter
          .routeRejectedMention(userId, entity.primary_name, decision.reason, {
            omegaEntityId: entity.id,
            threadId,
          })
          .catch(() => {});
      }).catch(() => {});
      return null;
    }
    if (decision.action === 'merge') {
      await characterRegistry.mergeMention(userId, decision.characterId, decision.cleanName, { omega_entity_id: entity.id });
      logger.info({ mention: entity.primary_name, mergedInto: decision.matchedName }, 'Registry merged chat mention into existing character');
      if (threadId) {
        import('./conversationCentered/entityConversationLinkService').then(({ entityConversationLinkService }) => {
          entityConversationLinkService
            .linkEntity(userId, 'character', decision.characterId, threadId, {
              linkKind: 'mention',
              entityName: decision.cleanName,
            })
            .catch(() => {});
        }).catch(() => {});
      }
      return decision.characterId;
    }
    if (decision.action === 'defer') {
      await characterRegistry.recordPendingQuestion(userId, decision.cleanName, decision.candidates, threadId ?? null, decision.rawName);
      return null;
    }

    const mentions = entity.mention_count ?? 1;
    if (shouldDeferCharacterPromotion(decision.cleanName, mentions)) {
      logger.debug({ name: entity.primary_name, mentions }, 'Deferring mention to promotion candidate (not auto-creating character)');
      return null;
    }

    const cleanedName = decision.cleanName;

    const characterId = uuid();
    const aliases = Array.isArray(entity.aliases)
      ? entity.aliases.filter(a => a.toLowerCase() !== cleanedName.toLowerCase())
      : [];

    const { firstName, lastName } = parseNameParts(cleanedName);
    // Honest initial classification: importance scales with mention count;
    // relationship_depth starts at mentioned_only so the character appears in
    // the Mentioned tab until facts confirm a real relationship. Archetype and
    // proximity are NOT guessed here — entityFactsService upgrades them when
    // relationship facts arrive.
    const importanceLevel = mentions >= 6 ? 'major' : mentions >= 3 ? 'supporting' : 'minor';
    const avatarUrl = await assignCharacterAvatar(characterId);
    const { error } = await supabaseAdmin.from('characters').insert({
      id: characterId,
      user_id: userId,
      name: cleanedName,
      alias: aliases.length > 0 ? aliases : null,
      status: 'active',
      tags: [],
      first_name: firstName || null,
      last_name: lastName || null,
      importance_level: importanceLevel,
      relationship_depth: 'mentioned_only',
      avatar_url: avatarUrl,
      metadata: {
        omega_entity_id: entity.id,
        mention_count: mentions,
        generated_by: 'chat_extraction',
        generated_at: new Date().toISOString(),
        first_name: firstName || undefined,
        last_name: lastName || undefined,
      },
    });

    if (error) {
      logger.error({ error, name: entity.primary_name }, 'Failed to promote omega entity to character');
      return null;
    }

    if (threadId) {
      import('./conversationCentered/entityConversationLinkService').then(({ entityConversationLinkService }) => {
        entityConversationLinkService
          .linkEntity(userId, 'character', characterId, threadId, {
            linkKind: 'origin',
            entityName: cleanedName,
          })
          .catch((err) => logger.warn({ err, characterId, threadId }, 'Failed to link origin thread (non-blocking)'));
      }).catch(() => {});
    }

    logger.info({ characterId, name: entity.primary_name }, 'Promoted chat entity to character');
    return characterId;
  }
}

export const characterFoundationService = new CharacterFoundationService();
