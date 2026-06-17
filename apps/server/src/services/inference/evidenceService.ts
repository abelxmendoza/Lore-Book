/**
 * Shared story evidence loader — single source for chat, journal, and events.
 * All domain inferencers should consume this instead of re-querying separately.
 */
import { supabaseAdmin } from '../supabaseClient';

export type StoryEpisode = {
  source: 'chat' | 'journal';
  id: string;
  text: string;
  at?: string;
};

export type ResolvedEventRef = {
  id?: string;
  title?: string;
  summary?: string;
  people: string[];
};

export type StoryEvidence = {
  episodes: StoryEpisode[];
  resolvedEvents: ResolvedEventRef[];
  omegaToCharacterId: Map<string, string>;
  loadedAt: string;
};

type CacheEntry = { evidence: StoryEvidence; expiresAt: number };
const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 2 * 60 * 1000;

export async function loadStoryEvidence(
  userId: string,
  opts: { limit?: number; useCache?: boolean } = {}
): Promise<StoryEvidence> {
  const limit = opts.limit ?? 1500;
  const useCache = opts.useCache !== false;
  const cacheKey = `${userId}:${limit}`;
  if (useCache) {
    const hit = cache.get(cacheKey);
    if (hit && hit.expiresAt > Date.now()) return hit.evidence;
  }

  const [journals, chats, characters, events] = await Promise.all([
    supabaseAdmin
      .from('journal_entries')
      .select('id, content, date')
      .eq('user_id', userId)
      .order('date', { ascending: false })
      .limit(limit),
    supabaseAdmin
      .from('chat_messages')
      .select('id, content, created_at')
      .eq('user_id', userId)
      .eq('role', 'user')
      .order('created_at', { ascending: false })
      .limit(limit),
    supabaseAdmin
      .from('characters')
      .select('id, metadata')
      .eq('user_id', userId)
      .neq('status', 'archived'),
    supabaseAdmin
      .from('resolved_events')
      .select('id, title, summary, people')
      .eq('user_id', userId)
      .order('start_time', { ascending: false })
      .limit(400),
  ]);

  const episodes: StoryEpisode[] = [];
  for (const j of journals.data ?? []) {
    if (typeof j.content === 'string' && j.content.trim()) {
      episodes.push({ source: 'journal', id: j.id, text: j.content, at: j.date ?? undefined });
    }
  }
  for (const c of chats.data ?? []) {
    if (typeof c.content === 'string' && c.content.trim()) {
      episodes.push({ source: 'chat', id: c.id, text: c.content, at: c.created_at ?? undefined });
    }
  }

  const omegaToCharacterId = new Map<string, string>();
  for (const ch of characters.data ?? []) {
    const oid = (ch.metadata as Record<string, unknown> | null)?.omega_entity_id;
    if (typeof oid === 'string') omegaToCharacterId.set(oid, ch.id);
  }

  const resolvedEvents: ResolvedEventRef[] = (events.data ?? []).map((ev) => ({
    id: ev.id,
    title: ev.title ?? undefined,
    summary: ev.summary ?? undefined,
    people: Array.isArray(ev.people) ? (ev.people as string[]) : [],
  }));

  const evidence: StoryEvidence = {
    episodes,
    resolvedEvents,
    omegaToCharacterId,
    loadedAt: new Date().toISOString(),
  };

  cache.set(cacheKey, { evidence, expiresAt: Date.now() + CACHE_TTL_MS });
  return evidence;
}

export function invalidateStoryEvidenceCache(userId?: string): void {
  if (!userId) {
    cache.clear();
    return;
  }
  for (const key of cache.keys()) {
    if (key.startsWith(`${userId}:`)) cache.delete(key);
  }
}
