/**
 * Context-aware memory retrieval for Current Context (thread or timeline node).
 * Used by buildRAGPacket when currentContext is set.
 */

import { logger } from '../../logger';
import type { MemoryEntry } from '../../types';
import type { TimelineContextLayer } from '../../types/currentContext';
import { supabaseAdmin } from '../supabaseClient';
import { JOURNAL_COLS } from '../../db/journalEntryColumns';

const DEFAULT_LIMIT = 30;

/**
 * Retrieve journal entries whose chapter belongs to arcs/sagas that are members of the given thread.
 */
export async function retrieveMemoriesByThread(
  userId: string,
  threadId: string,
  limit: number = DEFAULT_LIMIT
): Promise<MemoryEntry[]> {
  try {
    const { data: memberships, error: memErr } = await supabaseAdmin
      .from('thread_memberships')
      .select('node_id, node_type')
      .eq('thread_id', threadId);

    if (memErr || !memberships?.length) {
      logger.debug({ userId, threadId, error: memErr }, 'No thread memberships for context-aware retrieval');
      return [];
    }

    const sagaIds: string[] = [];
    const arcIds: string[] = [];
    for (const m of memberships) {
      if (m.node_type === 'saga') sagaIds.push(m.node_id);
      if (m.node_type === 'arc') arcIds.push(m.node_id);
    }

    // Arcs under those sagas
    if (sagaIds.length > 0) {
      const { data: arcsUnderSagas } = await supabaseAdmin
        .from('timeline_arcs')
        .select('id')
        .in('parent_id', sagaIds)
        .eq('user_id', userId);
      if (arcsUnderSagas?.length) {
        arcIds.push(...arcsUnderSagas.map((a: { id: string }) => a.id));
      }
    }

    const uniqueArcIds = [...new Set(arcIds)];
    if (uniqueArcIds.length === 0) {
      return [];
    }

    const { data: chapters, error: chErr } = await supabaseAdmin
      .from('chapters')
      .select('id')
      .in('parent_id', uniqueArcIds)
      .eq('user_id', userId);

    if (chErr || !chapters?.length) {
      logger.debug({ userId, threadId }, 'No chapters under thread arcs for context-aware retrieval');
      return [];
    }

    const chapterIds = chapters.map((c: { id: string }) => c.id);
    const { data: entries, error: entErr } = await supabaseAdmin
      .from('journal_entries')
      .select(JOURNAL_COLS)
      .eq('user_id', userId)
      .in('chapter_id', chapterIds)
      .order('date', { ascending: false })
      .limit(limit);

    if (entErr) {
      logger.warn({ error: entErr, userId, threadId }, 'Failed to fetch entries by thread');
      return [];
    }
    const fetched = (entries ?? []) as MemoryEntry[];
    // Fire-and-forget retrieval reinforcement
    const ids = fetched.map(e => e.id).filter(Boolean);
    if (ids.length > 0) {
      Promise.resolve(supabaseAdmin.rpc('bump_retrieval_count', { entry_ids: ids }))
        .catch(() => {});
    }
    return fetched;
  } catch (err) {
    logger.warn({ err, userId, threadId }, 'retrieveMemoriesByThread failed');
    return [];
  }
}

/**
 * Resolve chapter ids under the given timeline node (era/saga/arc/chapter).
 */
async function getChapterIdsUnderNode(
  userId: string,
  timelineNodeId: string,
  timelineLayer: TimelineContextLayer
): Promise<string[]> {
  if (timelineLayer === 'chapter') {
    return [timelineNodeId];
  }
  if (timelineLayer === 'arc') {
    const { data: chapters } = await supabaseAdmin
      .from('chapters')
      .select('id')
      .eq('parent_id', timelineNodeId)
      .eq('user_id', userId);
    return (chapters ?? []).map((c: { id: string }) => c.id);
  }
  if (timelineLayer === 'saga') {
    const { data: arcs } = await supabaseAdmin
      .from('timeline_arcs')
      .select('id')
      .eq('parent_id', timelineNodeId)
      .eq('user_id', userId);
    if (!arcs?.length) return [];
    const arcIds = arcs.map((a: { id: string }) => a.id);
    const { data: chapters } = await supabaseAdmin
      .from('chapters')
      .select('id')
      .in('parent_id', arcIds)
      .eq('user_id', userId);
    return (chapters ?? []).map((c: { id: string }) => c.id);
  }
  if (timelineLayer === 'era') {
    const { data: sagas } = await supabaseAdmin
      .from('timeline_sagas')
      .select('id')
      .eq('parent_id', timelineNodeId)
      .eq('user_id', userId);
    if (!sagas?.length) return [];
    const sagaIds = sagas.map((s: { id: string }) => s.id);
    const { data: arcs } = await supabaseAdmin
      .from('timeline_arcs')
      .select('id')
      .in('parent_id', sagaIds)
      .eq('user_id', userId);
    if (!arcs?.length) return [];
    const arcIds = arcs.map((a: { id: string }) => a.id);
    const { data: chapters } = await supabaseAdmin
      .from('chapters')
      .select('id')
      .in('parent_id', arcIds)
      .eq('user_id', userId);
    return (chapters ?? []).map((c: { id: string }) => c.id);
  }
  return [];
}

