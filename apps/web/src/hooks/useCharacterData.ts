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

export const useCharacterData = (characterId: string) => {
  const [profile, setProfile] = useState<CharacterProfile | null>(null);
  const [relationships, setRelationships] = useState<RelationshipEdge[]>([]);
  const [memories, setMemories] = useState<CharacterMemory[]>([]);
  const [closeness, setCloseness] = useState<{ timestamp: string; score: number }[]>([]);
  const [influence, setInfluence] = useState<{ category: string; score: number }[]>([]);

  const refresh = useCallback(async () => {
    if (!characterId) return;
    const [profileRes, relationshipRes, memoryRes, closenessRes, influenceRes] = await Promise.all([
      fetchCharacterProfile(characterId),
      fetchCharacterRelationships(characterId),
      fetchCharacterMemories(characterId),
      fetchCharacterCloseness(characterId),
      fetchCharacterInfluence(characterId)
    ]);

    setProfile(profileRes.profile);
    setRelationships(relationshipRes.relationships);
    setMemories(memoryRes.memories);
    setCloseness(closenessRes.closeness);
    setInfluence(influenceRes.influence);
  }, [characterId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { profile, relationships, memories, closeness, influence, refresh };
};
