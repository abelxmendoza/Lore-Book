/**
 * Canonical character list loads — delegates to books BFF.
 */
import { fetchJson } from '../lib/api';

type CharacterListResponse = {
  characters: unknown[];
  data?: { characters: unknown[] };
};

export async function fetchCharacterList<T extends { id: string; name?: string } = { id: string; name?: string }>(
  options?: Parameters<typeof fetchJson>[2]
): Promise<T[]> {
  const res = await fetchJson<CharacterListResponse>(
    '/api/books/characters',
    undefined,
    options
  );
  if (Array.isArray(res)) {
    return res as T[];
  }
  const payload = res.data ?? res;
  return (payload.characters ?? []) as T[];
}
