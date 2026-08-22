/**
 * Character Timeline Authority
 *
 * “When did something involving this person happen?” is answered only by
 * resolved_events.people[] → CanonicalTemporalModel → stitchedTimelineService.
 * Relationship state (“what is this person to me?”) stays on
 * character_relationship_history and is out of this tab.
 *
 * Character date-field authority:
 *   occurred            CanonicalTemporalModel.occurred
 *   mentionedAt         CanonicalTemporalModel.mentionedAt
 *   recordedAt          CanonicalTemporalModel.recordedAt
 *   first_appearance    card metadata, not occurrence
 *   characters.created_at  card added, not occurrence
 */
import type { StitchedTimelineItem } from '../chronologyV2/stitchedTimelineService';
import { stitchedTimelineService } from '../chronologyV2/stitchedTimelineService';
import { getUserTimezone } from '../temporal/userTimezoneService';

export type TimelineType = 'shared_experience' | 'lore' | 'mentioned_in';

export const CHARACTER_DATE_FIELD_AUTHORITY = {
  occurrence: 'canonical_temporal_model.occurred',
  mention: 'canonical_temporal_model.mentionedAt',
  recording: 'canonical_temporal_model.recordedAt',
  relationshipState: 'character_relationship_history',
  firstAppearance: 'card_metadata_not_occurrence',
  characterCreatedAt: 'card_metadata_not_occurrence',
} as const;

export type TemporalProvenanceLabel =
  | 'User reported'
  | 'User interpretation'
  | 'Concern / fear'
  | 'Third-party claim'
  | 'System inference'
  | 'Unresolved';

export type CharacterTimelineEvent = {
  id: string;
  eventId: string;
  eventTitle: string;
  eventDate: string;
  eventSummary?: string;
  eventType?: string;
  timelineType: TimelineType;
  characterRole?: string;
  userWasPresent: boolean;
  impactType?: string;
  connectionCharacter?: string;
  emotionalImpact?: string;
  confidence: number;
  canonicalItemId: string;
  entityId: string;
  legacyOnly?: boolean;
  occurredStart?: string | null;
  occurredEnd?: string | null;
  userLocalStartDay?: string | null;
  userLocalEndDay?: string | null;
  timezone?: string | null;
  precision?: string;
  occurrenceStatus?: string;
  temporalState?: string;
  isRange?: boolean;
  isTimed?: boolean;
  isAllDay?: boolean;
  isUnresolved?: boolean;
  isUnscheduled?: boolean;
  mentionedAt?: string | null;
  recordedAt?: string | null;
  provenanceLabel?: TemporalProvenanceLabel;
};

export type EntityTemporalSummary = {
  lastInteractionAt: string | null;
  lastInteractionId: string | null;
  lastMentionedAt: string | null;
  lastMentionedId: string | null;
  /** @deprecated alias of firstKnownOccurrenceAt — card/legacy dates must not fill this. */
  firstKnownAppearanceAt: string | null;
  firstKnownAppearanceId: string | null;
  firstKnownOccurrenceAt: string | null;
  firstKnownOccurrenceId: string | null;
  lastKnownOccurrenceAt: string | null;
  lastKnownOccurrenceId: string | null;
  firstMentionedAt: string | null;
  firstMentionedId: string | null;
};

export const EMPTY_ENTITY_TEMPORAL_SUMMARY: EntityTemporalSummary = {
  lastInteractionAt: null,
  lastInteractionId: null,
  lastMentionedAt: null,
  lastMentionedId: null,
  firstKnownAppearanceAt: null,
  firstKnownAppearanceId: null,
  firstKnownOccurrenceAt: null,
  firstKnownOccurrenceId: null,
  lastKnownOccurrenceAt: null,
  lastKnownOccurrenceId: null,
  firstMentionedAt: null,
  firstMentionedId: null,
};

export type CharacterEntityTimelineResult = {
  sharedExperiences: CharacterTimelineEvent[];
  lore: CharacterTimelineEvent[];
  unresolved: CharacterTimelineEvent[];
  legacyOnly: CharacterTimelineEvent[];
  summary: EntityTemporalSummary;
};

export function emptyCharacterTimelineResult(): CharacterEntityTimelineResult {
  return {
    sharedExperiences: [],
    lore: [],
    unresolved: [],
    legacyOnly: [],
    summary: { ...EMPTY_ENTITY_TEMPORAL_SUMMARY },
  };
}

export class ResolvedEventsQueryError extends Error {
  readonly code = 'RESOLVED_EVENTS_QUERY_FAILED';
  constructor(readonly dataErrors: Array<{ source: string; message: string }>) {
    super(dataErrors.map((entry) => `${entry.source}: ${entry.message}`).join('; ') || 'resolved_events query failed');
    this.name = 'ResolvedEventsQueryError';
  }
}

function parseMs(value: string | null | undefined): number | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

function localDayKey(iso: string, timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(iso));
}

