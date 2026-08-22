import { describe, expect, it } from 'vitest';

import type { ProjectableTemporalItem } from './temporalSurfaceProjection';
import {
  compareTemporalProjections,
  deriveTemporalState,
  projectTemporalItem,
  projectTemporalItemForSurfaces,
} from './temporalSurfaceProjection';
import { getUserLocalMonthBounds, localDayKey } from './userLocalTime';

const LA = 'America/Los_Angeles';
const NOW = new Date('2026-08-20T17:00:00Z');

function item(over: Partial<ProjectableTemporalItem> & Pick<ProjectableTemporalItem, 'id'>): ProjectableTemporalItem {
  return {
    sortTime: '2026-08-20T12:00:00.000Z',
    timePrecision: 'date',
    temporalSource: 'user_stated',
    occurrenceStatus: 'confirmed',
    occurredAt: '2026-08-20T12:00:00.000Z',
    ...over,
  };
}

describe('user-local day authority', () => {
  it('1. UTC instant maps to the same LA civil day for Omni and Calendar', () => {
    const iso = '2026-08-20T02:30:00Z';
    const source = item({
      id: 'event:midnight-boundary',
      occurredAt: iso,
      timePrecision: 'exact',
      temporal: {
        occurred: {
          start: iso,
          end: null,
          timezone: null,
          precision: 'exact',
          source: 'user_stated',
          status: 'anchored',
          confidence: 0.9,
          expression: '7:30 PM',
        },
        mentionedAt: null,
        recordedAt: null,
        knownFrom: null,
        validFrom: null,
        validUntil: null,
        provenance: [],
      },
    });
    const { omni, calendar, entityModal } = projectTemporalItemForSurfaces(source, LA, NOW);
    expect(localDayKey(iso, LA)).toBe('2026-08-19');
    expect(omni.canonicalItemId).toBe('event:midnight-boundary');
    expect(calendar.canonicalItemId).toBe(omni.canonicalItemId);
    expect(omni.userLocalStartDay).toBe('2026-08-19');
    expect(calendar.userLocalStartDay).toBe('2026-08-19');
    expect(entityModal.canonicalItemId).toBe(omni.canonicalItemId);
    expect(entityModal.userLocalStartDay).toBe('2026-08-19');
  });

  it('9. month query includes LA September items that fall on Oct 1 UTC', () => {
    const bounds = getUserLocalMonthBounds(2026, 9, LA);
    const lateSep = '2026-10-01T06:30:00.000Z';
    expect(localDayKey(lateSep, LA)).toBe('2026-09-30');
    expect(lateSep >= bounds.startIso && lateSep <= bounds.endIso).toBe(true);
    const earlySepUtc = '2026-09-01T06:30:00.000Z';
    expect(localDayKey(earlySepUtc, LA)).toBe('2026-08-31');
    expect(earlySepUtc >= bounds.startIso && earlySepUtc <= bounds.endIso).toBe(false);
  });

  it('10. DST spring-forward does not shift the civil day', () => {
    const before = '2026-03-08T09:30:00.000Z';
    const after = '2026-03-08T10:30:00.000Z';
    expect(localDayKey(before, LA)).toBe('2026-03-08');
    expect(localDayKey(after, LA)).toBe('2026-03-08');
    const source = item({
      id: 'event:dst',
      occurredAt: after,
      timePrecision: 'exact',
    });
    const projected = projectTemporalItem(source, LA, NOW);
    expect(projected.userLocalStartDay).toBe('2026-03-08');
  });
});

