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
import { supabaseAdmin } from './supabaseClient';
import type { PeoplePlaceEntity } from '../types';

type CharacterRow = {
  id: string;
  user_id: string;
  name: string;
  alias: string[] | null;
  status: string;
  first_appearance: string | null;
  metadata: Record<string, unknown>;
  tags: string[];
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
  /**
   * Promote a canonical person entity to a character record.
   * Idempotent: safe to call multiple times for the same entity.
   * Returns the character id.
   */
  async promoteEntityToCharacter(
    userId: string,
    entity: PeoplePlaceEntity
  ): Promise<string | null> {
    if (entity.type !== 'person') {
      logger.debug({ entityName: entity.name, type: entity.type }, 'Skipping non-person entity');
      return null;
    }

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

    // ── 3. Create new character ──────────────────────────────────────────────
    // NOTE: Fuzzy name matching (findSimilarCharacter) is intentionally NOT
    // used here. The source_entity_id is the authoritative dedup key for the
    // foundation pipeline. Jaro-Winkler matching causes cross-person merges
    // (e.g. "Abuela" matches "Abel Mendoza" on the "Abe" prefix). Fuzzy
    // matching is reserved for future character reconciliation workflows.
    const characterId = uuid();
    const aliases = Array.from(new Set(entity.corrected_names ?? [])).filter(
      a => a.toLowerCase() !== entity.name.toLowerCase()
    );

    const firstAppearance = entity.first_mentioned_at
      ? new Date(entity.first_mentioned_at).toISOString().split('T')[0]
      : null;

    const character: CharacterRow = {
      id: characterId,
      user_id: userId,
      name: entity.name,
      alias: aliases.length > 0 ? aliases : null,
      status: 'active',
      first_appearance: firstAppearance,
      tags: [],
      metadata: {
        source_entity_id: entity.id,
        mention_count: entity.total_mentions,
        source_memory_count: entity.related_entries?.length ?? 0,
        source_entry_ids: entity.related_entries ?? [],
        generated_by: 'character_foundation',
        generated_at: new Date().toISOString(),
      },
    };

    const { error } = await supabaseAdmin.from('characters').insert(character);
    if (error) {
      logger.error({ error, name: entity.name }, 'Failed to create character');
      return null;
    }

    logger.info({ characterId, name: entity.name, aliases }, 'Created new character');
    return characterId;
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
}

export const characterFoundationService = new CharacterFoundationService();
