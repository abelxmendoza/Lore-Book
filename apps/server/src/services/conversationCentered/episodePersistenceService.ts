/**
 * Episode Persistence (Episode Activation Sprint — Phase 3).
 *
 * Loads chat_messages → builds SegMessage[] → segmentEpisodes → persists rows
 * with full provenance. Pure segmentation lives in episodeSegmentationCore.
 */

import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';
import { segmentEpisodes, type Episode, type SegMessage } from './episodeSegmentationCore';
import { loadThreadMessages } from './threadContentService';

export interface EpisodeRow {
  id: string;
  user_id: string;
  source_thread_id: string;
  episode_index: number;
  title: string;
  start_at: string;
  end_at: string;
  boundary_reason: string;
  source_message_ids: string[];
  source_entity_ids: string[];
  source_location_ids: string[];
  source_event_ids: string[];
  participant_ids: string[];
  location_ids: string[];
}

export interface PersistEpisodesResult {
  threadId: string;
  episodeCount: number;
  created: number;
  messagesTotal: number;
  activeEpisodeId: string | null;
  activeEpisodeLabel: string | null;
  episodeLabels: string[];
  episodes: EpisodeRow[];
  coverage: {
    messagesWithEntities: number;
    messagesWithLocations: number;
    episodesWithEvents: number;
    episodesWithParticipants: number;
    avgMessagesPerEpisode: number;
  };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function asUuidArray(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((x): x is string => typeof x === 'string' && UUID_RE.test(x));
}

function buildSegMessages(
  messages: Awaited<ReturnType<typeof loadThreadMessages>>
): SegMessage[] {
  return messages.map((m) => {
    const meta = m.metadata ?? {};
    return {
      id: m.id,
      role: m.role,
      content: m.content,
      created_at: m.created_at,
      entityIds: asUuidArray(meta.entity_ids),
      locationIds: asUuidArray(meta.location_ids),
    };
  });
}

function formatBoundaryReason(reason: string): string {
  return reason
    .replace(/time-gap\((\d+)h\)/g, '$1h gap')
    .replace(/\+/g, ' · ');
}

export function buildEpisodeTitle(ep: Episode, nameById: Map<string, string>): string {
  if (ep.boundaryReason === 'thread-start' && ep.index === 0) {
    const loc = ep.locations[0] ? nameById.get(ep.locations[0]) : null;
    if (loc) return loc;
    const person = ep.participants[0] ? nameById.get(ep.participants[0]) : null;
    if (person) return `Start · ${person}`;
    return 'Thread start';
  }

  const parts: string[] = [];
  if (ep.locations[0]) {
    const loc = nameById.get(ep.locations[0]);
    if (loc) parts.push(loc);
  }
  const people = ep.participants
    .slice(0, 2)
    .map((id) => nameById.get(id))
    .filter((n): n is string => !!n?.trim());
  if (people.length) parts.push(people.join(' & '));
  if (parts.length) return parts.join(' · ');

  const formatted = formatBoundaryReason(ep.boundaryReason);
  return formatted || `Episode ${ep.index + 1}`;
}

async function resolveEntityNames(userId: string, ids: string[]): Promise<Map<string, string>> {
  const nameById = new Map<string, string>();
  if (ids.length === 0) return nameById;

  const unique = [...new Set(ids)];
  const [{ data: omega }, { data: chars }, { data: locs }] = await Promise.all([
    supabaseAdmin.from('omega_entities').select('id, primary_name').eq('user_id', userId).in('id', unique),
    supabaseAdmin.from('characters').select('id, name').eq('user_id', userId).in('id', unique),
    supabaseAdmin.from('locations').select('id, name').eq('user_id', userId).in('id', unique),
  ]);

  for (const row of omega ?? []) {
    if (row.primary_name) nameById.set(row.id, row.primary_name);
  }
  for (const row of chars ?? []) {
    if (row.name && !nameById.has(row.id)) nameById.set(row.id, row.name);
  }
  for (const row of locs ?? []) {
    if (row.name && !nameById.has(row.id)) nameById.set(row.id, row.name);
  }
  return nameById;
}

async function resolveEventIds(
  userId: string,
  startAt: string,
  endAt: string,
  participantIds: string[]
): Promise<string[]> {
  const { data } = await supabaseAdmin
    .from('resolved_events')
    .select('id, people, start_time')
    .eq('user_id', userId)
    .gte('start_time', startAt)
    .lte('start_time', endAt);

  const participantSet = new Set(participantIds);
  return (data ?? [])
    .filter((evt) => {
      if (participantSet.size === 0) return true;
      const people = (evt.people as string[] | null) ?? [];
      return people.some((p) => participantSet.has(p));
    })
    .map((evt) => evt.id);
}

/** Re-segment a thread and replace persisted episodes. Idempotent per thread. */
export async function persistEpisodesForThread(
  userId: string,
  threadId: string
): Promise<PersistEpisodesResult> {
  const messages = await loadThreadMessages(userId, threadId);
  const segMessages = buildSegMessages(messages);

  if (segMessages.length === 0) {
    return {
      threadId,
      episodeCount: 0,
      created: 0,
      messagesTotal: 0,
      activeEpisodeId: null,
      activeEpisodeLabel: null,
      episodeLabels: [],
      episodes: [],
      coverage: {
        messagesWithEntities: 0,
        messagesWithLocations: 0,
        episodesWithEvents: 0,
        episodesWithParticipants: 0,
        avgMessagesPerEpisode: 0,
      },
    };
  }

  const segmented = segmentEpisodes(segMessages);
  const allEntityIds = [...new Set(segmented.flatMap((e) => e.participants))];
  const nameById = await resolveEntityNames(userId, [...allEntityIds, ...segmented.flatMap((e) => e.locations)]);

  const rows: Omit<EpisodeRow, 'id'>[] = [];
  for (const ep of segmented) {
    const participantIds = ep.participants.filter((id) => UUID_RE.test(id));
    const locationIds = ep.locations.filter((id) => UUID_RE.test(id));
    const messageIds = ep.messageIds.filter((id) => UUID_RE.test(id));
    if (messageIds.length === 0) continue;

    const sourceEventIds = await resolveEventIds(userId, ep.startAt, ep.endAt, participantIds);

    rows.push({
      user_id: userId,
      source_thread_id: threadId,
      episode_index: ep.index,
      title: buildEpisodeTitle(ep, nameById),
      start_at: ep.startAt,
      end_at: ep.endAt,
      boundary_reason: ep.boundaryReason,
      source_message_ids: messageIds,
      source_entity_ids: participantIds,
      source_location_ids: locationIds,
      source_event_ids: sourceEventIds,
      participant_ids: participantIds,
      location_ids: locationIds,
    });
  }

  const { error: delErr } = await supabaseAdmin
    .from('episodes')
    .delete()
    .eq('user_id', userId)
    .eq('source_thread_id', threadId);
  if (delErr) throw delErr;

  let inserted: EpisodeRow[] = [];
  if (rows.length > 0) {
    const { data, error } = await supabaseAdmin
      .from('episodes')
      .insert(rows)
      .select('*');
    if (error) throw error;
    inserted = (data ?? []) as EpisodeRow[];
  }

  const labels = inserted.map((e) => e.title);
  const active = inserted[inserted.length - 1] ?? null;
  const messagesWithEntities = segMessages.filter((m) => (m.entityIds?.length ?? 0) > 0).length;
  const messagesWithLocations = segMessages.filter((m) => (m.locationIds?.length ?? 0) > 0).length;

  logger.info(
    {
      userId,
      threadId,
      episodeCount: inserted.length,
      messagesTotal: segMessages.length,
    },
    'episode_persistence: thread segmented'
  );

  return {
    threadId,
    episodeCount: inserted.length,
    created: inserted.length,
    messagesTotal: segMessages.length,
    activeEpisodeId: active?.id ?? null,
    activeEpisodeLabel: active?.title ?? null,
    episodeLabels: labels,
    episodes: inserted,
    coverage: {
      messagesWithEntities,
      messagesWithLocations,
      episodesWithEvents: inserted.filter((e) => e.source_event_ids.length > 0).length,
      episodesWithParticipants: inserted.filter((e) => e.participant_ids.length > 0).length,
      avgMessagesPerEpisode: inserted.length ? segMessages.length / inserted.length : 0,
    },
  };
}

export async function loadEpisodeStats(userId: string): Promise<{
  episodeCount: number;
  threadCount: number;
  avgMessagesPerEpisode: number;
  entityCoveragePct: number;
  eventCoveragePct: number;
}> {
  const { data: episodes } = await supabaseAdmin
    .from('episodes')
    .select('source_message_ids, source_entity_ids, source_event_ids, source_thread_id')
    .eq('user_id', userId);

  const rows = episodes ?? [];
  const threadCount = new Set(rows.map((r) => r.source_thread_id)).size;
  const totalMessages = rows.reduce((n, r) => n + ((r.source_message_ids as string[])?.length ?? 0), 0);
  const withEntities = rows.filter((r) => ((r.source_entity_ids as string[])?.length ?? 0) > 0).length;
  const withEvents = rows.filter((r) => ((r.source_event_ids as string[])?.length ?? 0) > 0).length;

  return {
    episodeCount: rows.length,
    threadCount,
    avgMessagesPerEpisode: rows.length ? totalMessages / rows.length : 0,
    entityCoveragePct: rows.length ? Math.round((withEntities / rows.length) * 100) : 0,
    eventCoveragePct: rows.length ? Math.round((withEvents / rows.length) * 100) : 0,
  };
}