describe('precision mapping', () => {
  it('2. exact timed event is timed on both surfaces with the same id', () => {
    const source = item({
      id: 'event:timed',
      timePrecision: 'exact',
      occurredAt: '2026-08-19T02:30:00.000Z',
      temporal: {
        occurred: {
          start: '2026-08-19T02:30:00.000Z',
          end: null,
          timezone: null,
          precision: 'exact',
          source: 'user_stated',
          status: 'anchored',
          confidence: 0.95,
          expression: '7:30 PM',
        },
        mentionedAt: null, recordedAt: null, knownFrom: null, validFrom: null, validUntil: null, provenance: [],
      },
    });
    const { omni, calendar } = projectTemporalItemForSurfaces(source, LA, NOW);
    expect(omni.isTimed).toBe(true);
    expect(calendar.isTimed).toBe(true);
    expect(omni.isAllDay).toBe(false);
    expect(calendar.canonicalItemId).toBe('event:timed');
  });

  it('3. day precision is all-day and does not invent clock placement flags', () => {
    const source = item({
      id: 'event:day',
      timePrecision: 'date',
      occurredAt: '2026-08-19T12:00:00.000Z',
    });
    const projected = projectTemporalItem(source, LA, NOW);
    expect(projected.isAllDay).toBe(true);
    expect(projected.isTimed).toBe(false);
    expect(projected.calendarPlacement).toBe('day');
  });

  it('4. multi-day range keeps one id and both bounds', () => {
    const source = item({
      id: 'event:trip',
      occurrenceStatus: 'range',
      timePrecision: 'date',
      occurredAt: '2026-08-19T15:00:00.000Z',
      occurredEnd: '2026-08-21T20:00:00.000Z',
    });
    const projected = projectTemporalItem(source, LA, NOW);
    expect(projected.isRange).toBe(true);
    expect(projected.canonicalItemId).toBe('event:trip');
    expect(projected.userLocalStartDay).toBe('2026-08-19');
    expect(projected.userLocalEndDay).toBe('2026-08-21');
    expect(projected.calendarPlacement).toBe('day');
  });

  it('15. approximate month precision is not pinned to an exact day', () => {
    const source = item({
      id: 'event:july-ish',
      timePrecision: 'month',
      occurrenceStatus: 'range',
      occurredAt: '2026-07-01T00:00:00.000Z',
      occurredEnd: '2026-07-31T23:59:59.000Z',
    });
    const projected = projectTemporalItem(source, LA, NOW);
    expect(projected.calendarPlacement).toBe('unscheduled');
    expect(projected.isTimed).toBe(false);
    expect(projected.displayWarnings).toContain('approximate_precision_not_pinned_to_day');
    expect(projected.precision).toBe('month');
  });
});

describe('temporal state', () => {
  it('5. ongoing range with open validUntil is ongoing on both surfaces', () => {
    const source = item({
      id: 'event:job',
      occurrenceStatus: 'range',
      timePrecision: 'date',
      occurredAt: '2025-01-15T16:00:00.000Z',
      occurredEnd: null,
      validFrom: '2025-01-15T16:00:00.000Z',
      validUntil: null,
    });
    const { omni, calendar } = projectTemporalItemForSurfaces(source, LA, NOW);
    expect(omni.temporalState).toBe('ongoing');
    expect(calendar.temporalState).toBe('ongoing');
  });

  it('does not infer ongoing from a missing end on a day event', () => {
    const source = item({
      id: 'event:dinner',
      occurrenceStatus: 'confirmed',
      timePrecision: 'date',
      occurredAt: '2026-08-10T02:00:00.000Z',
      occurredEnd: null,
    });
    expect(projectTemporalItem(source, LA, NOW).temporalState).toBe('past');
  });

  it('6. future start is future on both surfaces', () => {
    const source = item({
      id: 'event:interview',
      occurredAt: '2026-09-01T17:00:00.000Z',
      timePrecision: 'exact',
    });
    const { omni, calendar } = projectTemporalItemForSurfaces(source, LA, NOW);
    expect(omni.temporalState).toBe('future');
    expect(calendar.temporalState).toBe('future');
  });

  it('deriveTemporalState is shared and clock-aware', () => {
    expect(deriveTemporalState({
      isUnresolved: false,
      occurredStart: '2026-09-01T00:00:00.000Z',
      occurredEnd: null,
      occurrenceStatus: 'confirmed',
      now: NOW,
    })).toBe('future');
  });
});

