/**
 * Context-aware memory retrieval for Current Context (thread or timeline node).
 * Used by buildRAGPacket when currentContext is set.
 */

import { logger } from '../../logger';
import type { MemoryEntry } from '../../types';
import type { TimelineContextLayer } from '../../types/currentContext';
import { supabaseAdmin } from '../supabaseClient';

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
      .select('*')
      .eq('user_id', userId)
      .in('chapter_id', chapterIds)
      .order('date', { ascending: false })
      .limit(limit);

    if (entErr) {
      logger.warn({ error: entErr, userId, threadId }, 'Failed to fetch entries by thread');
      return [];
    }
    return (entries ?? []) as MemoryEntry[];
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
      .select('*')
      .eq('user_id', userId)
      .in('chapter_id', chapterIds)
      .order('date', { ascending: false })
      .limit(limit);

    if (error) {
      logger.warn({ error, userId, timelineNodeId, timelineLayer }, 'Failed to fetch entries under node');
      return [];
    }
    return (entries ?? []) as MemoryEntry[];
  } catch (err) {
    logger.warn({ err, userId, timelineNodeId, timelineLayer }, 'retrieveMemoriesUnderNode failed');
    return [];
  }
}
