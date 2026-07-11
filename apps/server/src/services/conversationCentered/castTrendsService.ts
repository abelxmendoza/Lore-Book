/**
 * Cast trends — how the cast of the user's story changes over time.
 *
 * Derived entirely from entity_conversation_links aggregates (which threads an
 * entity appears in, when first/last, how often). Deterministic classification,
 * no LLM:
 *   new faces — first appeared recently
 *   rising    — active lately across multiple threads
 *   dormant   — used to matter, hasn't come up in a while (nudge material)
 */

import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';

export type CastMemberActivity = {
  entityId: string;
  name: string;
  kind: string;
  threadCount: number;
  totalMentions: number;
  firstSeen: string;
  lastSeen: string;
};

export type CastTrends = {
  newFaces: CastMemberActivity[];
  rising: CastMemberActivity[];
  dormant: CastMemberActivity[];
};

const DAY_MS = 86_400_000;
export const NEW_FACE_WINDOW_DAYS = 14;
export const RISING_WINDOW_DAYS = 14;
export const DORMANT_AFTER_DAYS = 35;
export const DORMANT_MIN_MENTIONS = 4;
const LIST_CAP = 5;

/** Deterministic trend classification. Pure — exported for tests. */
export function classifyCastTrends(
  members: CastMemberActivity[],
  now: number = Date.now(),
): CastTrends {
  const newFaces: CastMemberActivity[] = [];
  const rising: CastMemberActivity[] = [];
  const dormant: CastMemberActivity[] = [];

  for (const m of members) {
    const firstAgeDays = (now - new Date(m.firstSeen).getTime()) / DAY_MS;
    const lastAgeDays = (now - new Date(m.lastSeen).getTime()) / DAY_MS;
    if (Number.isNaN(firstAgeDays) || Number.isNaN(lastAgeDays)) continue;

    if (firstAgeDays <= NEW_FACE_WINDOW_DAYS) {
      newFaces.push(m);
    } else if (lastAgeDays <= RISING_WINDOW_DAYS && m.threadCount >= 2) {
      rising.push(m);
    } else if (lastAgeDays >= DORMANT_AFTER_DAYS && m.totalMentions >= DORMANT_MIN_MENTIONS) {
      dormant.push(m);
    }
  }

  newFaces.sort((a, b) => new Date(b.firstSeen).getTime() - new Date(a.firstSeen).getTime());
  rising.sort((a, b) => b.totalMentions - a.totalMentions);
  // Most-missed first: heaviest history, longest silence.
  dormant.sort(
    (a, b) =>
      b.totalMentions - a.totalMentions ||
      new Date(a.lastSeen).getTime() - new Date(b.lastSeen).getTime(),
  );

  return {
    newFaces: newFaces.slice(0, LIST_CAP),
    rising: rising.slice(0, LIST_CAP),
    dormant: dormant.slice(0, LIST_CAP),
  };
}

type LinkRow = {
  entity_id: string;
  entity_type: string;
  session_id: string;
  mention_count: number | null;
  first_linked_at: string | null;
  last_linked_at: string | null;
  metadata: { entity_name?: string | null } | null;
};

/** Aggregate link rows per entity. Pure — exported for tests. */
export function aggregateCastActivity(rows: LinkRow[]): Map<string, CastMemberActivity> {
  const byEntity = new Map<string, CastMemberActivity & { sessions: Set<string> }>();
  for (const row of rows) {
    if (!row.entity_id) continue;
    const existing = byEntity.get(row.entity_id);
    const first = row.first_linked_at ?? row.last_linked_at;
    const last = row.last_linked_at ?? row.first_linked_at;
    if (!first || !last) continue;
    if (existing) {
      existing.sessions.add(row.session_id);
      existing.threadCount = existing.sessions.size;
      existing.totalMentions += Math.max(1, row.mention_count ?? 1);
      if (first < existing.firstSeen) existing.firstSeen = first;
      if (last > existing.lastSeen) existing.lastSeen = last;
      if (row.metadata?.entity_name) existing.name = row.metadata.entity_name;
    } else {
      byEntity.set(row.entity_id, {
        entityId: row.entity_id,
        name: row.metadata?.entity_name ?? '',
        kind: row.entity_type,
        threadCount: 1,
        totalMentions: Math.max(1, row.mention_count ?? 1),
        firstSeen: first,
        lastSeen: last,
        sessions: new Set([row.session_id]),
      });
    }
  }
  const out = new Map<string, CastMemberActivity>();
  for (const [id, m] of byEntity) {
    const { sessions: _sessions, ...rest } = m;
    out.set(id, rest);
  }
  return out;
}

class CastTrendsService {
  async getTrends(userId: string): Promise<CastTrends> {
    const empty: CastTrends = { newFaces: [], rising: [], dormant: [] };
    try {
      const { data: links, error } = await supabaseAdmin
        .from('entity_conversation_links')
        .select('entity_id, entity_type, session_id, mention_count, first_linked_at, last_linked_at, metadata')
        .eq('user_id', userId)
        .eq('entity_type', 'character')
        .limit(2000);
      if (error || !links?.length) return empty;

      const activity = aggregateCastActivity(links as LinkRow[]);
      const ids = [...activity.keys()];

      // Canonical names + self-exclusion (never nudge the user about themselves).
      const { data: characters } = await supabaseAdmin
        .from('characters')
        .select('id, name, metadata')
        .eq('user_id', userId)
        .in('id', ids.slice(0, 500));
      for (const c of characters ?? []) {
        const entry = activity.get(c.id);
        if (!entry) continue;
        const meta = (c.metadata ?? {}) as Record<string, unknown>;
        if (meta.is_self === true || meta.is_user === true) {
          activity.delete(c.id);
          continue;
        }
        if (c.name) entry.name = c.name;
      }

      const members = [...activity.values()].filter((m) => m.name.trim().length > 0);
      return classifyCastTrends(members);
    } catch (err) {
      logger.warn({ err, userId }, 'castTrends: computation failed');
      return empty;
    }
  }
}

export const castTrendsService = new CastTrendsService();