describe('unresolved and sequence-only', () => {
  it('7. unresolved items have no fabricated local day', () => {
    const source = item({
      id: 'event:unknown',
      occurrenceStatus: 'unresolved',
      projectionRole: 'unresolved',
      timePrecision: 'unknown',
      occurredAt: null,
      sortTime: '1970-01-01T00:00:00.000Z',
    });
    const { omni, calendar } = projectTemporalItemForSurfaces(source, LA, NOW);
    expect(omni.isUnresolved).toBe(true);
    expect(calendar.isUnresolved).toBe(true);
    expect(omni.userLocalStartDay).toBeNull();
    expect(calendar.calendarPlacement).toBe('unscheduled');
    expect(omni.occurredStart).toBeNull();
  });

  it('8. sequence-only / unknown precision stays unscheduled', () => {
    const source = item({
      id: 'event:sequence',
      occurrenceStatus: 'unresolved',
      timePrecision: 'unknown',
      occurredAt: null,
      temporal: {
        occurred: {
          start: null, end: null, timezone: null, precision: 'unknown',
          source: 'recording_fallback', status: 'unanchored', confidence: 0, expression: null,
        },
        mentionedAt: null, recordedAt: '2026-08-10T00:00:00.000Z', knownFrom: '2026-08-10T00:00:00.000Z',
        validFrom: null, validUntil: null, provenance: [],
      },
    });
    const projected = projectTemporalItem(source, LA, NOW);
    expect(projected.calendarPlacement).toBe('unscheduled');
    expect(projected.temporalState).toBe('unresolved');
    expect(projected.occurredStart).toBeNull();
  });
});

describe('sort_time is ordering metadata', () => {
  it('11. sort_time B does not change occurrence day A', () => {
    const source = item({
      id: 'event:sorted',
      occurredAt: '2026-08-10T18:00:00.000Z',
      timePrecision: 'date',
      sortTime: '2026-08-15T18:00:00.000Z',
    });
    const projected = projectTemporalItem(source, LA, NOW);
    expect(projected.userLocalStartDay).toBe(localDayKey('2026-08-10T18:00:00.000Z', LA));
    expect(projected.userLocalStartDay).not.toBe(localDayKey('2026-08-15T18:00:00.000Z', LA));
    expect(projected.displayWarnings).toContain('sort_time_does_not_change_occurrence_day');
  });
});

describe('identity', () => {
  it('12. Omni and Calendar keep the same canonical id', () => {
    const source = item({ id: 'event:stable' });
    const { omni, calendar, entityModal } = projectTemporalItemForSurfaces(source, LA, NOW);
    expect(omni.canonicalItemId).toBe('event:stable');
    expect(calendar.canonicalItemId).toBe('event:stable');
    expect(entityModal.canonicalItemId).toBe('event:stable');
  });

  it('13. a range is one projection, not N cloned ids', () => {
    const source = item({
      id: 'event:festival',
      occurrenceStatus: 'range',
      occurredAt: '2026-08-21T16:00:00.000Z',
      occurredEnd: '2026-08-23T04:00:00.000Z',
    });
    const projected = projectTemporalItem(source, LA, NOW);
    expect(projected.canonicalItemId).toBe('event:festival');
    expect(projected.isRange).toBe(true);
  });
});

describe('diagnostics', () => {
  it('reports matching Omni and Calendar meaning for a shared item', () => {
    const source = item({
      id: 'event:diag',
      occurredAt: '2026-08-20T02:30:00.000Z',
      timePrecision: 'exact',
    });
    const diag = compareTemporalProjections(source, LA, NOW);
    expect(diag.canonicalItemId).toBe('event:diag');
    expect(diag.omni.localDay).toBe('2026-08-19');
    expect(diag.calendar.localDay).toBe('2026-08-19');
    expect(diag.entityModal.localDay).toBe('2026-08-19');
    expect(diag.omni.temporalState).toBe(diag.calendar.temporalState);
    expect(diag.entityModal.temporalState).toBe(diag.omni.temporalState);
    expect(diag.warnings).not.toContain('omni_calendar_local_day_mismatch');
    expect(diag.warnings).not.toContain('entity_modal_local_day_mismatch');
  });
});
