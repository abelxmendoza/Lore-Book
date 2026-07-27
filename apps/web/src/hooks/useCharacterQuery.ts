import { useCallback, useEffect, useRef, useState } from 'react';
import { cachedFetchJson, invalidateCache } from '../lib/requestCache';
import { onStoryDataUpdated } from '../lib/storyRefresh';
import type { CharacterQueryResponse, CharacterQuerySectionName } from '../lib/api-contracts';

export type CharacterQuery = CharacterQueryResponse & {
  sections: CharacterQueryResponse['sections'] & Record<string, unknown>;
};

const QUERY_CACHE_TTL_MS = 2 * 60 * 1000;
const QUERY_LOAD_TIMEOUT_MS = 10000;

type UseCharacterQueryOptions = {
  enabled?: boolean;
  /** Comma list or array; default `core`. */
  sections?: string | CharacterQuerySectionName[];
  /** When true, treat as protagonist self/query endpoint. */
  self?: boolean;
};

type ReloadOptions = {
  silent?: boolean;
  /** Merge these sections into the existing query (lazy tabs). */
  sections?: string | CharacterQuerySectionName[];
};

function sectionsParam(sections?: string | CharacterQuerySectionName[]): string {
  if (!sections) return 'core';
  if (Array.isArray(sections)) return sections.join(',') || 'core';
  return sections.trim() || 'core';
}

function queryUrl(characterId: string, sections: string, self: boolean): string {
  if (self) {
    return `/api/characters/self/query?sections=${encodeURIComponent(sections)}`;
  }
  return `/api/characters/${characterId}/query?sections=${encodeURIComponent(sections)}`;
}

export function useCharacterQuery(
  characterId: string | undefined,
  options: UseCharacterQueryOptions = {},
) {
  const enabled = options.enabled !== false;
  const self = Boolean(options.self);
  const defaultSections = sectionsParam(options.sections);

  const [query, setQuery] = useState<CharacterQuery | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const queryRef = useRef<CharacterQuery | null>(null);
  const requestGen = useRef(0);
  const activeLoads = useRef(0);

  useEffect(() => {
    queryRef.current = query;
  }, [query]);

  const reload = useCallback(
    async (opts?: ReloadOptions) => {
      if (!enabled || !characterId || characterId.startsWith('dummy-') || characterId.startsWith('temp-')) {
        setQuery(null);
        setLoading(false);
        activeLoads.current = 0;
        return;
      }

      const sections = sectionsParam(opts?.sections ?? defaultSections);
      const silent = Boolean(opts?.silent) && Boolean(queryRef.current);
      const merge = Boolean(opts?.sections) && Boolean(queryRef.current);
      const gen = ++requestGen.current;
      if (!silent) {
        activeLoads.current += 1;
        setLoading(true);
        setError(null);
      }

      const url = queryUrl(characterId, sections, self);

      try {
        const res = await Promise.race([
          cachedFetchJson<{ success: boolean; query: CharacterQuery; error?: string }>(url, {
            ttlMs: QUERY_CACHE_TTL_MS,
            force: Boolean(opts?.silent) || merge,
          }),
          new Promise<never>((_, reject) => {
            window.setTimeout(() => reject(new Error('Character query timed out')), QUERY_LOAD_TIMEOUT_MS);
          }),
        ]);

        if (gen !== requestGen.current) return;

        if (res.success && res.query) {
          setQuery((prev) => {
            if (!merge || !prev) return res.query;
            return {
              ...res.query,
              sections: {
                ...prev.sections,
                ...res.query.sections,
              },
              partialErrors: {
                ...(prev.partialErrors ?? {}),
                ...(res.query.partialErrors ?? {}),
              },
            };
          });
          setError(null);
        } else {
          const nextError = res.error || 'Character query unavailable';
          if (!silent) setQuery(null);
          setError(nextError);
        }
      } catch (err) {
        if (gen !== requestGen.current) return;
        const nextError = err instanceof Error ? err.message : 'Failed to load character query';
        if (!silent) setQuery(null);
        setError(nextError);
      } finally {
        if (!silent) {
          activeLoads.current = Math.max(0, activeLoads.current - 1);
          if (activeLoads.current === 0) setLoading(false);
        }
      }
    },
    [characterId, defaultSections, enabled, self],
  );

  const loadSections = useCallback(
    (sections: string | CharacterQuerySectionName[]) => reload({ sections, silent: true }),
    [reload],
  );

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    if (!characterId) return;
    return onStoryDataUpdated((detail) => {
      const scopes = detail.scopes ?? [];
      const characterIds = detail.characterIds ?? [];
      const targeted = characterIds.length > 0;
      const matches = targeted
        ? characterIds.includes(characterId)
        : scopes.includes('all') || scopes.includes('characters');
      if (!matches) return;
      invalidateCache(`/api/characters/${characterId}/query`);
      invalidateCache(`/api/characters/${characterId}/profile-bundle`);
      invalidateCache('/api/characters/self/query');
      void reload({ silent: true });
    });
  }, [characterId, reload]);

  return { query, loading, error, reload, loadSections };
}
