import { supabaseAdmin } from '../supabaseClient';

export type ThreadMessageRow = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
  metadata?: Record<string, unknown> | null;
  /** 1-based conversational turn — a user prompt opens a turn, its replies share it. */
  turn_number?: number | null;
  /** 0 for the user prompt, 1..n for the assistant replies within the turn. */
  reply_seq?: number | null;
};

/**
 * Assign turn/reply numbering across an ordered message list.
 * Stored values (from the chat_messages numbering trigger) win; anything
 * without one (legacy sources, pre-migration rows) is derived from position
 * so every message always carries a stable, human-referencable number.
 */
export function assignMessageRefs(rows: ThreadMessageRow[]): ThreadMessageRow[] {
  let lastTurn = 0;
  const repliesInTurn = new Map<number, number>();
  return rows.map((row) => {
    if (row.role === 'user') {
      const turn = row.turn_number ?? lastTurn + 1;
      lastTurn = Math.max(lastTurn, turn);
      return { ...row, turn_number: turn, reply_seq: row.reply_seq ?? 0 };
    }
    const turn = row.turn_number ?? Math.max(lastTurn, 1);
    lastTurn = Math.max(lastTurn, turn);
    const seq = row.reply_seq ?? (repliesInTurn.get(turn) ?? 0) + 1;
    repliesInTurn.set(turn, Math.max(repliesInTurn.get(turn) ?? 0, seq));
    return { ...row, turn_number: turn, reply_seq: seq };
  });
}

function metadataMessages(meta: Record<string, unknown> | null | undefined): ThreadMessageRow[] {
  const raw = meta?.messages;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((m): m is Record<string, unknown> => !!m && typeof m === 'object')
    .map((m, idx) => ({
      id: (m.id as string) ?? `meta-${idx}`,
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: String(m.content ?? ''),
      created_at: (m.timestamp as string) ?? new Date().toISOString(),
      metadata: (m.metadata as Record<string, unknown>) ?? null,
    }));
}

function normalizeContent(text: string): string {
  return text.trim().replace(/\s+/g, ' ').toLowerCase();
}

function sourceRank(id: string): number {
  if (id.startsWith('meta-') || id.startsWith('user-') || id.startsWith('assistant-')) return 0;
  return 1;
}

function mergeMessageSources(sources: ThreadMessageRow[][]): ThreadMessageRow[] {
  const byFingerprint = new Map<string, ThreadMessageRow>();

  for (const source of sources) {
    for (const message of source) {
      if (!message.content.trim()) continue;
      const fingerprint = `${message.role}:${normalizeContent(message.content)}`;
      const existing = byFingerprint.get(fingerprint);
      if (!existing || sourceRank(message.id) > sourceRank(existing.id)) {
        byFingerprint.set(fingerprint, message);
      }
    }
  }

  return [...byFingerprint.values()].sort((a, b) => {
    const timeDiff = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    if (timeDiff !== 0) return timeDiff;
    if (a.role === b.role) return 0;
    return a.role === 'user' ? -1 : 1;
  });
}

async function loadChatMessageRows(userId: string, sessionId: string) {
  // turn_number/reply_seq may not exist until the reference-numbers migration runs.
  const withRefs = await supabaseAdmin
    .from('chat_messages')
    .select('id, role, content, created_at, metadata, turn_number, reply_seq')
    .eq('session_id', sessionId)
    .eq('user_id', userId)
    .order('created_at', { ascending: true });
  if (!withRefs.error) return withRefs.data ?? [];
  const legacy = await supabaseAdmin
    .from('chat_messages')
    .select('id, role, content, created_at, metadata')
    .eq('session_id', sessionId)
    .eq('user_id', userId)
    .order('created_at', { ascending: true });
  return (legacy.data ?? []) as Array<
    Record<string, unknown> & { turn_number?: number | null; reply_seq?: number | null }
  >;
}