export function provenanceLabelForTemporal(input: {
  isUnresolved: boolean;
  temporalSource?: string | null;
  speechAct?: string | null;
  tags?: string[];
}): TemporalProvenanceLabel {
  if (input.isUnresolved) return 'Unresolved';
  const tags = (input.tags ?? []).join(' ').toLowerCase();
  const speech = (input.speechAct ?? '').toUpperCase();
  if (speech === 'REFLECTION' || /\binterpret/.test(tags)) return 'User interpretation';
  if (/\b(?:fear|worried|concern)\b/.test(tags) || speech.includes('CONCERN')) return 'Concern / fear';
  switch (input.temporalSource) {
    case 'user_stated':
    case 'user_corrected':
    case 'relative_expression':
      return 'User reported';
    case 'document_stated':
      return 'Third-party claim';
    case 'context_inferred':
      return 'System inference';
    case 'recording_fallback':
      return 'Unresolved';
    default:
      return 'System inference';
  }
}

export function sameTemporalIdentity(
  left: { canonicalItemId: string; occurredStart?: string | null; userLocalStartDay?: string | null },
  right: { canonicalItemId: string; occurredStart?: string | null; userLocalStartDay?: string | null },
): boolean {
  return (
    left.canonicalItemId === right.canonicalItemId
    && (left.occurredStart ?? null) === (right.occurredStart ?? null)
    && (left.userLocalStartDay ?? null) === (right.userLocalStartDay ?? null)
  );
}

export function isGroundedOccurrence(item: Pick<CharacterTimelineEvent, 'isUnresolved' | 'occurredStart'>): boolean {
  return Boolean(item.occurredStart) && item.isUnresolved !== true;
}

export function getLastEntityInteraction(
  items: CharacterTimelineEvent[],
): { id: string; at: string } | null {
  const candidates = items.filter(
    (item) =>
      isGroundedOccurrence(item)
      && item.userWasPresent
      && item.legacyOnly !== true,
  );
  let best: { id: string; at: string; ms: number } | null = null;
  for (const item of candidates) {
    const ms = parseMs(item.occurredStart);
    if (ms == null) continue;
    if (!best || ms > best.ms) best = { id: item.canonicalItemId, at: item.occurredStart as string, ms };
  }
  return best ? { id: best.id, at: best.at } : null;
}

export function getLastEntityMention(
  items: CharacterTimelineEvent[],
): { id: string; at: string } | null {
  let best: { id: string; at: string; ms: number } | null = null;
  for (const item of items) {
    if (item.legacyOnly) continue;
    const mention = item.mentionedAt ?? (item.userWasPresent === false ? item.recordedAt : null);
    const ms = parseMs(mention);
    if (ms == null) continue;
    if (!best || ms > best.ms) best = { id: item.canonicalItemId, at: mention as string, ms };
  }
  return best ? { id: best.id, at: best.at } : null;
}

export function getFirstKnownAppearance(
  items: CharacterTimelineEvent[],
): { id: string; at: string } | null {
  return getFirstKnownOccurrence(items);
}

export function getFirstKnownOccurrence(
  items: CharacterTimelineEvent[],
): { id: string; at: string } | null {
  const candidates = items.filter((item) => isGroundedOccurrence(item) && item.legacyOnly !== true);
  let best: { id: string; at: string; ms: number } | null = null;
  for (const item of candidates) {
    const ms = parseMs(item.occurredStart);
    if (ms == null) continue;
    if (!best || ms < best.ms) best = { id: item.canonicalItemId, at: item.occurredStart as string, ms };
  }
  return best ? { id: best.id, at: best.at } : null;
}

export function getLastKnownOccurrence(
  items: CharacterTimelineEvent[],
): { id: string; at: string } | null {
  const candidates = items.filter((item) => isGroundedOccurrence(item) && item.legacyOnly !== true);
  let best: { id: string; at: string; ms: number } | null = null;
  for (const item of candidates) {
    const ms = parseMs(item.occurredStart);
    if (ms == null) continue;
    if (!best || ms > best.ms) best = { id: item.canonicalItemId, at: item.occurredStart as string, ms };
  }
  return best ? { id: best.id, at: best.at } : null;
}

export function getFirstEntityMention(
  items: CharacterTimelineEvent[],
): { id: string; at: string } | null {
  let best: { id: string; at: string; ms: number } | null = null;
  for (const item of items) {
    if (item.legacyOnly) continue;
    const mention = item.mentionedAt ?? (item.userWasPresent === false ? item.recordedAt : null);
    const ms = parseMs(mention);
    if (ms == null) continue;
    if (!best || ms < best.ms) best = { id: item.canonicalItemId, at: mention as string, ms };
  }
  return best ? { id: best.id, at: best.at } : null;
}

function occurredStartOf(item: StitchedTimelineItem): string | null {
  if (item.occurrenceStatus === 'unresolved') return null;
  return item.occurredAt ?? item.temporal?.occurred.start ?? null;
}

