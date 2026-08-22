/**
 * Shared Omni / Calendar projection over CanonicalTemporalModel.
 * Presentation may differ; occurrence meaning must not.
 */
import type { OccurrenceStatus } from '../chronologyAuthority/canonicalTimelineProjector';
import type { CanonicalTemporalModel } from './canonicalTemporalModel';
import {
  civilRangeOverlapsMonth,
  localDayKey,
  resolveProjectionTimezone,
} from './userLocalTime';

export type TemporalSurface = 'omni' | 'calendar' | 'entity_modal';

export type TemporalState = 'past' | 'ongoing' | 'future' | 'unresolved';

export type TemporalSurfaceProjection = {
  canonicalItemId: string;
  occurredStart: string | null;
  occurredEnd: string | null;
  userLocalStartDay: string | null;
  userLocalEndDay: string | null;
  timezone: string | null;
  precision: string;
  occurrenceStatus: OccurrenceStatus;
  temporalState: TemporalState;
  isRange: boolean;
  isAllDay: boolean;
  isTimed: boolean;
  isUnresolved: boolean;
  /** Calendar: pin to a civil day. Omni uses the same flag for the unresolved tray. */
  calendarPlacement: 'day' | 'unscheduled';
  displayWarnings: string[];
};

export type ProjectableTemporalItem = {
  id: string;
  sortTime?: string;
  timePrecision?: string;
  temporalSource?: string;
  occurrenceStatus?: OccurrenceStatus | string;
  projectionRole?: string;
  occurredAt?: string | null;
  occurredEnd?: string | null;
  validFrom?: string | null;
  validUntil?: string | null;
  temporal?: CanonicalTemporalModel | null;
};

const TIMED_PRECISIONS = new Set<string>(['exact', 'time_of_day']);
const DAY_PRECISIONS = new Set<string>(['date', 'day']);
const RANGE_PRECISIONS = new Set<string>(['week']);
const UNSCHEDULED_PRECISIONS = new Set<string>([
  'month',
  'season',
  'quarter',
  'year',
  'approximate',
  'unknown',
  'era',
  'relative',
]);

function parseInstant(value: string | null | undefined): number | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

function asOccurrenceStatus(value: string | null | undefined): OccurrenceStatus {
  if (value === 'range' || value === 'unresolved' || value === 'confirmed') return value;
  return 'confirmed';
}

/**
 * Occurrence authority: canonical occurred start, never sortTime.
 * Explicit null occurrence stays unresolved (Chronology Authority).
 */
export function resolveOccurredBounds(item: ProjectableTemporalItem): {
  start: string | null;
  end: string | null;
  timezone: string | null;
  precision: string;
} {
  const occurred = item.temporal?.occurred;
  const start = occurred?.start ?? (item.occurredAt === undefined ? null : item.occurredAt);
  const end = occurred?.end ?? item.occurredEnd ?? item.temporal?.validUntil ?? null;
  const timezone = occurred?.timezone ?? null;
  const precision = occurred?.precision ?? item.timePrecision ?? 'unknown';
  return { start, end, timezone, precision };
}

export function deriveTemporalState(input: {
  isUnresolved: boolean;
  occurredStart: string | null;
  occurredEnd: string | null;
  validFrom?: string | null;
  validUntil?: string | null;
  occurrenceStatus: OccurrenceStatus;
  now: Date;
}): TemporalState {
  if (input.isUnresolved) return 'unresolved';
  const now = input.now.getTime();
  const start = parseInstant(input.occurredStart);
  const end = parseInstant(input.occurredEnd);
  const validFrom = parseInstant(input.validFrom ?? null);
  const validUntil = parseInstant(input.validUntil ?? null);

  if (start != null && start > now) return 'future';
  if (start != null && end != null && start <= now && end >= now) return 'ongoing';

  const range = input.occurrenceStatus === 'range';
  const ongoingByValidity =
    range &&
    validFrom != null &&
    validUntil == null &&
    validFrom <= now &&
    (start == null || start <= now);
  if (ongoingByValidity) return 'ongoing';

  if (
    range &&
    validFrom != null &&
    validUntil != null &&
    validFrom <= now &&
    validUntil >= now
  ) {
    return 'ongoing';
  }

  if (start != null && start <= now) return 'past';
  if (end != null && end < now) return 'past';
  return 'unresolved';
}