/** Unified loader: chat_messages is canonical; legacy sources used only when chat is empty. */
export async function loadThreadMessages(
  userId: string,
  sessionId: string
): Promise<ThreadMessageRow[]> {
  const [chatMsgs, { data: session }, { data: convMsgs }] = await Promise.all([
    loadChatMessageRows(userId, sessionId),
    supabaseAdmin
      .from('conversation_sessions')
      .select('metadata')
      .eq('id', sessionId)
      .eq('user_id', userId)
      .maybeSingle(),
    supabaseAdmin
      .from('conversation_messages')
      .select('id, role, content, created_at, metadata')
      .eq('session_id', sessionId)
      .eq('user_id', userId)
      .order('created_at', { ascending: true }),
  ]);

  const fromChat = (chatMsgs ?? []).map((m: any) => ({
    id: m.id,
    role: m.role === 'assistant' ? 'assistant' as const : 'user' as const,
    content: String(m.content ?? ''),
    created_at: m.created_at,
    metadata: (m.metadata as Record<string, unknown>) ?? null,
    turn_number: (m.turn_number as number | null) ?? null,
    reply_seq: (m.reply_seq as number | null) ?? null,
  }));

  const fromConversation = (convMsgs ?? []).map((m) => ({
    id: m.id,
    role: m.role === 'assistant' ? 'assistant' as const : 'user' as const,
    content: String(m.content ?? ''),
    created_at: m.created_at,
    metadata: (m.metadata as Record<string, unknown>) ?? null,
  }));
  const fromMeta = metadataMessages(session?.metadata as Record<string, unknown> | null);

  // Always merge — chat_messages can be user-only while assistant lives in a fallback source.
  return assignMessageRefs(
    mergeMessageSources([fromChat, fromConversation, fromMeta]).filter(
      (m) => m.content.trim().length > 0
    )
  );
}

export async function threadMessageCount(userId: string, sessionId: string): Promise<number> {
  const messages = await loadThreadMessages(userId, sessionId);
  return messages.length;
}

export async function threadHasEntityLinks(userId: string, sessionId: string): Promise<boolean> {
  const { count } = await supabaseAdmin
    .from('entity_conversation_links')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('session_id', sessionId);
  return (count ?? 0) > 0;
}

export async function threadHasIngestedKnowledge(userId: string, sessionId: string): Promise<boolean> {
  const [{ count: convCount }, { count: chatCount }] = await Promise.all([
    supabaseAdmin
      .from('conversation_messages')
      .select('id', { count: 'exact', head: true })
      .eq('session_id', sessionId)
      .eq('user_id', userId),
    supabaseAdmin
      .from('chat_messages')
      .select('id', { count: 'exact', head: true })
      .eq('session_id', sessionId)
      .eq('user_id', userId),
  ]);

  if ((convCount ?? 0) > 0 || (chatCount ?? 0) > 0) return true;

  // Entity facts tied to utterances from this session (character knowledge survived thread UI loss)
  const { count: linkCount } = await supabaseAdmin
    .from('entity_conversation_links')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('session_id', sessionId);

  return (linkCount ?? 0) > 0;
}

/** True when a thread must not be auto-deleted (empty purge, dedupe, empty-on-open). */
export async function isThreadProtected(userId: string, sessionId: string): Promise<boolean> {
  const [msgCount, hasLinks, hasKnowledge] = await Promise.all([
    threadMessageCount(userId, sessionId),
    threadHasEntityLinks(userId, sessionId),
    threadHasIngestedKnowledge(userId, sessionId),
  ]);
  if (msgCount > 0) return true;
  if (hasLinks) return true;
  if (hasKnowledge) return true;
  return false;
}

