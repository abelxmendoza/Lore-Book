/**
 * Materialize Events from spatial references the place pipeline rejected as events,
 * and link unresolved venue references ("that venue") to the event they occurred at.
 *
 * Writes to `resolved_events` — the table the app's event surfaces actually read
 * (the `events` table is a separate, unused store). Deduped by title → idempotent.
 * Unresolved venues are attached to the co-occurring event's metadata (so they
 * never pollute the Places book) and can be merged to a real venue later.
 */
import { logger } from '../../logger';
import { inferEventAttendance } from './eventAttendance';
import { normalizeNameKey } from '../../utils/nameNormalization';
import { classifySpatialReference } from '../lorebook/quality/spatialContextResolver';

import { supabaseAdmin } from '../supabaseClient';

export interface SpatialEventRef {
  /** Candidate text the place guard rejected as an event. */
  name: string;
  /** Source line — used as the co-occurrence key for unresolved venues. */
  evidence?: string;
}

export interface UnresolvedVenueRef {
  name: string;
  evidence?: string;
}

interface EventRecord {
  id: string;
  title: string;
  summary?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface EventMaterializerDeps {
  loadEvents: (userId: string) => Promise<EventRecord[]>;
  insertEvent: (
    userId: string,
    ev: { title: string; summary?: string; metadata?: Record<string, unknown> },
  ) => Promise<EventRecord | null>;
  updateEventMetadata: (userId: string, id: string, metadata: Record<string, unknown>) => Promise<void>;
}

const defaultDeps: EventMaterializerDeps = {
  async loadEvents(userId) {
    const { data } = await supabaseAdmin
      .from('resolved_events')
      .select('id, title, summary, metadata')
      .eq('user_id', userId);
    return (data ?? []) as EventRecord[];
  },
  async insertEvent(userId, ev) {
    const now = new Date().toISOString();
    const { data, error } = await supabaseAdmin
      .from('resolved_events')
      .insert({
        user_id: userId,
        title: ev.title,
        summary: ev.summary ?? null,
        type: 'event',
        confidence: 0.6,
        tags: [],
        people: [],
        locations: [],
        activities: [],
        metadata: ev.metadata ?? {},
        created_at: now,
        updated_at: now,
      })
      .select('id, title, summary, metadata')
      .single();
    if (error) {
      logger.debug({ error, userId, title: ev.title }, 'resolved_event insert failed');
      return null;
    }
    return data as EventRecord;
  },
  async updateEventMetadata(userId, id, metadata) {
    await supabaseAdmin
      .from('resolved_events')
      .update({ metadata, updated_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('id', id);
  },
};

export async function materializeSpatialEvents(
  userId: string,
  refs: SpatialEventRef[],
  opts: { unresolvedVenues?: UnresolvedVenueRef[]; deps?: EventMaterializerDeps } = {},
): Promise<{ created: number; eventIds: string[]; unresolvedLinked: number }> {
  const deps = opts.deps ?? defaultDeps;

  // Keep only genuine events; strip the organizer ("Ink's Ska Prom" → "Ska Prom" / Ink).
  const events: Array<{ title: string; organizer?: string; evidence?: string }> = [];
  const seen = new Set<string>();
  for (const r of refs) {
    const cls = classifySpatialReference(r.name);
    if (cls.referenceType !== 'event') continue;
    const title = (cls.eventName || r.name).trim();
    const key = normalizeNameKey(title);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    events.push({ title, organizer: cls.organizer, evidence: r.evidence });
  }

  const existing: EventRecord[] = await deps.loadEvents(userId).catch(() => []);
  const byTitle = new Map<string, EventRecord>(existing.map((e) => [normalizeNameKey(e.title), e] as const));
  const byEvidence = new Map<string, EventRecord>();
  const eventIds: string[] = [];

  for (const ev of events) {
    const key = normalizeNameKey(ev.title);
    let record = byTitle.get(key) ?? null;
    if (!record) {
      const summary = [ev.organizer ? `Organized by ${ev.organizer}.` : '', ev.evidence ?? '']
        .filter(Boolean)
        .join(' ')
        .trim();
      const { attendance, cue: attendanceCue } = inferEventAttendance(ev.evidence);
      record = await deps.insertEvent(userId, {
        title: ev.title,
        summary: summary || undefined,
        metadata: {
          source: 'spatial_resolver',
          organizer: ev.organizer ?? null,
          // Awareness ≠ attendance: events the user only heard about are kept
          // but marked, so recall/timeline never claims they were there.
          attendance,
          ...(attendanceCue ? { attendance_cue: attendanceCue } : {}),
        },
      });
      if (record) {
        byTitle.set(key, record);
        eventIds.push(record.id);
        logger.info({ userId, title: ev.title, organizer: ev.organizer }, 'Materialized event from spatial reference');
      }
    }
    if (record && ev.evidence) byEvidence.set(normalizeNameKey(ev.evidence), record);
  }

  // Attach unresolved venue references to the event they share an evidence line with.
  let unresolvedLinked = 0;
  for (const uv of opts.unresolvedVenues ?? []) {
    if (!uv.evidence) continue;
    const event = byEvidence.get(normalizeNameKey(uv.evidence));
    if (!event) continue; // only link when we know the event — never create a Place
    const meta = { ...((event.metadata as Record<string, unknown>) ?? {}) };
    const list = Array.isArray(meta.unresolved_venues) ? (meta.unresolved_venues as Array<{ name: string }>) : [];
    if (list.some((v) => normalizeNameKey(v.name) === normalizeNameKey(uv.name))) continue;
    list.push({ name: uv.name, evidence: uv.evidence, status: 'pending', added_at: new Date().toISOString() } as never);
    meta.unresolved_venues = list;
    await deps.updateEventMetadata(userId, event.id, meta);
    event.metadata = meta;
    unresolvedLinked += 1;
    logger.info({ userId, eventId: event.id, venue: uv.name }, 'Linked unresolved venue to event');
  }

  return { created: eventIds.length, eventIds, unresolvedLinked };
}
