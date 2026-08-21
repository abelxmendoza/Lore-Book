import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { StitchedTimelineItem } from '../chronologyV2/stitchedTimelineService';
import { stitchedTimelineService } from '../chronologyV2/stitchedTimelineService';
import { supabaseAdmin } from '../supabaseClient';
import {
  buildCanonicalCharacterTimeline,
  CHARACTER_DATE_FIELD_AUTHORITY,
  getFirstKnownAppearance,
  getLastEntityInteraction,
  getLastEntityMention,
  projectCharacterTimelineFromSources,
  sameTemporalIdentity,
} from './characterEntityTimelineService';

vi.mock('../supabaseClient', () => ({
  supabaseAdmin: { from: vi.fn() },
}));
vi.mock('../chronologyV2/stitchedTimelineService', () => ({
  stitchedTimelineService: {
    getStitchedTimeline: vi.fn(),
  },
}));
vi.mock('../../logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock('../temporal/userTimezoneService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../temporal/userTimezoneService')>();
  return {
    ...actual,
    getUserTimezone: vi.fn().mockResolvedValue('America/Los_Angeles'),
  };
});

const LA = 'America/Los_Angeles';
const NOW = new Date('2026-08-20T17:00:00Z');
const JAMIE = 'char-jamie';

function localDayKey(iso: string, timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(iso));
}

function projectTemporalItem(
  item: StitchedTimelineItem,
  timezone: string,
  _now: Date,
  _surface: string,
) {
  const occurredStart = item.occurrenceStatus === 'unresolved' ? null : item.occurredAt ?? item.temporal?.occurred.start ?? null;
  return {
    canonicalItemId: item.id,
    occurredStart,
    occurredEnd: item.occurredEnd ?? item.temporal?.occurred.end ?? null,
    userLocalStartDay: occurredStart ? localDayKey(occurredStart, timezone) : null,
    timezone,
    isUnresolved: !occurredStart,
    isTimed: Boolean(occurredStart && item.timePrecision === 'exact'),
  };
}

function projectTemporalItemForSurfaces(item: StitchedTimelineItem, timezone: string, now: Date) {
  const entityModal = projectTemporalItem(item, timezone, now, 'entity_modal');
  return { omni: entityModal, calendar: entityModal, entityModal };
}

function stitched(over: Partial<StitchedTimelineItem> & Pick<StitchedTimelineItem, 'id'>): StitchedTimelineItem {
  const sourceId = over.sourceId ?? over.id.replace(/^event:/, '');
  return {
    kind: 'event',
    sourceId,
    sourceIds: over.sourceIds ?? [sourceId],
    sourceKind: 'resolved_event',
    sourceType: 'resolved_event',
    sortTime: over.occurredAt ?? '2026-08-20T12:00:00.000Z',
    userSortIndex: null,
    title: 'Dinner with Jamie',
    body: '',
    timePrecision: 'date',
    occurrenceStatus: 'confirmed',
    userPresence: 'attended',
    occurredAt: '2026-08-20T12:00:00.000Z',
    ...over,
  };
}

function temporal(start: string | null, extra: Partial<StitchedTimelineItem['temporal']> & {
  end?: string | null;
  precision?: string;
  mentionedAt?: string | null;
  recordedAt?: string | null;
  validFrom?: string | null;
  validUntil?: string | null;
} = {}): NonNullable<StitchedTimelineItem['temporal']> {
  return {
    occurred: {
      start,
      end: extra.end ?? null,
      timezone: null,
      precision: (extra.precision as 'exact' | 'date' | 'unknown') ?? (start ? 'date' : 'unknown'),
      source: 'user_stated',
      status: start ? 'anchored' : 'unanchored',
      confidence: 0.9,
      expression: null,
    },
    mentionedAt: extra.mentionedAt ?? null,
    recordedAt: extra.recordedAt ?? null,
    knownFrom: null,
    validFrom: extra.validFrom ?? null,
    validUntil: extra.validUntil ?? null,
    provenance: [],
  };
}

