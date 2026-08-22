/**
 * Location Timeline Authority Cutover
 *
 * “When did something happen at this place?” is answered only by
 * CanonicalTemporalModel → stitchedTimelineService → temporalSurfaceProjection.
 * entity_timeline_events is a compatibility remnant. It may be quarantined
 * for review, but it must not manufacture occurrence or local day.
 *
 * Location date-field authority:
 *   occurred                 CanonicalTemporalModel.occurred
 *   mentionedAt              CanonicalTemporalModel.mentionedAt
 *   recordedAt               CanonicalTemporalModel.recordedAt
 *   locations.firstVisited   card metadata, not occurrence
 *   locations.lastVisited    card metadata, not occurrence
 *   entity_timeline_events.event_date     compatibility, not occurrence
 *   entity_timeline_events.created_at     insert time, not occurrence
 *   episode.start_at / session.updated_at compatibility, not occurrence
 */
import type { StitchedTimelineItem } from '../chronologyV2/stitchedTimelineService';
import { stitchedTimelineService } from '../chronologyV2/stitchedTimelineService';
import {
  provenanceLabelForTemporal,
  sameTemporalIdentity,
  type TemporalProvenanceLabel,
  type TimelineType,
} from '../characters/characterEntityTimelineService';
import { supabaseAdmin } from '../supabaseClient';
import {
  projectTemporalItem,
  type TemporalState,
} from '../temporal/temporalSurfaceProjection';
import { resolveProjectionTimezone } from '../temporal/userLocalTime';
import { getUserTimezone } from '../temporal/userTimezoneService';
import { logger } from '../../logger';
import {
  describeLegacyEntityTimelineRow,
  type EntityTimelineCompatibilityReviewItem,
} from '../conversationCentered/entityTimelineCompatibilityPolicy';

export { sameTemporalIdentity };

export const LOCATION_DATE_FIELD_AUTHORITY = {
  occurrence: 'canonical_temporal_model.occurred',
  mention: 'canonical_temporal_model.mentionedAt',
  recording: 'canonical_temporal_model.recordedAt',
  firstVisited: 'card_metadata_not_occurrence',
  lastVisited: 'card_metadata_not_occurrence',
  legacyEventDate: 'compatibility_not_occurrence',
  legacyRowCreatedAt: 'compatibility_not_occurrence',
} as const;

export type LocationTimelineEvent = {
  id: string;
  eventId: string;
  eventTitle: string;
  eventDate: string;
  eventSummary?: string;
  eventType?: string;
  timelineType: TimelineType;
  entityRole?: string;
  userWasPresent: boolean;
  confidence: number;
  canonicalItemId: string;
  entityId: string;
  occurredStart?: string | null;
  occurredEnd?: string | null;
  userLocalStartDay?: string | null;
  userLocalEndDay?: string | null;
  timezone?: string | null;
  precision?: string;
  occurrenceStatus?: string;
  temporalState?: TemporalState;
  isRange?: boolean;
  isTimed?: boolean;
  isAllDay?: boolean;
  isUnresolved?: boolean;
  isUnscheduled?: boolean;
  mentionedAt?: string | null;
  recordedAt?: string | null;
  provenanceLabel?: TemporalProvenanceLabel;
};

export type LegacyLocationTimelineRow = {
  id: string;
  event_id: string | null;
  source_episode_id?: string | null;
  source_thread_id?: string | null;
  event_title?: string | null;
  event_date?: string | null;
  event_summary?: string | null;
  event_type?: string | null;
  timeline_type?: string | null;
  entity_role?: string | null;
  user_was_present?: boolean | null;
  confidence?: number | null;
  created_at?: string | null;
};

export type LocationCompatibilityReviewItem = EntityTimelineCompatibilityReviewItem;

export type LocationTemporalSummary = {
  lastVisitAt: string | null;
  lastVisitId: string | null;
  firstKnownVisitAt: string | null;
  firstKnownVisitId: string | null;
};

export type LocationEntityTimelineResult = {
  sharedExperiences: LocationTimelineEvent[];
  lore: LocationTimelineEvent[];
  unresolved: LocationTimelineEvent[];
  legacyOnly: LocationTimelineEvent[];
  compatibilityReview: LocationCompatibilityReviewItem[];
  summary: LocationTemporalSummary;
};

function parseMs(value: string | null | undefined): number | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

function isGrounded(item: LocationTimelineEvent): boolean {
  return Boolean(item.occurredStart) && item.isUnresolved !== true;
}

function pickExtreme(
  items: LocationTimelineEvent[],
  direction: 'first' | 'last',
): { id: string; at: string } | null {
  let best: { id: string; at: string; ms: number } | null = null;
  for (const item of items) {
    if (!isGrounded(item)) continue;
    const ms = parseMs(item.occurredStart);
    if (ms == null) continue;
    if (!best || (direction === 'last' ? ms > best.ms : ms < best.ms)) {
      best = { id: item.canonicalItemId, at: item.occurredStart as string, ms };
    }
  }
  return best ? { id: best.id, at: best.at } : null;
}

