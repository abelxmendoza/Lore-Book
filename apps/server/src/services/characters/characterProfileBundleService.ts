import { getCharacterKnowledgeBase } from '../characterKnowledgeBaseService';
import { characterLoreProfileService } from './characterLoreProfileService';
import { entityConversationLinkService } from '../conversationCentered/entityConversationLinkService';
import { supabaseAdmin } from '../supabaseClient';
import { logger } from '../../logger';

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
  knowledgeBase: NonNullable<Awaited<ReturnType<typeof getCharacterKnowledgeBase>>>;
  loreProfile: NonNullable<Awaited<ReturnType<typeof characterLoreProfileService.compile>>>;
  chatMentions: CharacterChatMention[];
  generatedAt: string;
};

async function loadCharacterDetailRow(userId: string, characterId: string) {
  const { data: character, error } = await supabaseAdmin
    .from('characters')
    .select('*')
    .eq('id', characterId)
    .eq('user_id', userId)
    .single();

  if (error || !character) return null;

  const { data: relationships } = await supabaseAdmin
    .from('character_relationships')
    .select('*')
    .or(`source_character_id.eq.${characterId},target_character_id.eq.${characterId}`);

  const relationshipCharacterIds = new Set<string>();
  relationships?.forEach((rel) => {
    if (rel.source_character_id === characterId) relationshipCharacterIds.add(rel.target_character_id);
    else relationshipCharacterIds.add(rel.source_character_id);
  });

  const { data: relatedCharacters } = relationshipCharacterIds.size
    ? await supabaseAdmin
        .from('characters')
        .select('id, name')
        .in('id', Array.from(relationshipCharacterIds))
    : { data: [] };

  const nameById = new Map((relatedCharacters ?? []).map((c) => [c.id, c.name]));

  const allRelationships =
    relationships?.map((rel) => {
      const isSource = rel.source_character_id === characterId;
      const otherId = isSource ? rel.target_character_id : rel.source_character_id;
      return {
        id: rel.id,
        character_id: otherId,
        character_name: nameById.get(otherId),
        relationship_type: rel.relationship_type,
        closeness_score: rel.closeness_score,
        summary: rel.summary,
        status: rel.status,
      };
    }) ?? [];

  const { data: memories } = await supabaseAdmin
    .from('character_memories')
    .select('id, journal_entry_id, created_at, summary')
    .eq('character_id', characterId)
    .order('created_at', { ascending: false })
    .limit(50);

  const metadata = (character.metadata ?? {}) as Record<string, unknown>;

  return {
    ...character,
    witty_tagline: metadata.witty_tagline ?? metadata.character_blurb ?? null,
    real_name: metadata.real_name ?? null,
    context_hooks: metadata.context_hooks ?? [],
    social_media: metadata.social_media ?? undefined,
    relationships: allRelationships,
    shared_memories:
      memories?.map((mem) => ({
        id: mem.id,
        entry_id: mem.journal_entry_id,
        date: mem.created_at,
        summary: mem.summary ?? undefined,
      })) ?? [],
    memory_count: memories?.length ?? 0,
    relationship_count: allRelationships.length,
  };
}

async function loadChatMentions(
  userId: string,
  characterId: string,
  characterName: string,
): Promise<CharacterChatMention[]> {
  const links = await entityConversationLinkService.getThreadsForEntity(userId, 'character', characterId);
  const sessionIds = [...new Set(links.map((l) => l.sessionId))].slice(0, 8);
  const titleBySession = new Map(links.map((l) => [l.sessionId, l.sessionTitle]));

  const mentions: CharacterChatMention[] = [];
  const nameNeedle = characterName.toLowerCase();

  if (sessionIds.length > 0) {
    const { data: messages } = await supabaseAdmin
      .from('chat_messages')
      .select('id, content, created_at, session_id, role, metadata')
      .eq('user_id', userId)
      .eq('role', 'user')
      .in('session_id', sessionIds)
      .order('created_at', { ascending: false })
      .limit(40);

    for (const row of messages ?? []) {
      const entityIds = (row.metadata as { entity_ids?: string[] } | null)?.entity_ids ?? [];
      const mentionsName = row.content?.toLowerCase().includes(nameNeedle);
      if (!entityIds.includes(characterId) && !mentionsName) continue;
      mentions.push({
        messageId: row.id,
        sessionId: row.session_id,
        content: row.content,
        createdAt: row.created_at,
        sessionTitle: titleBySession.get(row.session_id),
      });
    }
  }

  if (mentions.length < 5) {
    const { data: recent } = await supabaseAdmin
      .from('chat_messages')
      .select('id, content, created_at, session_id, metadata')
      .eq('user_id', userId)
      .eq('role', 'user')
      .ilike('content', `%${characterName}%`)
      .order('created_at', { ascending: false })
      .limit(10);

    for (const row of recent ?? []) {
      if (mentions.some((m) => m.messageId === row.id)) continue;
      mentions.push({
        messageId: row.id,
        sessionId: row.session_id,
        content: row.content,
        createdAt: row.created_at,
      });
    }
  }

  return mentions
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 12);
}

export async function getCharacterProfileBundle(
  userId: string,
  characterId: string,
): Promise<CharacterProfileBundle | null> {
  const [detail, knowledgeBase, loreProfile] = await Promise.all([
    loadCharacterDetailRow(userId, characterId),
    getCharacterKnowledgeBase(userId, characterId),
    characterLoreProfileService.compile(userId, characterId),
  ]);

  if (!detail || !knowledgeBase || !loreProfile) return null;

  let chatMentions: CharacterChatMention[] = [];
  try {
    chatMentions = await loadChatMentions(userId, characterId, detail.name as string);
  } catch (err) {
    logger.warn({ err, characterId }, 'Failed to load character chat mentions for bundle');
  }

  return {
    characterId,
    detail,
    knowledgeBase,
    loreProfile,
    chatMentions,
    generatedAt: new Date().toISOString(),
  };
}