function calendarPlacementFor(input: {
  isUnresolved: boolean;
  precision: string;
  occurrenceStatus: OccurrenceStatus;
  startDay: string | null;
  endDay: string | null;
}): 'day' | 'unscheduled' {
  if (input.isUnresolved || !input.startDay) return 'unscheduled';
  if (UNSCHEDULED_PRECISIONS.has(input.precision)) return 'unscheduled';
  if (input.precision === 'week' && !input.endDay) return 'unscheduled';
  return 'day';
}

export function projectTemporalItem(
  item: ProjectableTemporalItem,
  userTimezone: string,
  now: Date = new Date(),
  _targetSurface: TemporalSurface = 'omni',
): TemporalSurfaceProjection {
  const timezone = resolveProjectionTimezone(userTimezone);
  const bounds = resolveOccurredBounds(item);
  const occurrenceStatus = asOccurrenceStatus(item.occurrenceStatus);
  const precision = bounds.precision || 'unknown';
  const warnings: string[] = [];

  const explicitNullOccurrence = item.temporal?.occurred.start === null || item.occurredAt === null;
  const unresolvedByRole = item.projectionRole === 'unresolved' || occurrenceStatus === 'unresolved';
  const unresolvedByPrecision = precision === 'unknown';
  const isUnresolved =
    unresolvedByRole ||
    unresolvedByPrecision ||
    explicitNullOccurrence ||
    !bounds.start;

  const occurredStart = isUnresolved ? null : bounds.start;
  const occurredEnd = isUnresolved ? null : bounds.end;
  const eventTz = resolveProjectionTimezone(bounds.timezone ?? timezone);
  const userLocalStartDay = occurredStart ? localDayKey(occurredStart, eventTz) : null;

  if (item.sortTime && occurredStart) {
    const sortDay = localDayKey(item.sortTime, timezone);
    if (sortDay && userLocalStartDay && sortDay !== userLocalStartDay) {
      warnings.push('sort_time_does_not_change_occurrence_day');
    }
  }

  const temporalState = deriveTemporalState({
    isUnresolved,
    occurredStart,
    occurredEnd,
    validFrom: item.temporal?.validFrom ?? item.validFrom ?? null,
    validUntil: item.temporal?.validUntil ?? item.validUntil ?? null,
    occurrenceStatus,
    now,
  });

  const userLocalEndDay = occurredEnd
    ? localDayKey(occurredEnd, eventTz)
    : temporalState === 'ongoing'
      ? localDayKey(now, eventTz)
      : userLocalStartDay;

  const isTimed = !isUnresolved && TIMED_PRECISIONS.has(precision);
  const isAllDay = !isUnresolved && DAY_PRECISIONS.has(precision);
  const spanIsMultiDay = Boolean(
    userLocalStartDay && userLocalEndDay && userLocalStartDay !== userLocalEndDay,
  );
  const isRange =
    !isUnresolved &&
    (occurrenceStatus === 'range' || RANGE_PRECISIONS.has(precision) || spanIsMultiDay || temporalState === 'ongoing');

  const calendarPlacement = calendarPlacementFor({
    isUnresolved,
    precision,
    occurrenceStatus,
    startDay: userLocalStartDay,
    endDay: userLocalEndDay,
  });

  if (calendarPlacement === 'unscheduled' && occurredStart && UNSCHEDULED_PRECISIONS.has(precision)) {
    warnings.push('approximate_precision_not_pinned_to_day');
  }

  return {
    canonicalItemId: item.id,
    occurredStart,
    occurredEnd,
    userLocalStartDay,
    userLocalEndDay,
    timezone: bounds.timezone ?? timezone,
    precision,
    occurrenceStatus: isUnresolved ? 'unresolved' : isRange && occurrenceStatus === 'confirmed'
      ? 'range'
      : occurrenceStatus,
    temporalState,
    isRange,
    isAllDay,
    isTimed,
    isUnresolved,
    calendarPlacement,
    displayWarnings: warnings,
  };
}

