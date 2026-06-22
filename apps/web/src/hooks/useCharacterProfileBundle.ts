import { useCallback, useEffect, useState } from 'react';
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

export function useCharacterProfileBundle(characterId: string | undefined, enabled = true) {
  const [bundle, setBundle] = useState<CharacterProfileBundle | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!enabled || !characterId || characterId.startsWith('dummy-') || characterId.startsWith('temp-')) {
      setBundle(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await cachedFetchJson<{ success: boolean; bundle: CharacterProfileBundle }>(
        `/api/characters/${characterId}/profile-bundle`,
        { ttlMs: BUNDLE_CACHE_TTL_MS },
      );
      if (res.success && res.bundle) setBundle(res.bundle);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load character profile');
    } finally {
      setLoading(false);
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
      if (
        scopes.includes('all') ||
        scopes.includes('characters') ||
        characterIds.includes(characterId)
      ) {
        invalidateCache(characterId);
        void reload();
      }
    });
  }, [characterId, reload]);

  return { bundle, loading, error, reload };
}
