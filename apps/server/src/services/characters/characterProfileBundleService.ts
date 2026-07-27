import { getCharacterQuery } from './characterQueryService';
import type { CharacterProfileBundle, CharacterChatMention } from './characterProfileBundleTypes';

export type { CharacterChatMention, CharacterProfileBundle } from './characterProfileBundleTypes';

/**
 * Legacy profile-bundle shape — now backed by Character Query core sections.
 * Prefer GET /api/characters/:id/query going forward.
 */
export async function getCharacterProfileBundle(
  userId: string,
  characterId: string,
): Promise<CharacterProfileBundle | null> {
  const query = await getCharacterQuery(userId, characterId, { sections: 'core' });
  if (!query?.sections.identity) return null;

  const identity = query.sections.identity;
  const characterName = String(identity.name ?? 'Unknown');

  return {
    characterId,
    detail: identity as unknown as Record<string, unknown>,
    knowledgeBase: query.sections.knowledge ?? {
      characterId,
      name: characterName,
      aliases: Array.isArray(identity.alias) ? identity.alias : [],
      summary: typeof identity.summary === 'string' ? identity.summary : null,
      identityMentions: [],
      profile: {
        relationshipToUser: null,
        memoryCount: Number(identity.memory_count ?? 0),
        timelineEventCount: 0,
        timelineEvents: [],
      },
      facts: [],
      knowledgeClaims: [],
      sceneCandidates: [],
      relatedEntities: [],
      conversationLinks: [],
      intelligence: {
        totalEvidenceItems: 0,
        lastUpdated: null,
        learningScore: 0,
      },
    },
    loreProfile: query.sections.lore ?? {
      characterId,
      characterName,
      generatedAt: new Date().toISOString(),
      skills: [],
      hobbies: [],
      interests: [],
      groups: [],
      people: [],
      loreSnippets: [],
      mentionOnly: false,
    },
    chatMentions: (query.sections.chatMentions ?? []) as CharacterChatMention[],
    generatedAt: query.generatedAt,
  };
}
