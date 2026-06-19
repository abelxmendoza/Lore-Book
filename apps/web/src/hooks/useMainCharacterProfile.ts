import { useCallback, useEffect, useState } from 'react';
import type { Character } from '../components/characters/CharacterProfileCard';
import type { MemoryCard } from '../types/memory';
import { selfCharacterApi, type SelfProfileResponse } from '../api/selfCharacter';
import { isSyntheticSelfId } from '../lib/isSelfCharacter';
import { useMockData } from '../contexts/MockDataContext';
import { getMockAttributes, getMockKnowledgeClaims, getMockFacts } from '../mocks/characterIntelligence';
import {
  getCharacterContextHooks,
  getCharacterRealName,
  getCharacterWittyTagline,
} from '../lib/characterDisplay';

export type MainCharacterAttribute = {
  attributeType: string;
  attributeValue: string;
  confidence: number;
  isCurrent?: boolean;
  evidence?: string;
};

export type MainCharacterRelationship = {
  id?: string;
  character_id?: string;
  character_name?: string;
  relationship_type: string;
  status?: string;
  summary?: string;
  closeness_score?: number;
};

function selfMemoryToCard(
  memory: SelfProfileResponse['recentMemories'][number],
  characterName: string,
): MemoryCard {
  return {
    id: memory.id,
    title: memory.summary || memory.content.slice(0, 80) || 'Conversation memory',
    content: memory.content || memory.summary || '',
    date: memory.date,
    tags: memory.tags || [],
    source: memory.source === 'chat' ? 'chat' : 'journal',
    sourceIcon: memory.source === 'chat' ? '💬' : '📖',
    characters: [characterName],
  };
}

export function useMainCharacterProfile(character: Character) {
  const { useMockData: isMockDataEnabled } = useMockData();
  const [loading, setLoading] = useState(true);
  const [characterData, setCharacterData] = useState<Character>(character);
  const [attributes, setAttributes] = useState<MainCharacterAttribute[]>([]);
  const [facts, setFacts] = useState<SelfProfileResponse['facts']>([]);
  const [knowledgeClaims, setKnowledgeClaims] = useState<Array<Record<string, unknown>>>([]);
  const [memories, setMemories] = useState<MemoryCard[]>([]);
  const [relationships, setRelationships] = useState<MainCharacterRelationship[]>([]);
  const [stats, setStats] = useState<SelfProfileResponse['stats'] | null>(null);
  const [wittyTagline, setWittyTagline] = useState<string | null>(getCharacterWittyTagline(character));
  const [roleTagline, setRoleTagline] = useState<string | null>(character.role ?? null);
  const [contextHooks, setContextHooks] = useState<string[]>(getCharacterContextHooks(character));
  const [profileSummary, setProfileSummary] = useState<string | null>(character.summary ?? null);
  const [realName, setRealName] = useState<string | null>(getCharacterRealName(character));

  const applyProfile = useCallback((profile: SelfProfileResponse) => {
    const name = profile.character.name || character.name;
    setCharacterData({
      ...(profile.character as Character),
      importance_level: 'protagonist',
    });
    setAttributes(profile.attributes ?? []);
    setFacts(profile.facts ?? []);
    setKnowledgeClaims(profile.knowledgeClaims ?? []);
    setStats(profile.stats ?? null);
    setWittyTagline(profile.wittyTagline ?? getCharacterWittyTagline(profile.character));
    setRoleTagline(profile.roleTagline ?? profile.character.role ?? null);
    setContextHooks(profile.contextHooks ?? getCharacterContextHooks(profile.character));
    setProfileSummary(profile.profileSummary ?? profile.character.summary ?? null);
    setRealName(profile.realName ?? getCharacterRealName(profile.character));
    setRelationships((profile.character.relationships ?? []) as MainCharacterRelationship[]);
    setMemories((profile.recentMemories ?? []).map((m) => selfMemoryToCard(m, name)));
  }, [character.name]);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      if (isMockDataEnabled) {
        setCharacterData({
          ...character,
          importance_level: 'protagonist',
          memory_count: character.memory_count ?? 12,
          relationship_count: character.relationship_count ?? (character.relationships?.length ?? 0),
        });
        setAttributes(getMockAttributes(character));
        setFacts(getMockFacts(character));
        setKnowledgeClaims(getMockKnowledgeClaims(character));
        setRelationships((character.relationships ?? []) as MainCharacterRelationship[]);
        setWittyTagline(getCharacterWittyTagline(character));
        setRoleTagline(character.role ?? 'Protagonist · Your story');
        setContextHooks(getCharacterContextHooks(character));
        setProfileSummary(character.summary ?? null);
        setStats({
          messageCount: 48,
          attributeCount: getMockAttributes(character).length,
          factCount: 6,
          knowledgeClaimCount: 4,
          lastSyncedAt: new Date().toISOString(),
        });
        setMemories([]);
        return;
      }

      if (isSyntheticSelfId(character.id)) {
        await selfCharacterApi.ensureSelf().catch(() => {});
      }
      const profile = await selfCharacterApi.getProfile();
      applyProfile(profile);
    } catch (err) {
      console.error('Failed to load main character profile', err);
      setCharacterData({ ...character, importance_level: 'protagonist' });
    } finally {
      setLoading(false);
    }
  }, [applyProfile, character, isMockDataEnabled]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return {
    loading,
    reload,
    character: characterData,
    attributes,
    facts,
    knowledgeClaims,
    memories,
    relationships,
    stats,
    wittyTagline,
    roleTagline,
    contextHooks,
    profileSummary,
    realName,
    isMockDataEnabled,
  };
}
