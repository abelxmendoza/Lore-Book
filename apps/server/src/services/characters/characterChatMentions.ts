/**
 * Every time a character was mentioned in chat — the data source behind "From your
 * chats" in the character modal. Shared by characterQueryService (the active read
 * model) and characterProfileBundleService (legacy /profile-bundle) so both stay in
 * sync instead of drifting into separate capped implementations.
 *
 * Scans every thread the character was ever linked to (not a recent sample) plus a
 * name/alias sweep across all messages, so a mention is never silently dropped just
 * because it fell outside a small recency window; MAX_MENTIONS below is a display
 * ceiling for very chatty characters, not an arbitrary cutoff on which threads count.
 */
import { supabaseAdmin } from '../supabaseClient';
import { entityConversationLinkService } from '../conversationCentered/entityConversationLinkService';

export type CharacterChatMention = {
  messageId: string;
  sessionId: string;
  content: string;
  createdAt: string;
  sessionTitle?: string;
  /** Which name/alias matched in the message body (when known). */
  matchedName?: string;
  role?: 'user' | 'assistant';
};

type ChatMessageRow = {
  id: string;
  content: string;
  created_at: string;
  session_id: string;
  role?: string;
  metadata?: unknown;
};

const MAX_MENTIONS = 200;
/** Safety ceiling on raw rows scanned per query — protects against pathological payloads, not a completeness cutoff. */
const MAX_RAW_ROWS = 1000;

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Prefer longer needles; require word boundaries for short names (< 4 chars). */
function findMatchedNeedle(content: string, needles: string[]): string | undefined {
  const lower = content.toLowerCase();
  for (const needle of needles) {
    if (needle.length < 4) {
      const re = new RegExp(`\\b${escapeRegExp(needle)}\\b`, 'i');
      if (re.test(content)) return needle;
    } else if (lower.includes(needle.toLowerCase())) {
      return needle;
    }
  }
  return undefined;
}

export async function loadCharacterChatMentions(
  userId: string,
  characterId: string,
  characterName: string,
  aliases: string[] = [],
): Promise<CharacterChatMention[]> {
  const links = await entityConversationLinkService.getThreadsForEntity(userId, 'character', characterId);
  const sessionIds = [...new Set(links.map((l) => l.sessionId))];
  const titleBySession = new Map(links.map((l) => [l.sessionId, l.sessionTitle]));

  const needles = [characterName, ...aliases]
    .filter((n): n is string => Boolean(n?.trim()))
    .map((n) => n.trim())
    .sort((a, b) => b.length - a.length);

  const mentions: CharacterChatMention[] = [];
  const seen = new Set<string>();

  const addRow = (row: ChatMessageRow) => {
    if (seen.has(row.id)) return;
    const entityIds = (row.metadata as { entity_ids?: string[] } | null)?.entity_ids ?? [];
    const byEntityId = entityIds.includes(characterId);
    const matchedName = findMatchedNeedle(row.content ?? '', needles);
    // User messages: entity id or name/alias. Assistant: only when entity id is tagged
    // (avoids flooding the list with every Lore reply that happens to say a common name).
    const role = row.role === 'assistant' ? 'assistant' : 'user';
    const matches =
      role === 'assistant' ? byEntityId : byEntityId || Boolean(matchedName);
    if (!matches) return;
    seen.add(row.id);
    mentions.push({
      messageId: row.id,
      sessionId: row.session_id,
      content: row.content,
      createdAt: row.created_at,
      sessionTitle: titleBySession.get(row.session_id),
      matchedName: matchedName ?? (byEntityId ? characterName : undefined),
      role,
    });
  };

  if (sessionIds.length > 0) {
    // Batch session ids — PostgREST .in() can choke on very large arrays.
    const chunkSize = 80;
    for (let i = 0; i < sessionIds.length; i += chunkSize) {
      const chunk = sessionIds.slice(i, i + chunkSize);
      const { data: messages } = await supabaseAdmin
        .from('chat_messages')
        .select('id, content, created_at, session_id, role, metadata')
        .eq('user_id', userId)
        .in('session_id', chunk)
        .in('role', ['user', 'assistant'])
        .order('created_at', { ascending: false })
        .limit(MAX_RAW_ROWS);
      for (const row of messages ?? []) addRow(row);
    }
  }

  // Sweep by name/alias across every thread, not just linked ones — catches mentions
  // in threads that predate entity_conversation_links or where linking missed.
  for (const needle of needles) {
    const { data: recent } = await supabaseAdmin
      .from('chat_messages')
      .select('id, content, created_at, session_id, role, metadata')
      .eq('user_id', userId)
      .eq('role', 'user')
      .ilike('content', `%${needle}%`)
      .order('created_at', { ascending: false })
      .limit(150);
    for (const row of recent ?? []) addRow(row);
  }

  // Fill session titles for sweep hits that weren't in entity links.
  const missingTitles = [
    ...new Set(mentions.filter((m) => !m.sessionTitle).map((m) => m.sessionId)),
  ];
  if (missingTitles.length > 0) {
    const { data: sessions } = await supabaseAdmin
      .from('conversation_sessions')
      .select('id, title')
      .eq('user_id', userId)
      .in('id', missingTitles.slice(0, 200));
    const titleMap = new Map((sessions ?? []).map((s) => [s.id as string, (s.title as string) ?? 'Conversation']));
    for (const m of mentions) {
      if (!m.sessionTitle) m.sessionTitle = titleMap.get(m.sessionId);
    }
  }

  return mentions
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, MAX_MENTIONS);
}