describe('character entity timeline — shared projection', () => {
  it('occurrence authority is the canonical temporal model, not card or legacy dates', () => {
    expect(CHARACTER_DATE_FIELD_AUTHORITY.occurrence).toBe('canonical_temporal_model.occurred');
    expect(CHARACTER_DATE_FIELD_AUTHORITY.firstAppearance).toBe('card_metadata_not_occurrence');
    expect(CHARACTER_DATE_FIELD_AUTHORITY.relationshipState).toBe('character_relationship_history');
  });
  it('1. Omni, Calendar, and Character modal share canonical ID and local day', () => {
    const item = stitched({
      id: 'event:memo-vault-dinner',
      occurredAt: '2026-08-10T18:00:00.000Z',
      timePrecision: 'date',
      temporal: temporal('2026-08-10T18:00:00.000Z'),
    });
    const { omni, calendar, entityModal } = projectTemporalItemForSurfaces(item, LA, NOW);
    const modal = projectCharacterTimelineFromSources({
      entityId: JAMIE,
      timezone: LA,
      now: NOW,
      stitchedItems: [item],
    });
    const shown = [...modal.sharedExperiences, ...modal.lore][0];
    expect(omni.canonicalItemId).toBe('event:memo-vault-dinner');
    expect(calendar.canonicalItemId).toBe(omni.canonicalItemId);
    expect(entityModal.canonicalItemId).toBe(omni.canonicalItemId);
    expect(shown?.canonicalItemId).toBe(omni.canonicalItemId);
    expect(shown?.userLocalStartDay).toBe(omni.userLocalStartDay);
    expect(shown?.entityId).toBe(JAMIE);
    expect(sameTemporalIdentity(omni, calendar)).toBe(true);
    expect(sameTemporalIdentity(omni, entityModal)).toBe(true);
    expect(sameTemporalIdentity(omni, {
      canonicalItemId: shown!.canonicalItemId,
      occurredStart: shown!.occurredStart,
      userLocalStartDay: shown!.userLocalStartDay,
    })).toBe(true);
  });

  it('2. UTC ↔ LA boundary matches Omni/Calendar', () => {
    const iso = '2026-08-20T02:30:00.000Z';
    const item = stitched({
      id: 'event:boundary',
      occurredAt: iso,
      timePrecision: 'exact',
      temporal: temporal(iso, { precision: 'exact' }),
    });
    const { omni, calendar, entityModal } = projectTemporalItemForSurfaces(item, LA, NOW);
    const modal = projectCharacterTimelineFromSources({
      entityId: JAMIE,
      timezone: LA,
      now: NOW,
      stitchedItems: [item],
    });
    expect(localDayKey(iso, LA)).toBe('2026-08-19');
    expect(omni.userLocalStartDay).toBe('2026-08-19');
    expect(calendar.userLocalStartDay).toBe('2026-08-19');
    expect(entityModal.userLocalStartDay).toBe('2026-08-19');
    expect(modal.sharedExperiences[0]?.userLocalStartDay).toBe('2026-08-19');
  });

  it('3. exact time is timed on the modal projection', () => {
    const iso = '2026-08-20T02:30:00.000Z';
    const item = stitched({
      id: 'event:exact',
      occurredAt: iso,
      timePrecision: 'exact',
      temporal: temporal(iso, { precision: 'exact' }),
    });
    const projected = projectTemporalItem(item, LA, NOW, 'entity_modal');
    const modal = projectCharacterTimelineFromSources({
      entityId: JAMIE,
      timezone: LA,
      now: NOW,
      stitchedItems: [item],
    });
    expect(projected.isTimed).toBe(true);
    expect(modal.sharedExperiences[0]?.isTimed).toBe(true);
    expect(modal.sharedExperiences[0]?.isAllDay).toBe(false);
    expect(modal.sharedExperiences[0]?.occurredStart).toBe(iso);
  });

  it('4. day precision does not invent a clock time', () => {
    const item = stitched({
      id: 'event:day',
      occurredAt: '2026-08-10T00:00:00.000Z',
      timePrecision: 'date',
      temporal: temporal('2026-08-10T00:00:00.000Z', { precision: 'date' }),
    });
    const modal = projectCharacterTimelineFromSources({
      entityId: JAMIE,
      timezone: LA,
      now: NOW,
      stitchedItems: [item],
    });
    expect(modal.sharedExperiences[0]?.isTimed).toBe(false);
    expect(modal.sharedExperiences[0]?.isAllDay).toBe(true);
    expect(modal.sharedExperiences[0]?.precision).toBe('date');
  });

  it('5. a range stays one item with start–end', () => {
    const item = stitched({
      id: 'event:festival',
      occurrenceStatus: 'range',
      occurredAt: '2026-08-21T16:00:00.000Z',
      occurredEnd: '2026-08-23T04:00:00.000Z',
      temporal: temporal('2026-08-21T16:00:00.000Z', {
        end: '2026-08-23T04:00:00.000Z',
      }),
    });
    const modal = projectCharacterTimelineFromSources({
      entityId: JAMIE,
      timezone: LA,
      now: NOW,
      stitchedItems: [item],
    });
    const shown = [...modal.sharedExperiences, ...modal.unresolved];
    expect(shown).toHaveLength(1);
    expect(shown[0]?.canonicalItemId).toBe('event:festival');
    expect(shown[0]?.isRange).toBe(true);
    expect(shown[0]?.occurredStart).toBe('2026-08-21T16:00:00.000Z');
    expect(shown[0]?.occurredEnd).toBe('2026-08-23T04:00:00.000Z');
  });

  it('8. unresolved items go to the unresolved section with no fabricated day', () => {
    const item = stitched({
      id: 'event:unresolved',
      occurredAt: null,
      timePrecision: 'unknown',
      occurrenceStatus: 'unresolved',
      projectionRole: 'unresolved',
      temporal: temporal(null, { precision: 'unknown' }),
    });
    const modal = projectCharacterTimelineFromSources({
      entityId: JAMIE,
      timezone: LA,
      now: NOW,
      unresolvedItems: [item],
    });
    expect(modal.sharedExperiences).toHaveLength(0);
    expect(modal.lore).toHaveLength(0);
    expect(modal.unresolved).toHaveLength(1);
    expect(modal.unresolved[0]?.canonicalItemId).toBe('event:unresolved');
    expect(modal.unresolved[0]?.occurredStart).toBeNull();
    expect(modal.unresolved[0]?.userLocalStartDay).toBeNull();
    expect(modal.unresolved[0]?.isUnresolved).toBe(true);
    expect(modal.unresolved[0]?.eventDate).toBe('');
  });

  it('9. sequence-only items are not assigned a date', () => {
    const item = stitched({
      id: 'event:sequence',
      occurredAt: null,
      sortTime: '2026-08-20T12:00:00.000Z',
      occurrenceStatus: 'unresolved',
      projectionRole: 'unresolved',
      timePrecision: 'unknown',
    });
    const modal = projectCharacterTimelineFromSources({
      entityId: JAMIE,
      timezone: LA,
      now: NOW,
      unresolvedItems: [item],
    });
    expect(modal.unresolved[0]?.occurredStart).toBeNull();
    expect(modal.unresolved[0]?.userLocalStartDay).toBeNull();
    expect(modal.unresolved[0]?.eventDate).toBe('');
  });

  it('10. last interaction is the latest grounded occurrence', () => {
    const older = stitched({
      id: 'event:older',
      occurredAt: '2024-01-15T18:00:00.000Z',
      temporal: temporal('2024-01-15T18:00:00.000Z'),
    });
    const newer = stitched({
      id: 'event:newer',
      occurredAt: '2026-07-04T18:00:00.000Z',
      temporal: temporal('2026-07-04T18:00:00.000Z'),
    });
    const modal = projectCharacterTimelineFromSources({
      entityId: JAMIE,
      timezone: LA,
      now: NOW,
      stitchedItems: [older, newer],
    });
    expect(modal.summary.lastInteractionId).toBe('event:newer');
    expect(modal.summary.lastInteractionAt).toBe('2026-07-04T18:00:00.000Z');
    const picked = getLastEntityInteraction([...modal.sharedExperiences, ...modal.lore]);
    expect(picked?.id).toBe('event:newer');
  });

  it('11. last mention stays distinct from last interaction', () => {
    const oldEvent = stitched({
      id: 'event:old-trip',
      occurredAt: '2020-06-01T18:00:00.000Z',
      mentionedAt: '2026-08-18T16:00:00.000Z',
      temporal: {
        ...temporal('2020-06-01T18:00:00.000Z'),
        mentionedAt: '2026-08-18T16:00:00.000Z',
      },
    });
    const modal = projectCharacterTimelineFromSources({
      entityId: JAMIE,
      timezone: LA,
      now: NOW,
      stitchedItems: [oldEvent],
    });
    expect(modal.summary.lastInteractionAt).toBe('2020-06-01T18:00:00.000Z');
    expect(modal.summary.lastMentionedAt).toBe('2026-08-18T16:00:00.000Z');
    expect(getLastEntityMention([...modal.sharedExperiences, ...modal.lore])?.at).toBe(
      '2026-08-18T16:00:00.000Z',
    );
    expect(modal.summary.lastInteractionAt).not.toBe(modal.summary.lastMentionedAt);
  });

  it('12. first known appearance uses canonical occurrence, not created_at', () => {
    const first = stitched({
      id: 'event:first',
      occurredAt: '2019-03-01T18:00:00.000Z',
      temporal: temporal('2019-03-01T18:00:00.000Z'),
    });
    const later = stitched({
      id: 'event:later',
      occurredAt: '2024-03-01T18:00:00.000Z',
      temporal: temporal('2024-03-01T18:00:00.000Z'),
    });
    const modal = projectCharacterTimelineFromSources({
      entityId: JAMIE,
      timezone: LA,
      now: NOW,
      stitchedItems: [later, first],
    });
    expect(getFirstKnownAppearance([...modal.sharedExperiences, ...modal.lore])?.id).toBe('event:first');
    expect(modal.summary.firstKnownAppearanceAt).toBe('2019-03-01T18:00:00.000Z');
    expect(modal.summary.firstKnownAppearanceAt).not.toBe('2010-01-01T00:00:00.000Z');
  });

  it('13. a matching legacy row does not override the canonical item', () => {
    const item = stitched({
      id: 'event:canonical',
      sourceId: 'evt-1',
      sourceIds: ['evt-1'],
      occurredAt: '2026-08-01T18:00:00.000Z',
      temporal: temporal('2026-08-01T18:00:00.000Z'),
    });
    const modal = projectCharacterTimelineFromSources({
      entityId: JAMIE,
      timezone: LA,
      now: NOW,
      stitchedItems: [item],
    });
    expect(modal.sharedExperiences[0]?.occurredStart).toBe('2026-08-01T18:00:00.000Z');
    expect(modal.legacyOnly).toHaveLength(0);
  });

  it('14. an episode-only leftover is not Character Timeline chronology', () => {
    const modal = projectCharacterTimelineFromSources({
      entityId: JAMIE,
      timezone: LA,
      now: NOW,
      stitchedItems: [],
    });
    expect(modal.sharedExperiences).toHaveLength(0);
    expect(modal.lore).toHaveLength(0);
    expect(modal.legacyOnly).toHaveLength(0);
  });

  it('16. entity scope is the requested entityId, not a display name', () => {
    const item = stitched({
      id: 'event:tio',
      title: 'Tío Juan at MemoVault',
      occurredAt: '2026-08-10T18:00:00.000Z',
      temporal: temporal('2026-08-10T18:00:00.000Z'),
    });
    const modal = projectCharacterTimelineFromSources({
      entityId: 'char-oscuridad-juan',
      timezone: LA,
      now: NOW,
      stitchedItems: [item],
    });
    expect(modal.sharedExperiences[0]?.entityId).toBe('char-oscuridad-juan');
    expect(modal.sharedExperiences[0]?.entityId).not.toBe('Tío Juan');
  });

  it('17. a dated unmatched legacy row is not chronology and does not move summaries', () => {
    const canonical = stitched({
      id: 'event:real',
      occurredAt: '2026-06-01T18:00:00.000Z',
      temporal: temporal('2026-06-01T18:00:00.000Z'),
    });
    const modal = projectCharacterTimelineFromSources({
      entityId: JAMIE,
      timezone: LA,
      now: NOW,
      stitchedItems: [canonical],
    });
    const datedIds = [...modal.sharedExperiences, ...modal.lore, ...modal.unresolved, ...modal.legacyOnly]
      .map((row) => row.id);
    expect(datedIds).toEqual(['event:real']);
    expect(modal.summary.firstKnownAppearanceAt).toBe('2026-06-01T18:00:00.000Z');
    expect(modal.summary.lastInteractionAt).toBe('2026-06-01T18:00:00.000Z');
  });

  it('does not fill unresolved occurrence from a matching legacy event_date', () => {
    const unresolved = stitched({
      id: 'event:unresolved-maya',
      occurredAt: null,
      timePrecision: 'unknown',
      occurrenceStatus: 'unresolved',
      projectionRole: 'unresolved',
      temporal: temporal(null, { precision: 'unknown' }),
    });
    const modal = projectCharacterTimelineFromSources({
      entityId: JAMIE,
      timezone: LA,
      now: NOW,
      unresolvedItems: [unresolved],
    });
    expect(modal.unresolved[0]?.occurredStart).toBeNull();
    expect(modal.unresolved[0]?.userLocalStartDay).toBeNull();
    expect(modal.summary.firstKnownAppearanceAt).toBeNull();
    expect(modal.summary.firstKnownOccurrenceAt).toBeNull();
    expect(modal.summary.lastInteractionAt).toBeNull();
  });

  it('first mention is not first known occurrence', () => {
    const item = stitched({
      id: 'event:july-dinner',
      occurredAt: '2026-07-12T19:30:00.000Z',
      mentionedAt: '2026-06-01T12:00:00.000Z',
      recordedAt: '2026-08-21T15:00:00.000Z',
      temporal: temporal('2026-07-12T19:30:00.000Z', {
        mentionedAt: '2026-06-01T12:00:00.000Z',
        recordedAt: '2026-08-21T15:00:00.000Z',
      }),
    });
    const modal = projectCharacterTimelineFromSources({
      entityId: JAMIE,
      timezone: LA,
      now: NOW,
      stitchedItems: [item],
    });
    expect(modal.summary.firstKnownOccurrenceAt).toBe('2026-07-12T19:30:00.000Z');
    expect(modal.summary.lastKnownOccurrenceAt).toBe('2026-07-12T19:30:00.000Z');
    expect(modal.summary.firstMentionedAt).toBe('2026-06-01T12:00:00.000Z');
    expect(modal.summary.firstKnownOccurrenceAt).not.toBe(modal.summary.firstMentionedAt);
    expect(modal.summary.firstKnownOccurrenceAt).not.toBe('1999-01-01T00:00:00.000Z');
  });

  it('does not surface CTE-only leftovers on Character Timeline', () => {
    const canonical = stitched({
      id: 'event:evt_new',
      sourceId: 'evt_new',
      occurredAt: '2026-03-12T19:00:00.000Z',
      temporal: temporal('2026-03-12T19:00:00.000Z'),
    });
    const modal = projectCharacterTimelineFromSources({
      entityId: 'char-maya-chen',
      timezone: LA,
      now: NOW,
      stitchedItems: [canonical],
    });
    expect(modal.sharedExperiences[0]?.eventId).toBe('evt_new');
    expect(modal.sharedExperiences[0]?.occurredStart).toBe('2026-03-12T19:00:00.000Z');
  });
});

describe('buildCanonicalCharacterTimeline tenant isolation', () => {
  it('loads stitched timeline by user and character only', async () => {
    vi.mocked(stitchedTimelineService.getStitchedTimeline).mockResolvedValue({
      scope_type: 'global',
      scope_id: '00000000-0000-0000-0000-000000000000',
      scope_label: null,
      items: [],
      has_user_order: false,
      unresolved_items: [],
    });

    await buildCanonicalCharacterTimeline('user-a', JAMIE, LA);

    expect(stitchedTimelineService.getStitchedTimeline).toHaveBeenCalledWith('user-a', {
      character_id: JAMIE,
    });
    expect(supabaseAdmin.from).not.toHaveBeenCalled();
  });
});