export async function recoverOrphanedChatSessions(userId: string): Promise<number> {
  const { data: chatRows } = await supabaseAdmin
    .from('chat_messages')
    .select('session_id')
    .eq('user_id', userId)
    .not('session_id', 'is', null);

  const sessionIds = [...new Set((chatRows ?? []).map((r) => r.session_id as string).filter(Boolean))];
  if (sessionIds.length === 0) return 0;

  const { data: existing } = await supabaseAdmin
    .from('conversation_sessions')
    .select('id')
    .eq('user_id', userId)
    .in('id', sessionIds);

  const existingSet = new Set((existing ?? []).map((r) => r.id));
  const orphaned = sessionIds.filter((id) => !existingSet.has(id));
  if (orphaned.length === 0) return 0;

  let recovered = 0;
  for (const sessionId of orphaned) {
    const messages = await loadThreadMessages(userId, sessionId);
    if (messages.length === 0) continue;

    const firstUser = messages.find((m) => m.role === 'user');
    const titleSnippet = firstUser?.content?.slice(0, 60)?.trim() || 'Recovered conversation';
    const now = new Date().toISOString();

    const { error } = await supabaseAdmin.from('conversation_sessions').insert({
      id: sessionId,
      user_id: userId,
      title: titleSnippet.length > 50 ? `${titleSnippet.slice(0, 47)}…` : titleSnippet,
      started_at: messages[0]?.created_at ?? now,
      created_at: messages[0]?.created_at ?? now,
      updated_at: messages[messages.length - 1]?.created_at ?? now,
      metadata: { recovered: true },
    });

    if (!error) recovered += 1;
  }

  return recovered;
}

/** Recover a single orphaned session if chat_messages exist but conversation_sessions row is missing. */
export async function recoverOrphanSession(userId: string, sessionId: string): Promise<boolean> {
  const { data: existing } = await supabaseAdmin
    .from('conversation_sessions')
    .select('id')
    .eq('id', sessionId)
    .eq('user_id', userId)
    .maybeSingle();

  if (existing) return false;

  const messages = await loadThreadMessages(userId, sessionId);
  if (messages.length === 0) return false;

  const firstUser = messages.find((m) => m.role === 'user');
  const titleSnippet = firstUser?.content?.slice(0, 60)?.trim() || 'Recovered conversation';
  const now = new Date().toISOString();

  const { error } = await supabaseAdmin.from('conversation_sessions').insert({
    id: sessionId,
    user_id: userId,
    title: titleSnippet.length > 50 ? `${titleSnippet.slice(0, 47)}…` : titleSnippet,
    started_at: messages[0]?.created_at ?? now,
    created_at: messages[0]?.created_at ?? now,
    updated_at: messages[messages.length - 1]?.created_at ?? now,
    metadata: { recovered: true },
  });

  return !error;
}

/** Bump updated_at so entity-linked origin threads surface in the thread list. */
export async function touchThreadActivity(userId: string, sessionId: string): Promise<void> {
  await supabaseAdmin
    .from('conversation_sessions')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', sessionId)
    .eq('user_id', userId);
}

export async function getLinkedSessionIds(userId: string): Promise<string[]> {
  const ids = new Set<string>();

  const { data: characters } = await supabaseAdmin
    .from('characters')
    .select('metadata')
    .eq('user_id', userId)
    .limit(500);

  for (const row of characters ?? []) {
    const meta = (row.metadata as Record<string, unknown>) ?? {};
    const origin = meta.origin_thread_id;
    if (typeof origin === 'string') ids.add(origin);
    const threadIds = meta.thread_ids;
    if (Array.isArray(threadIds)) {
      for (const id of threadIds) {
        if (typeof id === 'string') ids.add(id);
      }
    }
  }

  try {
    const { data: links } = await supabaseAdmin
      .from('entity_conversation_links')
      .select('session_id')
      .eq('user_id', userId)
      .limit(200);
    for (const link of links ?? []) {
      if (typeof link.session_id === 'string') ids.add(link.session_id);
    }
  } catch {
    // Table may not exist until migration is applied
  }

  return [...ids];
}

export async function getThreadStatus(userId: string, sessionId: string) {
  const [messages, hasLinks, protectedFlag, linkRows] = await Promise.all([
    loadThreadMessages(userId, sessionId),
    threadHasEntityLinks(userId, sessionId),
    isThreadProtected(userId, sessionId),
    supabaseAdmin
      .from('entity_conversation_links')
      .select('entity_type, entity_id, link_kind, mention_count, first_linked_at')
      .eq('user_id', userId)
      .eq('session_id', sessionId)
      .order('first_linked_at', { ascending: true }),
  ]);

  return {
    sessionId,
    messageCount: messages.length,
    protected: protectedFlag,
    hasEntityLinks: hasLinks,
    linkedEntities: linkRows.data ?? [],
    messages,
  };
}
