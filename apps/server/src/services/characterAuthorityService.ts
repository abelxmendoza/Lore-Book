/**
 * Character Authority Service — single canonical identity resolver.
 *
 * Every person lookup (mentions, people_places, omega, relationships)
 * passes through this service. Authority = characters.id.
 *
 * people_places is a legacy discovery source, not authority.
 */

import { logger } from '../logger';
import { normalizeNameKey } from '../utils/nameNormalization';

import { characterDeduplicationService } from './characterDeduplicationService';
import { isValidAliasForCharacter } from './characters/aliasConstraintService';
import { supabaseAdmin } from './supabaseClient';

export type CharacterAuthorityRow = {
  id: string;
  name: string;
  alias: string[] | null;
  metadata: Record<string, unknown> | null;
};

export type ResolveResult = {
  characterId: string | null;
  confidence: number;
  method: 'id' | 'authority_map' | 'source_entity' | 'omega_entity' | 'exact' | 'alias' | 'fuzzy' | 'people_place' | 'none';
  matchedName?: string;
};

export type ResolveInput = {
  name?: string;
  alias?: string;
  characterId?: string;
  peoplePlaceId?: string;
  omegaEntityId?: string;
  /** When true, register alias / source links on match. */
  registerLinks?: boolean;
};

function isTableMissing(error: unknown): boolean {
  return (error as { code?: string })?.code === 'PGRST205';
}

class CharacterAuthorityService {
  private indexCache = new Map<string, { loadedAt: number; rows: CharacterAuthorityRow[] }>();
  private readonly CACHE_TTL_MS = 30_000;

  private async loadCharacters(userId: string): Promise<CharacterAuthorityRow[]> {
    const cached = this.indexCache.get(userId);
    if (cached && Date.now() - cached.loadedAt < this.CACHE_TTL_MS) return cached.rows;

    const { data, error } = await supabaseAdmin
      .from('characters')
      .select('id, name, alias, metadata')
      .eq('user_id', userId);
    if (error) throw error;
    const rows = (data ?? []) as CharacterAuthorityRow[];
    this.indexCache.set(userId, { loadedAt: Date.now(), rows });
    return rows;
  }

  invalidateCache(userId: string): void {
    this.indexCache.delete(userId);
  }

  async resolveCanonicalCharacterId(userId: string, input: ResolveInput): Promise<ResolveResult> {
    if (input.characterId) {
      const rows = await this.loadCharacters(userId);
      const hit = rows.find(r => r.id === input.characterId);
      if (hit) {
        return { characterId: hit.id, confidence: 1, method: 'id', matchedName: hit.name };
      }
    }

    if (input.peoplePlaceId) {
      const byPp = await this.resolveByPeoplePlace(userId, input.peoplePlaceId);
      if (byPp.characterId) return byPp;
    }

    if (input.omegaEntityId) {
      const byOmega = await this.resolveByOmegaEntity(userId, input.omegaEntityId);
      if (byOmega.characterId) return byOmega;
    }

    const label = input.alias ?? input.name;
    if (label?.trim()) {
      const byName = await this.resolveByName(userId, label);
      if (byName.characterId) {
        if (input.registerLinks) {
          await this.registerAliasLink(userId, byName.characterId, label, byName.method);
        }
        return byName;
      }
    }

    return { characterId: null, confidence: 0, method: 'none' };
  }

  async resolveByName(userId: string, name: string): Promise<ResolveResult> {
    const rows = await this.loadCharacters(userId);
    const norm = normalizeNameKey(name);

    // Exact name
    const exact = rows.find(r => normalizeNameKey(r.name) === norm);
    if (exact) return { characterId: exact.id, confidence: 1, method: 'exact', matchedName: exact.name };

    // Alias exact
    for (const row of rows) {
      for (const alias of row.alias ?? []) {
        if (normalizeNameKey(alias) === norm) {
          return { characterId: row.id, confidence: 0.98, method: 'alias', matchedName: row.name };
        }
      }
    }

    // Authority map alias
    const mapped = await this.lookupAuthorityMapByAlias(userId, name);
    if (mapped) return mapped;

    // Title-aware + fuzzy via dedup service
    const candidates = characterDeduplicationService.findCandidates(name, rows);
    if (candidates.length > 0 && candidates[0].confidence >= 0.85) {
      const c = candidates[0];
      const row = rows.find(r => r.id === c.characterId)!;
      return {
        characterId: c.characterId,
        confidence: c.confidence,
        method: c.method === 'alias' ? 'alias' : 'fuzzy',
        matchedName: row.name,
      };
    }

    // metadata source_entity_id backfill via people_places name
    return { characterId: null, confidence: 0, method: 'none' };
  }

  async resolveByAlias(userId: string, alias: string): Promise<ResolveResult> {
    return this.resolveByName(userId, alias);
  }

