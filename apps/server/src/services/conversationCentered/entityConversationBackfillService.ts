import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';
import { entityConversationLinkService } from './entityConversationLinkService';
import { recoverOrphanedChatSessions } from './threadContentService';

export type EntityConversationBackfillResult = {
  recoveredSessions: number;
  charactersProcessed: number;
  linksCreated: number;
  originsSet: number;
  errors: string[];
};

type SessionHit = {
  sessionId: string;
  firstAt: string;
  source: string;
};

async function sessionFromUtteranceId(utteranceId: string, userId: string): Promise<SessionHit | null> {
  const { data: utterance } = await supabaseAdmin
    .from('utterances')
    .select('message_id, created_at')
    .eq('id', utteranceId)
    .eq('user_id', userId)
    .maybeSingle();

  if (!utterance?.message_id) return null;

  const messageId = utterance.message_id as string;

  const { data: convMsg } = await supabaseAdmin
    .from('conversation_messages')
    .select('session_id, created_at')
    .eq('id', messageId)
    .eq('user_id', userId)
    .maybeSingle();

  if (convMsg?.session_id) {
    return {
      sessionId: convMsg.session_id as string,
      firstAt: (convMsg.created_at as string) ?? (utterance.created_at as string),
      source: 'provenance_utterance',
    };
  }

  const { data: chatMsg } = await supabaseAdmin
    .from('chat_messages')
    .select('session_id, created_at')
    .eq('id', messageId)
    .eq('user_id', userId)
    .maybeSingle();

  if (chatMsg?.session_id) {
    return {
      sessionId: chatMsg.session_id as string,
      firstAt: (chatMsg.created_at as string) ?? (utterance.created_at as string),
      source: 'provenance_chat_message',
    };
  }

  return null;
}

async function sessionsFromProvenance(
  userId: string,
  entityIds: string[]
): Promise<SessionHit[]> {
  if (entityIds.length === 0) return [];

  const { data: edges } = await supabaseAdmin
    .from('provenance_edges')
    .select('source_id, source_type, created_at')
    .eq('user_id', userId)
    .eq('relation', 'MENTIONED_ENTITY')
    .in('target_id', entityIds)
    .order('created_at', { ascending: true });

  const hits: SessionHit[] = [];
  for (const edge of edges ?? []) {
    if (edge.source_type === 'utterance') {
      const hit = await sessionFromUtteranceId(edge.source_id as string, userId);
      if (hit) hits.push(hit);
    }
  }
  return hits;
}

async function sessionsFromMessageSearch(
  userId: string,
  searchTerms: string[]
): Promise<SessionHit[]> {
  const hits: SessionHit[] = [];
  const seen = new Set<string>();

  for (const term of searchTerms) {
    if (!term || term.length < 3) continue;
    const pattern = `%${term.replace(/[%_]/g, '')}%`;

    const [{ data: chatMsgs }, { data: convMsgs }] = await Promise.all([
      supabaseAdmin
        .from('chat_messages')
        .select('session_id, created_at')
        .eq('user_id', userId)
        .ilike('content', pattern)
        .order('created_at', { ascending: true })
        .limit(50),
      supabaseAdmin
        .from('conversation_messages')
        .select('session_id, created_at')
        .eq('user_id', userId)
        .ilike('content', pattern)
        .order('created_at', { ascending: true })
        .limit(50),
    ]);

    for (const row of [...(chatMsgs ?? []), ...(convMsgs ?? [])]) {
      const sessionId = row.session_id as string;
      if (!sessionId || seen.has(sessionId)) continue;
      seen.add(sessionId);
      hits.push({
        sessionId,
        firstAt: row.created_at as string,
        source: 'message_search',
      });
    }
  }

  return hits;
}

async function sessionsFromDominantEntities(
  userId: string,
  searchTerms: string[]
): Promise<SessionHit[]> {
  const { data: sessions } = await supabaseAdmin
    .from('conversation_sessions')
    .select('id, updated_at, metadata')
    .eq('user_id', userId)
    .order('updated_at', { ascending: true })
    .limit(500);

  const hits: SessionHit[] = [];
  const lowerTerms = searchTerms.map((t) => t.toLowerCase()).filter((t) => t.length >= 3);

  for (const session of sessions ?? []) {
    const entities = (session.metadata as Record<string, unknown>)?.dominantEntities;
    if (!Array.isArray(entities)) continue;
    const match = entities.some((e) =>
      lowerTerms.some((term) => String(e).toLowerCase().includes(term))
    );
    if (match) {
      hits.push({
        sessionId: session.id,
        firstAt: session.updated_at as string,
        source: 'dominant_entities',
      });
    }
  }

  return hits;
}

