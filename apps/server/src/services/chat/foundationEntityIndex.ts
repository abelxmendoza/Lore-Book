/**
 * Canonical entity name index for recall routing — characters, locations, organizations.
 * Replaces legacy people/places roster reads in hot paths.
 */
import { supabaseAdmin } from '../supabaseClient';

export type KnownEntityRef = { id: string; type: string };

export function indexEntityName(
  map: Map<string, KnownEntityRef>,
  name: string | null | undefined,
  id: string,
  type: string
): void {
  const key = name?.trim().toLowerCase();
  if (key) map.set(key, { id, type });
}

export function indexAliasNames(
  map: Map<string, KnownEntityRef>,
  aliases: string[] | null | undefined,
  id: string,
  type: string
): void {
  for (const alias of aliases ?? []) {
    indexEntityName(map, alias, id, type);
  }
}

export async function loadFoundationEntityIndex(userId: string): Promise<Map<string, KnownEntityRef>> {
  const map = new Map<string, KnownEntityRef>();

  const [charsResult, locsResult, orgsResult] = await Promise.all([
    supabaseAdmin.from('characters').select('id, name, alias').eq('user_id', userId),
    supabaseAdmin.from('locations').select('id, name, nicknames').eq('user_id', userId),
    supabaseAdmin.from('organizations').select('id, name, aliases').eq('user_id', userId),
  ]);

  if (charsResult.error) throw charsResult.error;
  if (locsResult.error) throw locsResult.error;
  if (orgsResult.error) throw orgsResult.error;

  for (const row of charsResult.data ?? []) {
    indexEntityName(map, row.name, row.id, 'person');
    indexAliasNames(map, row.alias, row.id, 'person');
  }
  for (const row of locsResult.data ?? []) {
    indexEntityName(map, row.name, row.id, 'place');
    indexAliasNames(map, row.nicknames, row.id, 'place');
  }
  for (const row of orgsResult.data ?? []) {
    indexEntityName(map, row.name, row.id, 'organization');
    indexAliasNames(map, row.aliases, row.id, 'organization');
  }

  return map;
}

/** Lowercase name set for hallucination guards and fuzzy name checks. */
export async function loadKnownNameSet(userId: string): Promise<Set<string>> {
  const index = await loadFoundationEntityIndex(userId);
  return new Set(index.keys());
}

/** Legacy-shaped rows for RAG pass-through (`allPeoplePlaces` is not prompt-visible). */
export function buildLegacyPeoplePlacesView(
  characters: Array<{ id: string; name: string; alias?: string[] | null }>,
  locations: Array<{ id: string; name: string; nicknames?: string[] | null }>,
  organizations: Array<{ id: string; name: string; aliases?: string[] | null }> = []
): Array<{ id: string; name: string; type: string; corrected_names: string[] }> {
  return [
    ...characters.map((c) => ({
      id: c.id,
      name: c.name,
      type: 'person',
      corrected_names: c.alias ?? [],
    })),
    ...locations.map((l) => ({
      id: l.id,
      name: l.name,
      type: 'place',
      corrected_names: l.nicknames ?? [],
    })),
    ...organizations.map((o) => ({
      id: o.id,
      name: o.name,
      type: 'organization',
      corrected_names: o.aliases ?? [],
    })),
  ];
}