export function projectTemporalItemForSurfaces(
  item: ProjectableTemporalItem,
  userTimezone: string,
  now: Date = new Date(),
): {
  omni: TemporalSurfaceProjection;
  calendar: TemporalSurfaceProjection;
  entityModal: TemporalSurfaceProjection;
} {
  const omni = projectTemporalItem(item, userTimezone, now, 'omni');
  const calendar = projectTemporalItem(item, userTimezone, now, 'calendar');
  const entityModal = projectTemporalItem(item, userTimezone, now, 'entity_modal');
  return { omni, calendar, entityModal };
}

export function compareTemporalProjections(
  item: ProjectableTemporalItem,
  userTimezone: string,
  now: Date = new Date(),
): {
  canonicalItemId: string;
  occurredStart: string | null;
  occurredEnd: string | null;
  precision: string;
  occurrenceStatus: OccurrenceStatus;
  timezone: string | null;
  omni: {
    localDay: string | null;
    temporalState: TemporalState;
  };
  calendar: {
    localDay: string | null;
    startDay: string | null;
    endDay: string | null;
    temporalState: TemporalState;
    placement: 'day' | 'unscheduled';
  };
  entityModal: {
    localDay: string | null;
    temporalState: TemporalState;
    placement: 'day' | 'unscheduled';
  };
  warnings: string[];
} {
  const { omni, calendar, entityModal } = projectTemporalItemForSurfaces(item, userTimezone, now);
  const warnings = [...new Set([
    ...omni.displayWarnings,
    ...calendar.displayWarnings,
    ...entityModal.displayWarnings,
  ])];
  if (omni.userLocalStartDay !== calendar.userLocalStartDay) {
    warnings.push('omni_calendar_local_day_mismatch');
  }
  if (omni.temporalState !== calendar.temporalState) {
    warnings.push('omni_calendar_temporal_state_mismatch');
  }
  if (omni.canonicalItemId !== calendar.canonicalItemId) {
    warnings.push('omni_calendar_id_mismatch');
  }
  if (entityModal.canonicalItemId !== omni.canonicalItemId) {
    warnings.push('entity_modal_id_mismatch');
  }
  if (entityModal.userLocalStartDay !== omni.userLocalStartDay) {
    warnings.push('entity_modal_local_day_mismatch');
  }
  if (entityModal.temporalState !== omni.temporalState) {
    warnings.push('entity_modal_temporal_state_mismatch');
  }
  return {
    canonicalItemId: omni.canonicalItemId,
    occurredStart: omni.occurredStart,
    occurredEnd: omni.occurredEnd,
    precision: omni.precision,
    occurrenceStatus: omni.occurrenceStatus,
    timezone: omni.timezone,
    omni: {
      localDay: omni.userLocalStartDay,
      temporalState: omni.temporalState,
    },
    calendar: {
      localDay: calendar.calendarPlacement === 'unscheduled' ? null : calendar.userLocalStartDay,
      startDay: calendar.userLocalStartDay,
      endDay: calendar.userLocalEndDay,
      temporalState: calendar.temporalState,
      placement: calendar.calendarPlacement,
    },
    entityModal: {
      localDay: entityModal.userLocalStartDay,
      temporalState: entityModal.temporalState,
      placement: entityModal.calendarPlacement,
    },
    warnings,
  };
}

export function projectionOverlapsLocalMonth(
  projection: TemporalSurfaceProjection,
  year: number,
  month: number,
): boolean {
  if (projection.calendarPlacement === 'unscheduled') return false;
  return civilRangeOverlapsMonth(
    projection.userLocalStartDay,
    projection.userLocalEndDay,
    year,
    month,
  );
}

export function isApproximatePrecision(precision: string | null | undefined): boolean {
  return UNSCHEDULED_PRECISIONS.has(precision ?? '');
}