function mergeSessionHits(hits: SessionHit[]): SessionHit[] {
  const bySession = new Map<string, SessionHit>();
  for (const hit of hits) {
    const existing = bySession.get(hit.sessionId);
    if (!existing || new Date(hit.firstAt) < new Date(existing.firstAt)) {
      bySession.set(hit.sessionId, hit);
    }
  }
  return [...bySession.values()].sort(
    (a, b) => new Date(a.firstAt).getTime() - new Date(b.firstAt).getTime()
  );
}

export async function backfillEntityConversationLinksForUser(
  userId: string,
  options: { characterId?: string; characterName?: string } = {}
): Promise<EntityConversationBackfillResult> {
  const result: EntityConversationBackfillResult = {
    recoveredSessions: 0,
    charactersProcessed: 0,
    linksCreated: 0,
    originsSet: 0,
    errors: [],
  };

  try {
    result.recoveredSessions = await recoverOrphanedChatSessions(userId);
  } catch (err) {
    result.errors.push(`recoverOrphaned: ${err instanceof Error ? err.message : String(err)}`);
  }

  let charQuery = supabaseAdmin
    .from('characters')
    .select('id, name, alias, metadata')
    .eq('user_id', userId);

  if (options.characterId) charQuery = charQuery.eq('id', options.characterId);
  if (options.characterName) charQuery = charQuery.ilike('name', options.characterName.trim());

  const { data: characters, error: charErr } = await charQuery;
  if (charErr) {
    result.errors.push(charErr.message);
    return result;
  }

  for (const character of characters ?? []) {
    result.charactersProcessed += 1;
    const meta = (character.metadata as Record<string, unknown>) ?? {};
    const omegaId = meta.omega_entity_id as string | undefined;
    const entityIds = [character.id, ...(omegaId ? [omegaId] : [])];

    const searchTerms = [
      character.name,
      ...(Array.isArray(character.alias) ? character.alias : []),
    ].filter(Boolean) as string[];

    try {
      const hits = mergeSessionHits([
        ...(await sessionsFromProvenance(userId, entityIds)),
        ...(await sessionsFromMessageSearch(userId, searchTerms)),
        ...(await sessionsFromDominantEntities(userId, searchTerms)),
        ...(meta.origin_thread_id
          ? [
              {
                sessionId: meta.origin_thread_id as string,
                firstAt: new Date(0).toISOString(),
                source: 'metadata',
              },
            ]
          : []),
      ]);

      if (hits.length === 0) continue;

      const threadIds = hits.map((h) => h.sessionId);
      await supabaseAdmin
        .from('characters')
        .update({
          metadata: {
            ...meta,
            origin_thread_id: meta.origin_thread_id ?? hits[0].sessionId,
            thread_ids: [...new Set([...(Array.isArray(meta.thread_ids) ? meta.thread_ids : []), ...threadIds])],
          },
        })
        .eq('id', character.id)
        .eq('user_id', userId);

      const { count: existingOrigin } = await supabaseAdmin
        .from('entity_conversation_links')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('entity_type', 'character')
        .eq('entity_id', character.id)
        .eq('link_kind', 'origin');

      let originAssigned = (existingOrigin ?? 0) > 0;

      for (let i = 0; i < hits.length; i++) {
        const hit = hits[i];
        const linkKind = !originAssigned && i === 0 ? 'origin' : 'mention';
        await entityConversationLinkService.linkEntity(
          userId,
          'character',
          character.id,
          hit.sessionId,
          { linkKind, entityName: character.name }
        );
        result.linksCreated += 1;
        if (linkKind === 'origin') {
          originAssigned = true;
          result.originsSet += 1;
        }
      }

      logger.info(
        { characterId: character.id, name: character.name, sessions: hits.length },
        'Backfilled entity conversation links'
      );
    } catch (err) {
      const msg = `${character.name}: ${err instanceof Error ? err.message : String(err)}`;
      result.errors.push(msg);
      logger.warn({ err, characterId: character.id }, 'Entity conversation backfill failed for character');
    }
  }

  return result;
}