  async resolveByPeoplePlace(userId: string, peoplePlaceId: string): Promise<ResolveResult> {
    // Authority map
    const { data: mapRow } = await supabaseAdmin
      .from('character_authority_map')
      .select('canonical_character_id, confidence')
      .eq('user_id', userId)
      .eq('source_table', 'people_places')
      .eq('source_id', peoplePlaceId)
      .maybeSingle();
    if (mapRow?.canonical_character_id) {
      return {
        characterId: mapRow.canonical_character_id,
        confidence: Number(mapRow.confidence ?? 1),
        method: 'authority_map',
      };
    }

    // metadata.source_entity_id on characters
    const { data: byMeta } = await supabaseAdmin
      .from('characters')
      .select('id, name')
      .eq('user_id', userId)
      .eq('metadata->>source_entity_id', peoplePlaceId)
      .limit(1);
    if (byMeta?.[0]) {
      return {
        characterId: byMeta[0].id,
        confidence: 1,
        method: 'source_entity',
        matchedName: byMeta[0].name,
      };
    }

    // Fallback: resolve by people_places display name (legacy discovery)
    const { data: pp } = await supabaseAdmin
      .from('people_places')
      .select('id, name, corrected_names')
      .eq('user_id', userId)
      .eq('id', peoplePlaceId)
      .maybeSingle();
    if (!pp) return { characterId: null, confidence: 0, method: 'none' };

    const byName = await this.resolveByName(userId, pp.name);
    if (byName.characterId) {
      await this.linkSourceRecord(userId, byName.characterId, 'people_places', peoplePlaceId, pp.name, 'people_place', byName.confidence);
      return { ...byName, method: 'people_place' };
    }

    for (const alias of pp.corrected_names ?? []) {
      const byAlias = await this.resolveByAlias(userId, alias);
      if (byAlias.characterId) {
        await this.linkSourceRecord(userId, byAlias.characterId, 'people_places', peoplePlaceId, alias, 'people_place', byAlias.confidence);
        return { ...byAlias, method: 'people_place' };
      }
    }

    return { characterId: null, confidence: 0, method: 'none' };
  }

  async resolveByOmegaEntity(userId: string, omegaEntityId: string): Promise<ResolveResult> {
    const { data: mapRow } = await supabaseAdmin
      .from('character_authority_map')
      .select('canonical_character_id, confidence')
      .eq('user_id', userId)
      .eq('source_table', 'omega_entities')
      .eq('source_id', omegaEntityId)
      .maybeSingle();
    if (mapRow?.canonical_character_id) {
      return { characterId: mapRow.canonical_character_id, confidence: Number(mapRow.confidence ?? 1), method: 'authority_map' };
    }

    const { data: byMeta } = await supabaseAdmin
      .from('characters')
      .select('id, name')
      .eq('user_id', userId)
      .eq('metadata->>omega_entity_id', omegaEntityId)
      .limit(1);
    if (byMeta?.[0]) {
      return { characterId: byMeta[0].id, confidence: 1, method: 'source_entity', matchedName: byMeta[0].name };
    }

    const { data: omega } = await supabaseAdmin
      .from('omega_entities')
      .select('primary_name, aliases')
      .eq('user_id', userId)
      .eq('id', omegaEntityId)
      .maybeSingle();
    if (!omega?.primary_name) return { characterId: null, confidence: 0, method: 'none' };

    const byName = await this.resolveByName(userId, omega.primary_name);
    if (byName.characterId) {
      await this.linkSourceRecord(userId, byName.characterId, 'omega_entities', omegaEntityId, omega.primary_name, 'omega_entity', byName.confidence);
    }
    return byName;
  }

