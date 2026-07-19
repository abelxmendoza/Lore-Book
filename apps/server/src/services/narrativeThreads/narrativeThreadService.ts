/**
 * Narrative Thread Service — load inputs and derive Active Narrative Threads.
 *
 * Thread state is always computed fresh from durable arcs + recent lived
 * evidence; nothing is persisted, so it can never go stale.
 */

import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';
import {
  deriveNarrativeThreads,
  formatThreadsPromptBlock,
  THREAD_ACTIVITY_WINDOW_DAYS,
  type NarrativeThread,
  type ThreadActivityItem,
  type ThreadArcInput,
} from './narrativeThreadEngine';

const DAY_MS = 24 * 60 * 60 * 1000;

async function loadArcs(userId: string): Promise<ThreadArcInput[]> {
  const { data, error } = await supabaseAdmin
    .from('life_arcs')
    .select('id, title, track, tags, summary, updated_at, is_active')
    .eq('user_id', userId)
    .eq('is_active', true)
    .order('updated_at', { ascending: false })
    .limit(30);
  if (error || !data) return [];
  return data.map((row) => ({
    id: row.id,
    title: row.title ?? 'Untitled arc',
    category: (row.track as string | null) ?? null,
    tags: Array.isArray(row.tags) ? (row.tags as string[]) : [],
    summary: (row.summary as string | null) ?? null,
    updatedAt: (row.updated_at as string | null) ?? null,
    isActive: Boolean(row.is_active),
  }));
}

async function loadActivity(userId: string): Promise<ThreadActivityItem[]> {
  const windowStart = new Date(Date.now() - THREAD_ACTIVITY_WINDOW_DAYS * DAY_MS).toISOString();
  const items: ThreadActivityItem[] = [];

  const [moments, scenes] = await Promise.all([
    supabaseAdmin
      .from('narrative_moments')
      .select('summary, participants, occurred_at, created_at, significance_score')
      .eq('user_id', userId)
      .gte('created_at', windowStart)
      .order('created_at', { ascending: false })
      .limit(200),
    supabaseAdmin
      .from('narrative_scenes')
      .select('title, summary, participants, time_start, created_at, significance_score')
      .eq('user_id', userId)
      .gte('created_at', windowStart)
      .order('created_at', { ascending: false })
      .limit(100),
  ]);

  for (const row of moments.data ?? []) {
    items.push({
      text: row.summary ?? '',
      participants: Array.isArray(row.participants) ? (row.participants as string[]) : [],
      at: (row.occurred_at as string | null) ?? (row.created_at as string | null),
      significance: (row.significance_score as number | null) ?? undefined,
    });
  }
  for (const row of scenes.data ?? []) {
    items.push({
      text: `${row.title ?? ''} ${row.summary ?? ''}`,
      participants: Array.isArray(row.participants) ? (row.participants as string[]) : [],
      at: (row.time_start as string | null) ?? (row.created_at as string | null),
      significance: (row.significance_score as number | null) ?? undefined,
    });
  }
  return items;
}

export async function listNarrativeThreads(userId: string): Promise<NarrativeThread[]> {
  try {
    const [arcs, activity] = await Promise.all([loadArcs(userId), loadActivity(userId)]);
    if (arcs.length === 0) return [];
    return deriveNarrativeThreads({ arcs, activity });
  } catch (err) {
    logger.warn({ err, userId }, 'narrativeThreads: derivation failed');
    return [];
  }
}

/** Prompt block for chat, or null when the user has no live threads. */
export async function buildThreadsPromptBlock(userId: string): Promise<string | null> {
  const threads = await listNarrativeThreads(userId);
  return formatThreadsPromptBlock(threads);
}