function toCharacterEvent(
  item: StitchedTimelineItem,
  entityId: string,
  timezone: string,
): CharacterTimelineEvent {
  const occurredStart = occurredStartOf(item);
  const occurredEnd = item.occurredEnd ?? item.temporal?.occurred.end ?? null;
  const isUnresolved = item.occurrenceStatus === 'unresolved' || !occurredStart;
  const userWasPresent = item.userPresence !== 'heard_about';
  const timelineType: TimelineType = userWasPresent ? 'shared_experience' : 'lore';
  const eventId = item.sourceId;
  return {
    id: item.id,
    eventId,
    eventTitle: item.title,
    eventDate: occurredStart ?? '',
    eventSummary: item.body || undefined,
    eventType: item.canonicalEventType,
    timelineType,
    userWasPresent,
    confidence: item.confidence ?? item.timeConfidence ?? 0.5,
    canonicalItemId: item.id,
    entityId,
    occurredStart,
    occurredEnd,
    userLocalStartDay: occurredStart ? localDayKey(occurredStart, timezone) : null,
    userLocalEndDay: occurredEnd ? localDayKey(occurredEnd, timezone) : null,
    timezone,
    precision: item.timePrecision,
    occurrenceStatus: item.occurrenceStatus,
    isRange: Boolean(occurredStart && occurredEnd && occurredEnd !== occurredStart),
    isTimed: Boolean(
      occurredStart
      && (item.timePrecision === 'exact' || item.timePrecision === 'time' || item.timePrecision === 'datetime'),
    ),
    isAllDay: Boolean(
      occurredStart
      && (item.timePrecision === 'date' || item.timePrecision === 'day'),
    ),
    isUnresolved,
    isUnscheduled: false,
    mentionedAt: item.mentionedAt ?? item.temporal?.mentionedAt ?? null,
    recordedAt: item.recordedAt ?? item.temporal?.recordedAt ?? null,
    provenanceLabel: provenanceLabelForTemporal({
      isUnresolved,
      temporalSource: item.temporalSource ?? item.temporal?.occurred.source,
      speechAct: item.speechAct,
      tags: item.tags,
    }),
  };
}

export function projectCharacterTimelineFromSources(input: {
  entityId: string;
  timezone: string;
  now?: Date;
  stitchedItems?: StitchedTimelineItem[];
  unresolvedItems?: StitchedTimelineItem[];
}): CharacterEntityTimelineResult {
  const timezone = input.timezone || 'UTC';
  const unresolvedSource = input.unresolvedItems ?? [];
  const seen = new Set<string>();
  const dated: CharacterTimelineEvent[] = [];
  const unresolved: CharacterTimelineEvent[] = [];

  const take = (row: StitchedTimelineItem) => {
    if (seen.has(row.id)) return;
    seen.add(row.id);
    const mapped = toCharacterEvent(row, input.entityId, timezone);
    if (mapped.isUnresolved || mapped.isUnscheduled || !mapped.occurredStart) unresolved.push(mapped);
    else dated.push(mapped);
  };

  for (const row of input.stitchedItems ?? []) take(row);
  for (const row of unresolvedSource) take(row);

  const canonicalForSummary = [...dated, ...unresolved];
  const lastInteraction = getLastEntityInteraction(canonicalForSummary);
  const lastMention = getLastEntityMention(canonicalForSummary);
  const firstMention = getFirstEntityMention(canonicalForSummary);
  const firstKnown = getFirstKnownOccurrence(canonicalForSummary);
  const lastKnown = getLastKnownOccurrence(canonicalForSummary);

  const sharedExperiences = dated.filter((item) => item.timelineType === 'shared_experience');
  const lore = dated.filter((item) => item.timelineType !== 'shared_experience');

  return {
    sharedExperiences,
    lore,
    unresolved,
    legacyOnly: [],
    summary: {
      lastInteractionAt: lastInteraction?.at ?? null,
      lastInteractionId: lastInteraction?.id ?? null,
      lastMentionedAt: lastMention?.at ?? null,
      lastMentionedId: lastMention?.id ?? null,
      firstKnownAppearanceAt: firstKnown?.at ?? null,
      firstKnownAppearanceId: firstKnown?.id ?? null,
      firstKnownOccurrenceAt: firstKnown?.at ?? null,
      firstKnownOccurrenceId: firstKnown?.id ?? null,
      lastKnownOccurrenceAt: lastKnown?.at ?? null,
      lastKnownOccurrenceId: lastKnown?.id ?? null,
      firstMentionedAt: firstMention?.at ?? null,
      firstMentionedId: firstMention?.id ?? null,
    },
  };
}

export async function buildCanonicalCharacterTimeline(
  userId: string,
  entityId: string,
  timezone?: string,
): Promise<CharacterEntityTimelineResult> {
  const tz = timezone ?? (await getUserTimezone(userId)) ?? 'UTC';
  const stitched = await stitchedTimelineService.getStitchedTimeline(userId, {
    character_id: entityId,
  });
  if (stitched.data_errors?.some((entry) => entry.source === 'resolved_events')) {
    throw new ResolvedEventsQueryError(stitched.data_errors);
  }

  return projectCharacterTimelineFromSources({
    entityId,
    timezone: tz,
    stitchedItems: stitched.items,
    unresolvedItems: stitched.unresolved_items,
  });
}

