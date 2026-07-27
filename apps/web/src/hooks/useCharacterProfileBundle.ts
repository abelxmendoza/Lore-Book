import { useMemo } from 'react';
import { useCharacterQuery } from './useCharacterQuery';
import type { CharacterKnowledgeBaseData } from '../components/characters/CharacterKnowledgeBase';
import type { CharacterLoreProfile } from '../api/characterLoreProfile';
import type { CharacterChatMention } from './useCharacterProfileBundleTypes';

export type { CharacterChatMention } from './useCharacterProfileBundleTypes';

export type CharacterProfileBundle = {
  characterId: string;
  detail: Record<string, unknown>;
  knowledgeBase: CharacterKnowledgeBaseData;
  loreProfile: CharacterLoreProfile;
  chatMentions: CharacterChatMention[];
  generatedAt: string;
};

/**
 * @deprecated Prefer useCharacterQuery. Kept as a thin adapter over /query?sections=core.
 */
export function useCharacterProfileBundle(characterId: string | undefined, enabled = true) {
  const { query, loading, error, reload } = useCharacterQuery(characterId, {
    enabled,
    sections: 'core',
  });

  const bundle = useMemo<CharacterProfileBundle | null>(() => {
    if (!query?.sections?.identity) return null;
    const identity = query.sections.identity as Record<string, unknown>;
    return {
      characterId: query.characterId,
      detail: identity,
      knowledgeBase: (query.sections.knowledge as CharacterKnowledgeBaseData) ?? {
        characterId: query.characterId,
        name: String(identity.name ?? 'Unknown'),
        aliases: [],
        summary: null,
        identityMentions: [],
        profile: {
          relationshipToUser: null,
          memoryCount: 0,
          timelineEventCount: 0,
          timelineEvents: [],
        },
        facts: [],
        knowledgeClaims: [],
        sceneCandidates: [],
        relatedEntities: [],
        conversationLinks: [],
        intelligence: { totalEvidenceItems: 0, lastUpdated: null, learningScore: 0 },
      },
      loreProfile: (query.sections.lore as CharacterLoreProfile) ?? {
        characterId: query.characterId,
        characterName: String(identity.name ?? 'Unknown'),
        generatedAt: query.generatedAt,
        skills: [],
        hobbies: [],
        interests: [],
        groups: [],
        people: [],
        loreSnippets: [],
        mentionOnly: false,
      },
      chatMentions: (query.sections.chatMentions as CharacterChatMention[]) ?? [],
      generatedAt: query.generatedAt,
    };
  }, [query]);

  return { bundle, loading, error, reload };
}