/**
 * Given character names mentioned in the current message, find what the user
 * said about those same entities across ANY thread.
 *
 * Two sources, merged journal-first:
 *   1. journal_entries via character_memories (canonical character ↔ entry link)
 *   2. chat_messages via name match — chat ingestion produces entry_ir, NOT
 *      journal entries, so chat-borne mentions are invisible to source 1.
 *      Without this, cross-thread recall never works for chat conversations.
 */
export async function retrieveEntityMentionsAcrossThreads(
  userId: string,
  message: string,
  knownCharacters: Array<{ id: string; name: string }>,
  limit: number = 10
): Promise<MemoryEntry[]> {
  try {
    if (knownCharacters.length === 0) return [];

    const messageLower = message.toLowerCase();
    const mentionedChars = knownCharacters.filter(
      (c) => c.name && messageLower.includes(c.name.toLowerCase())
    );
    const mentionedNames = mentionedChars.map((c) => c.name);
    const mentionedCharIds = mentionedChars.map((c) => c.id);

    if (mentionedNames.length === 0) return [];

    // ── Source 1: journal entries via character_memories ───────────────────
    const journalEntries: MemoryEntry[] = [];
    const entryIdSet = new Set<string>();

    if (mentionedCharIds.length > 0) {
      const { data: memoryRows, error: memoryError } = await supabaseAdmin
        .from('character_memories')
        .select('journal_entry_id')
        .eq('user_id', userId)
        .in('character_id', mentionedCharIds);

      if (memoryError) {
        logger.warn({ memoryError, userId }, 'retrieveEntityMentionsAcrossThreads character_memories failed');
      } else {
        for (const row of (memoryRows ?? []) as Array<{ journal_entry_id: string | null }>) {
          if (row.journal_entry_id) entryIdSet.add(row.journal_entry_id);
        }
      }
    }

    if (entryIdSet.size > 0) {
      const entryIds = [...entryIdSet].slice(0, limit * 4);
      const { data: entries } = await supabaseAdmin
        .from('journal_entries')
        .select(JOURNAL_COLS)
        .eq('user_id', userId)
        .in('id', entryIds)
        .order('date', { ascending: false })
        .limit(limit);
      journalEntries.push(...((entries ?? []) as MemoryEntry[]));
    }

    // ── Source 2: past chat messages naming the entity ─────────────────────
    const chatMentions: MemoryEntry[] = [];
    const remaining = limit - journalEntries.length;
    if (remaining > 0) {
      // One ILIKE per name (max 2 names keeps this cheap); user messages only —
      // assistant replies would echo recall back into recall.
      const nameFilters = mentionedNames.slice(0, 2);
      for (const name of nameFilters) {
        const { data: msgs } = await supabaseAdmin
          .from('chat_messages')
          .select('id, content, created_at, session_id')
          .eq('user_id', userId)
          .eq('role', 'user')
          .ilike('content', `%${name}%`)
          .order('created_at', { ascending: false })
          .limit(remaining);
        for (const m of (msgs ?? []) as Array<{ id: string; content: string; created_at: string; session_id: string }>) {
          chatMentions.push({
            id: m.id,
            user_id: userId,
            content: m.content,
            date: m.created_at,
            summary: null,
            tags: [],
            source: 'chat',
            metadata: { session_id: m.session_id, cross_thread_mention: true },
          } as unknown as MemoryEntry);
        }
      }
    }

    // Merge journal-first, dedup by id, cap at limit
    const seen = new Set<string>();
    const merged: MemoryEntry[] = [];
    for (const e of [...journalEntries, ...chatMentions]) {
      if (seen.has((e as { id: string }).id)) continue;
      seen.add((e as { id: string }).id);
      merged.push(e);
      if (merged.length >= limit) break;
    }
    return merged;
  } catch (err) {
    logger.warn({ err, userId }, 'retrieveEntityMentionsAcrossThreads failed');
    return [];
  }
}

/**
 * Retrieve journal entries under the given timeline node (era/saga/arc/chapter).
 */
export async function retrieveMemoriesUnderNode(
  userId: string,
  timelineNodeId: string,
  timelineLayer: TimelineContextLayer,
  limit: number = DEFAULT_LIMIT
): Promise<MemoryEntry[]> {
  try {
    const chapterIds = await getChapterIdsUnderNode(userId, timelineNodeId, timelineLayer);
    if (chapterIds.length === 0) {
      logger.debug({ userId, timelineNodeId, timelineLayer }, 'No chapters under node for context-aware retrieval');
      return [];
    }

    const { data: entries, error } = await supabaseAdmin
      .from('journal_entries')
      .select(JOURNAL_COLS)
      .eq('user_id', userId)
      .in('chapter_id', chapterIds)
      .order('date', { ascending: false })
      .limit(limit);

    if (error) {
      logger.warn({ error, userId, timelineNodeId, timelineLayer }, 'Failed to fetch entries under node');
      return [];
    }
    const fetched = (entries ?? []) as MemoryEntry[];
    // Fire-and-forget retrieval reinforcement
    const ids = fetched.map(e => e.id).filter(Boolean);
    if (ids.length > 0) {
      Promise.resolve(supabaseAdmin.rpc('bump_retrieval_count', { entry_ids: ids }))
        .catch(() => {});
    }
    return fetched;
  } catch (err) {
    logger.warn({ err, userId, timelineNodeId, timelineLayer }, 'retrieveMemoriesUnderNode failed');
    return [];
  }
}
