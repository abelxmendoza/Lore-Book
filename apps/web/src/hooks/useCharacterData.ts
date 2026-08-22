import { useCallback, useEffect, useState } from 'react';

import {
  fetchCharacterCloseness,
  fetchCharacterInfluence,
  fetchCharacterMemories,
  fetchCharacterProfile,
  fetchCharacterRelationships,
  type CharacterProfile,
  type RelationshipEdge,
  type CharacterMemory
} from '../api/characters';
import { onStoryDataUpdated } from '../lib/storyRefresh';

export const useCharacterData = (characterId: string) => {
  const [profile, setProfile] = useState<CharacterProfile | null>(null);
  const [relationships, setRelationships] = useState<RelationshipEdge[]>([]);
  const [memories, setMemories] = useState<CharacterMemory[]>([]);
  const [closeness, setCloseness] = useState<{ timestamp: string; score: number }[]>([]);
  const [influence, setInfluence] = useState<{ category: string; score: number }[]>([]);

  const refresh = useCallback(async () => {
    if (!characterId) return;
    try {
      const [profileRes, relationshipRes, memoryRes, closenessRes, influenceRes] = await Promise.all([
        fetchCharacterProfile(characterId).catch(() => ({ profile: null })),
        fetchCharacterRelationships(characterId).catch(() => ({ relationships: [] })),
        fetchCharacterMemories(characterId).catch(() => ({ memories: [] })),
        fetchCharacterCloseness(characterId).catch(() => ({ closeness: [] })),
        fetchCharacterInfluence(characterId).catch(() => ({ influence: [] }))
      ]);

      setProfile(profileRes?.profile ?? null);
      setRelationships(relationshipRes?.relationships ?? []);
      setMemories(memoryRes?.memories ?? []);
      setCloseness(closenessRes?.closeness ?? []);
      setInfluence(influenceRes?.influence ?? []);
    } catch (error) {
      console.error('Failed to refresh character data:', error);
      // Set defaults on error
      setProfile(null);
      setRelationships([]);
      setMemories([]);
      setCloseness([]);
      setInfluence([]);
    }
  }, [characterId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!characterId) return;
    return onStoryDataUpdated((detail) => {
      const scopes = detail.scopes ?? [];
      const hits =
        scopes.length === 0 ||
        scopes.includes('all') ||
        scopes.includes('characters') ||
        scopes.includes('relationships');
      if (!hits) return;
      if (detail.characterIds?.length && !detail.characterIds.includes(characterId)) return;
      void refresh();
    });
  }, [characterId, refresh]);

  return { profile, relationships, memories, closeness, influence, refresh };
};
