/**
 * What Changed Since Last Time — session delta surface
 *
 * Factual only: every line traces to rows created/updated after `since`.
 * No speculation. No OpenAI. Read-only over existing stores.
 *
 * Distinct from return points (unfinished waits):
 * this answers "what completed or appeared while I was away?"
 */

import { supabaseAdmin } from '../supabaseClient';
import { rankSessionDelta, type SessionDeltaResult } from './sessionDelta';

export type ReinforcedEntity = {
  name: string;
  newMentionCount: number;
};

export type WhatChangedSummary = {
  since: string;
  gapDays: number;
  newMemoryCount: number;
  newChatMessageCount: number;
  newCharacters: Array<{ id: string; name: string }>;
  newTimelineEventCount: number;
  strongestTheme: string | null;
  reinforcedEntities: ReinforcedEntity[];
  completedGoals: string[];
  abandonedGoals: string[];
  newMeaningLabels: string[];
  hasChanges: boolean;
  /** Ranked quiet lines (max 3) */
  delta: SessionDeltaResult;
};

const MAX_REINFORCED_ENTITIES = 3;

/**
 * Compute a factual delta of what the system recorded/learned between
 * `sinceIso` and now, scoped to one user.
 */
export async function getWhatChangedSinceLastVisit(
  userId: string,
  sinceIso: string,
): Promise<WhatChangedSummary> {
  const since = new Date(sinceIso);
  const gapDays = Math.max(0, (Date.now() - since.getTime()) / 86_400_000);

  const [
    entriesRes,
    charactersRes,
    eventsCountRes,
    biographyRes,
    chatRes,
    goalsRes,
    meaningRes,
  ] = await Promise.all([
    supabaseAdmin
      .from('journal_entries')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gt('date', sinceIso),
    supabaseAdmin
      .from('characters')
      .select('id, name, created_at, metadata')
      .eq('user_id', userId),
    supabaseAdmin
      .from('character_timeline_events')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gt('created_at', sinceIso),
    supabaseAdmin
      .from('narrative_accounts')
      .select('metadata')
      .eq('user_id', userId)
      .eq('account_type', 'biography_snapshot')
      .maybeSingle(),
    supabaseAdmin
      .from('chat_messages')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('role', 'user')
      .gt('created_at', sinceIso),
    supabaseAdmin
      .from('goals')
      .select('id, title, status, updated_at')
      .eq('user_id', userId)
      .gt('updated_at', sinceIso)
      .limit(20),
    supabaseAdmin
      .from('autobiographical_meaning_artifacts')
      .select('id, display_label, status, created_at, updated_at')
      .eq('user_id', userId)
      .eq('status', 'ACTIVE')
      .gt('created_at', sinceIso)
      .order('confidence', { ascending: false })
      .limit(8),
  ]);

  const allCharacters = charactersRes.data ?? [];

  const newCharacters = allCharacters
    .filter((c) => c.created_at && new Date(c.created_at) > since)
    .map((c) => ({ id: c.id, name: c.name }));

  const existingCharacters = allCharacters.filter((c) => !newCharacters.find((nc) => nc.id === c.id));

  const reinforcedEntities = await computeReinforcedEntities(existingCharacters, since);

  const themes = (biographyRes.data?.metadata as { themes?: Array<{ theme?: string }> } | null)?.themes ?? [];
  const strongestTheme: string | null = themes[0]?.theme ?? null;

  const newMemoryCount = entriesRes.count ?? 0;
  const newChatMessageCount = chatRes.count ?? 0;
  const newTimelineEventCount = eventsCountRes.count ?? 0;

  const completedGoals: string[] = [];
  const abandonedGoals: string[] = [];
  for (const g of goalsRes.data ?? []) {
    const title = String((g as { title?: string }).title ?? '').trim();
    if (!title) continue;
    const status = String((g as { status?: string }).status ?? '');
    if (status === 'completed') completedGoals.push(title);
    if (status === 'abandoned') abandonedGoals.push(title);
  }

  const newMeaningLabels = (meaningRes.data ?? [])
    .map((r) => String((r as { display_label?: string }).display_label ?? '').trim())
    .filter(Boolean)
    .slice(0, 4);

  const delta = rankSessionDelta({
    gapDays,
    newMemoryCount,
    newChatMessageCount,
    newCharacters,
    newTimelineEventCount,
    reinforcedEntities,
    completedGoals,
    abandonedGoals,
    newMeaningLabels,
    strongestTheme,
  });

  return {
    since: sinceIso,
    gapDays,
    newMemoryCount,
    newChatMessageCount,
    newCharacters,
    newTimelineEventCount,
    strongestTheme,
    reinforcedEntities,
    completedGoals,
    abandonedGoals,
    newMeaningLabels,
    hasChanges: delta.hasChanges,
    delta,
  };
}

async function computeReinforcedEntities(
  existingCharacters: Array<{ id: string; name: string; metadata: unknown }>,
  since: Date,
): Promise<ReinforcedEntity[]> {
  const entryIdsByCharacter = new Map<string, string[]>();
  const allEntryIds = new Set<string>();

  for (const char of existingCharacters) {
    const meta = char.metadata as { source_entry_ids?: string[] } | null;
    const ids: string[] = meta?.source_entry_ids ?? [];
    if (!ids.length) continue;
    entryIdsByCharacter.set(char.id, ids);
    for (const id of ids) allEntryIds.add(id);
  }

  if (allEntryIds.size === 0) return [];

  const { data: entries } = await supabaseAdmin
    .from('journal_entries')
    .select('id, date')
    .in('id', [...allEntryIds]);

  const newEntryIds = new Set(
    (entries ?? [])
      .filter((e) => e.date && new Date(e.date) > since)
      .map((e) => e.id),
  );

  if (newEntryIds.size === 0) return [];

  const reinforced: ReinforcedEntity[] = [];
  for (const char of existingCharacters) {
    const ids = entryIdsByCharacter.get(char.id);
    if (!ids) continue;
    const newMentionCount = ids.filter((id) => newEntryIds.has(id)).length;
    if (newMentionCount > 0) reinforced.push({ name: char.name, newMentionCount });
  }

  return reinforced
    .sort((a, b) => b.newMentionCount - a.newMentionCount)
    .slice(0, MAX_REINFORCED_ENTITIES);
}

/**
 * Render the summary as short factual lines (max 3).
 * Prefers ranked session delta when present.
 */
export function formatWhatChangedLines(summary: WhatChangedSummary): string[] {
  if (summary.delta?.lines?.length) {
    return summary.delta.lines.slice(0, 3);
  }

  // Legacy fallback if delta missing
  const lines: string[] = [];
  if (summary.newMemoryCount > 0) {
    lines.push(
      `${summary.newMemoryCount} new ${summary.newMemoryCount === 1 ? 'memory' : 'memories'} recorded`,
    );
  }
  if (summary.newCharacters.length > 0) {
    const names = summary.newCharacters.map((c) => c.name).join(', ');
    lines.push(
      `${summary.newCharacters.length} new ${summary.newCharacters.length === 1 ? 'character' : 'characters'} detected — ${names}`,
    );
  }
  if (summary.newTimelineEventCount > 0) {
    lines.push(
      `${summary.newTimelineEventCount} new timeline ${summary.newTimelineEventCount === 1 ? 'event' : 'events'} generated`,
    );
  }
  for (const entity of summary.reinforcedEntities) {
    lines.push(
      `${entity.name} appeared in ${entity.newMentionCount} additional ${entity.newMentionCount === 1 ? 'memory' : 'memories'}`,
    );
  }
  return lines.slice(0, 3);
}
