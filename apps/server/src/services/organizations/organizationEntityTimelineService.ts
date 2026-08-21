/**
 * Organization Timeline Authority Cutover
 *
 * “When did something involving this organization happen?” is answered only by
 * CanonicalTemporalModel → stitchedTimelineService organization scope →
 * temporalSurfaceProjection. Membership overlap and entity_timeline_events
 * dates are not occurrence and not attribution.
 *
 * Organization date-field authority:
 *   occurred                         CanonicalTemporalModel.occurred
 *   mentionedAt                      CanonicalTemporalModel.mentionedAt
 *   recordedAt                       CanonicalTemporalModel.recordedAt
 *   metadata.organizationAttributions  event↔org association
 *   organization_relationship_history  relationship state, not occurrence
 *   entity_timeline_events.event_date  compatibility, not occurrence
 */
import type { StitchedTimelineItem } from '../chronologyV2/stitchedTimelineService';
import { stitchedTimelineService } from '../chronologyV2/stitchedTimelineService';
import {
  provenanceLabelForTemporal,
  sameTemporalIdentity,
  type TemporalProvenanceLabel,
  type TimelineType,
} from '../characters/characterEntityTimelineService';
import {
  explainOrganizationTimelineInclusion,
  type OrganizationEventRole,
} from './organizationEventAttribution';
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

export const ORGANIZATION_DATE_FIELD_AUTHORITY = {
  occurrence: 'canonical_temporal_model.occurred',
  mention: 'canonical_temporal_model.mentionedAt',
  recording: 'canonical_temporal_model.recordedAt',
  association: 'resolved_events.metadata.organizationAttributions',
  relationshipState: 'organization_relationship_history',
  legacyEventDate: 'compatibility_not_occurrence',
  memberOverlap: 'not_event_attribution',
} as const;

export type OrganizationTimelineEvent = {
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
  attributionRole?: OrganizationEventRole;
  attributionDirect?: boolean;
  whyIncluded?: string;
  involvedNames?: string[];
  audience?: 'with_user' | 'without_user' | 'group_wide';
  source?: 'conversation' | 'user_posted';
};

export type LegacyOrganizationTimelineRow = {
  id: string;
  event_id: string | null;
  source_thread_id?: string | null;
  event_title?: string | null;
  event_date?: string | null;
  event_summary?: string | null;
  timeline_type?: string | null;
  created_at?: string | null;
};

export type OrganizationCompatibilityReviewItem = EntityTimelineCompatibilityReviewItem;

export type OrganizationEntityTimelineResult = {
  sharedExperiences: OrganizationTimelineEvent[];
  lore: OrganizationTimelineEvent[];
  unresolved: OrganizationTimelineEvent[];
  legacyOnly: OrganizationTimelineEvent[];
  compatibilityReview: OrganizationCompatibilityReviewItem[];
  summary: {
    lastEventAt: string | null;
    lastEventId: string | null;
  };
};

function toOrgEvent(
  item: StitchedTimelineItem,
  entityId: string,
  timezone: string,
  now: Date,
): OrganizationTimelineEvent {
  const projection = projectTemporalItem(item, timezone, now, 'entity_modal');
  const userWasPresent = item.userPresence !== 'heard_about';
  const inclusion = explainOrganizationTimelineInclusion(item.organizationAttributions ?? [], entityId);
  const timelineType: TimelineType = userWasPresent ? 'shared_experience' : 'lore';
  return {
    id: item.id,
    eventId: item.sourceId,
    eventTitle: item.title,
    eventDate: projection.occurredStart ?? '',
    eventSummary: item.body || undefined,
    eventType: item.canonicalEventType,
    timelineType,
    entityRole: inclusion?.role,
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
    attributionRole: inclusion?.role,
    attributionDirect: inclusion?.direct,
    whyIncluded: inclusion?.whyIncluded,
    audience: userWasPresent ? 'with_user' : 'without_user',
    source: item.sourceType === 'user_posted' ? 'user_posted' : 'conversation',
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

export function projectOrganizationTimelineFromSources(input: {
  entityId: string;
  timezone: string;
  now?: Date;
  stitchedItems?: StitchedTimelineItem[];
  unresolvedItems?: StitchedTimelineItem[];
  legacyRows?: LegacyOrganizationTimelineRow[];
}): OrganizationEntityTimelineResult {
  const timezone = resolveProjectionTimezone(input.timezone);
  const now = input.now ?? new Date();
  const unresolvedSource = input.unresolvedItems ?? [];
  const seen = new Set<string>();
  const dated: OrganizationTimelineEvent[] = [];
  const unresolved: OrganizationTimelineEvent[] = [];

  const take = (row: StitchedTimelineItem) => {
    if (seen.has(row.id)) return;
    seen.add(row.id);
    const mapped = toOrgEvent(row, input.entityId, timezone, now);
    if (mapped.isUnresolved || mapped.isUnscheduled || !mapped.occurredStart) unresolved.push(mapped);
    else dated.push(mapped);
  };

  for (const row of input.stitchedItems ?? []) take(row);
  for (const row of unresolvedSource) take(row);

  const matchedIds = canonicalSourceIds([
    ...(input.stitchedItems ?? []),
    ...unresolvedSource,
  ]);
  const compatibilityReview: OrganizationCompatibilityReviewItem[] = [];
  for (const row of input.legacyRows ?? []) {
    if (row.event_id && matchedIds.has(row.event_id)) continue;
    compatibilityReview.push(describeLegacyEntityTimelineRow({ entityId: input.entityId, row }));
  }

  const last = dated.reduce<{ id: string; at: string; ms: number } | null>((best, item) => {
    const ms = Date.parse(item.occurredStart ?? '');
    if (!Number.isFinite(ms)) return best;
    if (!best || ms > best.ms) return { id: item.canonicalItemId, at: item.occurredStart as string, ms };
    return best;
  }, null);

  return {
    sharedExperiences: dated.filter((item) => item.timelineType === 'shared_experience'),
    lore: dated.filter((item) => item.timelineType !== 'shared_experience'),
    unresolved,
    legacyOnly: [],
    compatibilityReview,
    summary: {
      lastEventAt: last?.at ?? null,
      lastEventId: last?.id ?? null,
    },
  };
}

export async function buildCanonicalOrganizationTimeline(
  userId: string,
  entityId: string,
  timezone?: string,
): Promise<OrganizationEntityTimelineResult> {
  const tz = resolveProjectionTimezone(timezone ?? (await getUserTimezone(userId)));
  const [stitched, legacyRes] = await Promise.all([
    stitchedTimelineService.getStitchedTimelineForOrganization(userId, entityId, { timezone: tz }),
    supabaseAdmin
      .from('entity_timeline_events')
      .select('id, event_id, source_thread_id, event_title, event_date, event_summary, timeline_type, created_at')
      .eq('user_id', userId)
      .eq('entity_type', 'organization')
      .eq('entity_id', entityId),
  ]);

  if (legacyRes.error) {
    logger.warn({ error: legacyRes.error, userId, entityId }, 'organization entity timeline: legacy load failed');
  }

  return projectOrganizationTimelineFromSources({
    entityId,
    timezone: tz,
    stitchedItems: stitched.items,
    unresolvedItems: stitched.unresolved_items,
    legacyRows: (legacyRes.data ?? []) as LegacyOrganizationTimelineRow[],
  });
}
