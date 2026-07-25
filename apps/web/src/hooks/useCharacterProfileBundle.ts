import { useCallback, useEffect, useRef, useState } from 'react';
import { cachedFetchJson, invalidateCache } from '../lib/requestCache';
import { onStoryDataUpdated } from '../lib/storyRefresh';
import type { CharacterKnowledgeBaseData } from '../components/characters/CharacterKnowledgeBase';
import type { CharacterLoreProfile } from '../api/characterLoreProfile';

export type CharacterChatMention = {
  messageId: string;
  sessionId: string;
  content: string;
  createdAt: string;
  sessionTitle?: string;
};

export type CharacterProfileBundle = {
  characterId: string;
  detail: Record<string, unknown>;
  knowledgeBase: CharacterKnowledgeBaseData;
  loreProfile: CharacterLoreProfile;
  chatMentions: CharacterChatMention[];
  generatedAt: string;
};

const BUNDLE_CACHE_TTL_MS = 2 * 60 * 1000;
/** Never leave the modal spinner waiting forever on a hung profile-bundle call. */
const BUNDLE_LOAD_TIMEOUT_MS = 8000;

type ReloadOptions = {
  /** Background refresh — keep prior bundle visible; do not flip `loading`. */
  silent?: boolean;
};

export function useCharacterProfileBundle(characterId: string | undefined, enabled = true) {
  const [bundle, setBundle] = useState<CharacterProfileBundle | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bundleRef = useRef<CharacterProfileBundle | null>(null);
  const requestGen = useRef(0);
  const activeLoads = useRef(0);

  useEffect(() => {
    bundleRef.current = bundle;
  }, [bundle]);

  const reload = useCallback(async (opts?: ReloadOptions) => {
    if (!enabled || !characterId || characterId.startsWith('dummy-') || characterId.startsWith('temp-')) {
      setBundle(null);
      setLoading(false);
      activeLoads.current = 0;
      return;
    }

    const silent = Boolean(opts?.silent) && Boolean(bundleRef.current);
    const gen = ++requestGen.current;
    if (!silent) {
      activeLoads.current += 1;
      setLoading(true);
      setError(null);
    }

    const bundleUrl = `/api/characters/${characterId}/profile-bundle`;

    try {
      const res = await Promise.race([
        cachedFetchJson<{ success: boolean; bundle: CharacterProfileBundle; error?: string }>(bundleUrl, {
          ttlMs: BUNDLE_CACHE_TTL_MS,
          force: Boolean(opts?.silent),
        }),
        new Promise<never>((_, reject) => {
          window.setTimeout(() => reject(new Error('Character profile bundle timed out')), BUNDLE_LOAD_TIMEOUT_MS);
        }),
      ]);

      if (gen !== requestGen.current) return;

      if (res.success && res.bundle?.detail) {
        setBundle(res.bundle);
        setError(null);
      } else {
        const nextError = res.error || 'Character profile bundle unavailable';
        if (silent) {
          setError(nextError);
        } else {
          setBundle(null);
          setError(nextError);
        }
      }
    } catch (err) {
      if (gen !== requestGen.current) return;
      const nextError = err instanceof Error ? err.message : 'Failed to load character profile';
      if (silent) {
        setError(nextError);
      } else {
        setBundle(null);
        setError(nextError);
      }
    } finally {
      if (!silent) {
        activeLoads.current = Math.max(0, activeLoads.current - 1);
        if (activeLoads.current === 0) setLoading(false);
      }
    }
  }, [characterId, enabled]);

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
      // Invalidate only the bundle URL — never every cache key containing the UUID.
      invalidateCache(`/api/characters/${characterId}/profile-bundle`);
      void reload({ silent: true });
    });
  }, [characterId, reload]);

  return { bundle, loading, error, reload };
}