function toLocationEvent(
  item: StitchedTimelineItem,
  entityId: string,
  timezone: string,
  now: Date,
): LocationTimelineEvent {
  const projection = projectTemporalItem(item, timezone, now, 'entity_modal');
  const userWasPresent = item.userPresence !== 'heard_about';
  const timelineType: TimelineType = userWasPresent ? 'shared_experience' : 'lore';
  return {
    id: item.id,
    eventId: item.sourceId,
    eventTitle: item.title,
    eventDate: projection.occurredStart ?? '',
    eventSummary: item.body || undefined,
    eventType: item.canonicalEventType,
    timelineType,
    entityRole: 'visited',
    userWasPresent,
    confidence: item.confidence ?? item.timeConfidence ?? 0.5,
    canonicalItemId: projection.canonicalItemId,
    entityId,
    occurredStart: projection.occurredStart,
    occurredEnd: projection.occurredEnd,
    userLocalStartDay: projection.userLocalStartDay,
    userLocalEndDay: projection.userLocalEndDay,
    timezone: projection.timezone,
    precision: projection.precision,
    occurrenceStatus: projection.occurrenceStatus,
    temporalState: projection.temporalState,
    isRange: projection.isRange,
    isTimed: projection.isTimed,
    isAllDay: projection.isAllDay,
    isUnresolved: projection.isUnresolved,
    isUnscheduled: projection.calendarPlacement === 'unscheduled',
    mentionedAt: item.mentionedAt ?? item.temporal?.mentionedAt ?? null,
    recordedAt: item.recordedAt ?? item.temporal?.recordedAt ?? null,
    provenanceLabel: provenanceLabelForTemporal({
      isUnresolved: projection.isUnresolved,
      temporalSource: item.temporalSource ?? item.temporal?.occurred.source,
      speechAct: item.speechAct,
      tags: item.tags,
    }),
  };
}

function canonicalSourceIds(items: StitchedTimelineItem[]): Set<string> {
  const ids = new Set<string>();
  for (const item of items) {
    ids.add(item.id);
    ids.add(item.sourceId);
    for (const extra of item.sourceIds ?? []) ids.add(extra);
  }
  return ids;
}

export function projectLocationTimelineFromSources(input: {
  entityId: string;
  timezone: string;
  now?: Date;
  stitchedItems?: StitchedTimelineItem[];
  unresolvedItems?: StitchedTimelineItem[];
  legacyRows?: LegacyLocationTimelineRow[];
}): LocationEntityTimelineResult {
  const timezone = resolveProjectionTimezone(input.timezone);
  const now = input.now ?? new Date();
  const unresolvedSource = input.unresolvedItems ?? [];
  const seen = new Set<string>();
  const dated: LocationTimelineEvent[] = [];
  const unresolved: LocationTimelineEvent[] = [];

  const take = (row: StitchedTimelineItem) => {
    if (seen.has(row.id)) return;
    seen.add(row.id);
    const mapped = toLocationEvent(row, input.entityId, timezone, now);
    if (mapped.isUnresolved || mapped.isUnscheduled || !mapped.occurredStart) unresolved.push(mapped);
    else dated.push(mapped);
  };

  for (const row of input.stitchedItems ?? []) take(row);
  for (const row of unresolvedSource) take(row);

  const matchedIds = canonicalSourceIds([
    ...(input.stitchedItems ?? []),
    ...unresolvedSource,
  ]);
  const compatibilityReview: LocationCompatibilityReviewItem[] = [];

  for (const row of input.legacyRows ?? []) {
    if (row.event_id && matchedIds.has(row.event_id)) continue;
    compatibilityReview.push(describeLegacyEntityTimelineRow({ entityId: input.entityId, row }));
  }

  const lastVisit = pickExtreme(dated, 'last');
  const firstVisit = pickExtreme(dated, 'first');

  return {
    sharedExperiences: dated.filter((item) => item.timelineType === 'shared_experience'),
    lore: dated.filter((item) => item.timelineType !== 'shared_experience'),
    unresolved,
    legacyOnly: [],
    compatibilityReview,
    summary: {
      lastVisitAt: lastVisit?.at ?? null,
      lastVisitId: lastVisit?.id ?? null,
      firstKnownVisitAt: firstVisit?.at ?? null,
      firstKnownVisitId: firstVisit?.id ?? null,
    },
  };
}

export async function buildCanonicalLocationTimeline(
  userId: string,
  entityId: string,
  timezone?: string,
): Promise<LocationEntityTimelineResult> {
  const tz = resolveProjectionTimezone(timezone ?? (await getUserTimezone(userId)));
  const [stitched, legacyRes] = await Promise.all([
    stitchedTimelineService.getStitchedTimelineForLocation(userId, entityId, { timezone: tz }),
    supabaseAdmin
      .from('entity_timeline_events')
      .select('id, event_id, source_episode_id, source_thread_id, event_title, event_date, event_summary, event_type, timeline_type, entity_role, user_was_present, confidence, created_at')
      .eq('user_id', userId)
      .eq('entity_type', 'location')
      .eq('entity_id', entityId),
  ]);

  if (legacyRes.error) {
    logger.warn({ error: legacyRes.error, userId, entityId }, 'location entity timeline: legacy load failed');
  }

  return projectLocationTimelineFromSources({
    entityId,
    timezone: tz,
    stitchedItems: stitched.items,
    unresolvedItems: stitched.unresolved_items,
    legacyRows: (legacyRes.data ?? []) as LegacyLocationTimelineRow[],
  });
}