  async linkSourceRecord(
    userId: string,
    characterId: string,
    sourceTable: 'people_places' | 'omega_entities' | 'characters',
    sourceId: string,
    aliasName: string | null,
    matchMethod: string,
    confidence: number
  ): Promise<void> {
    const { error } = await supabaseAdmin.from('character_authority_map').upsert(
      {
        user_id: userId,
        canonical_character_id: characterId,
        source_table: sourceTable,
        source_id: sourceId,
        alias_name: aliasName,
        match_method: matchMethod,
        confidence,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,source_table,source_id' }
    );
    if (error && !isTableMissing(error)) {
      logger.debug({ error, userId, characterId, sourceTable, sourceId }, 'Failed to link authority map');
    }
  }

  async registerAliasLink(userId: string, characterId: string, alias: string, method: string): Promise<void> {
    const norm = normalizeNameKey(alias);
    const { data: row } = await supabaseAdmin
      .from('characters')
      .select('id, name, alias')
      .eq('id', characterId)
      .eq('user_id', userId)
      .maybeSingle();
    if (!row) return;
    if (normalizeNameKey(row.name) === norm) return;
    if (!isValidAliasForCharacter(row.name, alias)) return;
    const aliases = new Set(row.alias ?? []);
    const already = Array.from(aliases).some(a => normalizeNameKey(a) === norm);
    if (!already) {
      aliases.add(alias);
      await supabaseAdmin
        .from('characters')
        .update({ alias: Array.from(aliases), updated_at: new Date().toISOString() })
        .eq('id', characterId)
        .eq('user_id', userId);
    }
    this.invalidateCache(userId);
  }

  private async lookupAuthorityMapByAlias(userId: string, alias: string): Promise<ResolveResult | null> {
    const { data } = await supabaseAdmin
      .from('character_authority_map')
      .select('canonical_character_id, confidence')
      .eq('user_id', userId)
      .ilike('alias_name', alias.trim())
      .order('confidence', { ascending: false })
      .limit(1);
    if (!data?.[0]?.canonical_character_id) return null;
    return {
      characterId: data[0].canonical_character_id,
      confidence: Number(data[0].confidence ?? 0.9),
      method: 'authority_map',
    };
  }

  /** Register all match keys for a character into authority map (self-link). */
  async registerCharacterAuthority(userId: string, characterId: string, name: string, aliases: string[] = []): Promise<void> {
    await this.linkSourceRecord(userId, characterId, 'characters', characterId, name, 'exact', 1);
    for (const alias of aliases) {
      await supabaseAdmin.from('character_authority_map').upsert(
        {
          user_id: userId,
          canonical_character_id: characterId,
          source_table: 'characters',
          source_id: characterId,
          alias_name: alias,
          match_method: 'alias',
          confidence: 0.95,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,source_table,source_id' }
      );
    }
    this.invalidateCache(userId);
  }

  /**
   * Resolve any person reference UUID (character, omega_entity, people_places)
   * to the canonical characters.id.
   */
  async resolvePersonReferenceId(userId: string, refId: string): Promise<string | null> {
    if (!refId?.trim()) return null;

    const { data: asCharacter } = await supabaseAdmin
      .from('characters')
      .select('id')
      .eq('user_id', userId)
      .eq('id', refId)
      .maybeSingle();
    if (asCharacter?.id) return asCharacter.id;

    const { data: mapHit } = await supabaseAdmin
      .from('character_authority_map')
      .select('canonical_character_id')
      .eq('user_id', userId)
      .eq('source_id', refId)
      .maybeSingle();
    if (mapHit?.canonical_character_id) return mapHit.canonical_character_id;

    const { data: byOmegaMeta } = await supabaseAdmin
      .from('characters')
      .select('id')
      .eq('user_id', userId)
      .eq('metadata->>omega_entity_id', refId)
      .limit(1);
    if (byOmegaMeta?.[0]?.id) return byOmegaMeta[0].id;

    const { data: byPpMeta } = await supabaseAdmin
      .from('characters')
      .select('id')
      .eq('user_id', userId)
      .eq('metadata->>source_entity_id', refId)
      .limit(1);
    if (byPpMeta?.[0]?.id) return byPpMeta[0].id;

    const omega = await this.resolveByOmegaEntity(userId, refId);
    if (omega.characterId) return omega.characterId;

    const pp = await this.resolveByPeoplePlace(userId, refId);
    if (pp.characterId) return pp.characterId;

    return null;
  }

  /** Seed authority map links from existing characters, people_places, and omega entities. */
  async seedAuthorityLinks(userId: string): Promise<{ characters: number; peoplePlaces: number; omega: number }> {
    let characters = 0;
    let peoplePlaces = 0;
    let omega = 0;

    const { data: chars } = await supabaseAdmin
      .from('characters')
      .select('id, name, alias, metadata')
      .eq('user_id', userId);
    for (const c of chars ?? []) {
      await this.registerCharacterAuthority(userId, c.id, c.name, c.alias ?? []);
      characters++;
      const meta = (c.metadata ?? {}) as Record<string, unknown>;
      if (meta.source_entity_id) {
        await this.linkSourceRecord(userId, c.id, 'people_places', String(meta.source_entity_id), c.name, 'backfill', 1);
        peoplePlaces++;
      }
      if (meta.omega_entity_id) {
        await this.linkSourceRecord(userId, c.id, 'omega_entities', String(meta.omega_entity_id), c.name, 'backfill', 1);
        omega++;
      }
    }

    const { data: ppRows } = await supabaseAdmin
      .from('people_places')
      .select('id, name, corrected_names')
      .eq('user_id', userId)
      .eq('type', 'person');
    for (const pp of ppRows ?? []) {
      const resolved = await this.resolveByPeoplePlace(userId, pp.id);
      if (!resolved.characterId) {
        const byName = await this.resolveByName(userId, pp.name);
        if (byName.characterId) {
          await this.linkSourceRecord(userId, byName.characterId, 'people_places', pp.id, pp.name, 'backfill_name', byName.confidence);
          peoplePlaces++;
        }
      }
    }

    const { data: omegaRows } = await supabaseAdmin
      .from('omega_entities')
      .select('id, primary_name')
      .eq('user_id', userId)
      .in('type', ['PERSON', 'CHARACTER']);
    for (const oe of omegaRows ?? []) {
      const resolved = await this.resolveByOmegaEntity(userId, oe.id);
      if (!resolved.characterId && oe.primary_name) {
        const byName = await this.resolveByName(userId, oe.primary_name);
        if (byName.characterId) {
          await this.linkSourceRecord(userId, byName.characterId, 'omega_entities', oe.id, oe.primary_name, 'backfill_name', byName.confidence);
          omega++;
        }
      }
    }

    this.invalidateCache(userId);
    return { characters, peoplePlaces, omega };
  }
}

export const characterAuthorityService = new CharacterAuthorityService();
