import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { StitchedTimelineItem } from '../chronologyV2/stitchedTimelineService';
import { stitchedTimelineService } from '../chronologyV2/stitchedTimelineService';
import { supabaseAdmin } from '../supabaseClient';
import { projectTemporalItemForSurfaces } from '../temporal/temporalSurfaceProjection';
import {
  LOCATION_DATE_FIELD_AUTHORITY,
  projectLocationTimelineFromSources,
  sameTemporalIdentity,
  buildCanonicalLocationTimeline,
} from './locationEntityTimelineService';

vi.mock('../supabaseClient', () => ({
  supabaseAdmin: { from: vi.fn() },
}));
vi.mock('../chronologyV2/stitchedTimelineService', () => ({
  stitchedTimelineService: {
    getStitchedTimelineForLocation: vi.fn(),
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
const DEPOT = 'loc-northwind';

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
    title: 'Show at Northwind Depot',
    body: '',
    timePrecision: 'date',
    occurrenceStatus: 'confirmed',
    userPresence: 'attended',
    occurredAt: '2026-08-20T12:00:00.000Z',
    ...over,
  };
}

function temporal(start: string | null): NonNullable<StitchedTimelineItem['temporal']> {
  return {
    occurred: {
      start,
      end: null,
      timezone: null,
      precision: start ? 'date' : 'unknown',
      source: 'user_stated',
      status: start ? 'anchored' : 'unanchored',
      confidence: 0.9,
      expression: null,
    },
    mentionedAt: null,
    recordedAt: null,
    knownFrom: null,
    validFrom: null,
    validUntil: null,
    provenance: [],
  };
}

describe('location entity timeline — shared projection', () => {
  it('occurrence authority is the canonical temporal model, not firstVisited or legacy dates', () => {
    expect(LOCATION_DATE_FIELD_AUTHORITY.occurrence).toBe('canonical_temporal_model.occurred');
    expect(LOCATION_DATE_FIELD_AUTHORITY.legacyEventDate).toBe('compatibility_not_occurrence');
    expect(LOCATION_DATE_FIELD_AUTHORITY.firstVisited).toBe('card_metadata_not_occurrence');
  });

  it('Omni, Calendar, and Location modal share canonical ID and local day', () => {
    const item = stitched({
      id: 'event:depot-show',
      occurredAt: '2026-08-10T18:00:00.000Z',
      temporal: temporal('2026-08-10T18:00:00.000Z'),
    });
    const { omni, calendar, entityModal } = projectTemporalItemForSurfaces(item, LA, NOW);
    const modal = projectLocationTimelineFromSources({
      entityId: DEPOT,
      timezone: LA,
      now: NOW,
      stitchedItems: [item],
    });
    const shown = [...modal.sharedExperiences, ...modal.lore][0];
    expect(sameTemporalIdentity(omni, calendar)).toBe(true);
    expect(sameTemporalIdentity(omni, entityModal)).toBe(true);
    expect(sameTemporalIdentity(omni, {
      canonicalItemId: shown!.canonicalItemId,
      occurredStart: shown!.occurredStart,
      userLocalStartDay: shown!.userLocalStartDay,
    })).toBe(true);
    expect(shown?.entityId).toBe(DEPOT);
  });

  it('unresolved items get no fabricated day', () => {
    const modal = projectLocationTimelineFromSources({
      entityId: DEPOT,
      timezone: LA,
      now: NOW,
      unresolvedItems: [stitched({
        id: 'event:unresolved',
        occurredAt: null,
        timePrecision: 'unknown',
        occurrenceStatus: 'unresolved',
        projectionRole: 'unresolved',
        temporal: temporal(null),
      })],
    });
    expect(modal.sharedExperiences).toHaveLength(0);
    expect(modal.unresolved[0]?.occurredStart).toBeNull();
    expect(modal.unresolved[0]?.userLocalStartDay).toBeNull();
  });

  it('a matching legacy row does not override the canonical item', () => {
    const item = stitched({
      id: 'event:canonical',
      sourceId: 'evt-1',
      sourceIds: ['evt-1'],
      occurredAt: '2026-08-01T18:00:00.000Z',
      temporal: temporal('2026-08-01T18:00:00.000Z'),
    });
    const modal = projectLocationTimelineFromSources({
      entityId: DEPOT,
      timezone: LA,
      now: NOW,
      stitchedItems: [item],
      legacyRows: [{
        id: 'legacy-1',
        event_id: 'evt-1',
        event_title: 'Show at Northwind Depot',
        event_date: '2020-01-01T00:00:00.000Z',
      }],
    });
    expect(modal.sharedExperiences[0]?.occurredStart).toBe('2026-08-01T18:00:00.000Z');
    expect(modal.legacyOnly).toHaveLength(0);
  });

  it('a dated unmatched legacy row is not chronology', () => {
    const canonical = stitched({
      id: 'event:real',
      occurredAt: '2026-06-01T18:00:00.000Z',
      temporal: temporal('2026-06-01T18:00:00.000Z'),
    });
    const modal = projectLocationTimelineFromSources({
      entityId: DEPOT,
      timezone: LA,
      now: NOW,
      stitchedItems: [canonical],
      legacyRows: [{
        id: 'legacy-dated',
        event_id: 'evt-ghost',
        event_title: 'Invented first visit',
        event_date: '1999-01-01T00:00:00.000Z',
      }],
    });
    expect([...modal.sharedExperiences, ...modal.lore, ...modal.unresolved].map((row) => row.id)).toEqual(['event:real']);
    expect(modal.compatibilityReview[0]?.reason).toBe('legacy_unmatched');
    expect(modal.compatibilityReview[0]).toMatchObject({
      entityId: DEPOT,
      creationPath: 'resolved_event',
      canonicalMatch: false,
      canonicalAssociation: 'not_on_this_timeline',
      dateVerified: false,
      hasLegacyDate: true,
      archiveCandidate: true,
      label: 'Legacy record — date not verified',
      usage: 'compatibility_only',
    });
    expect(modal.summary.firstKnownVisitAt).toBe('2026-06-01T18:00:00.000Z');
  });

  it('an episode-only row is quarantined, not dated from start_at', () => {
    const modal = projectLocationTimelineFromSources({
      entityId: DEPOT,
      timezone: LA,
      now: NOW,
      stitchedItems: [],
      legacyRows: [{
        id: 'ep-row',
        event_id: null,
        source_episode_id: 'episode-1',
        event_title: 'Wrong scene at another venue',
        event_date: '2026-04-01T00:00:00.000Z',
      }],
    });
    expect(modal.sharedExperiences).toHaveLength(0);
    expect(modal.legacyOnly).toHaveLength(0);
    expect(modal.compatibilityReview[0]?.reason).toBe('contaminated_primary_entity');
    expect(modal.compatibilityReview[0]).toMatchObject({
      creationPath: 'episode',
      canonicalAssociation: 'not_an_event_association',
      dateVerified: false,
      hasLegacyDate: true,
    });
    expect(modal.compatibilityReview[0]).not.toHaveProperty('event_date');
    expect(modal.compatibilityReview[0]).not.toHaveProperty('occurredStart');
  });

  it('legacy created_at cannot become occurrence', () => {
    const modal = projectLocationTimelineFromSources({
      entityId: DEPOT,
      timezone: LA,
      now: NOW,
      stitchedItems: [],
      legacyRows: [{
        id: 'legacy-created',
        event_id: 'evt-ghost',
        event_title: 'Inserted later',
        event_date: null,
        created_at: '2026-08-21T00:00:00.000Z',
      }],
    });
    expect(modal.sharedExperiences).toHaveLength(0);
    expect(modal.unresolved).toHaveLength(0);
    expect(modal.compatibilityReview[0]).toMatchObject({
      hasLegacyCreatedAt: true,
      hasLegacyDate: false,
      dateVerified: false,
      canonicalMatch: false,
    });
  });
});

describe('buildCanonicalLocationTimeline tenant isolation', () => {
  it('queries entity_timeline_events by user, type=location, and entity id', async () => {
    vi.mocked(stitchedTimelineService.getStitchedTimelineForLocation).mockResolvedValue({
      scope_type: 'global',
      scope_id: '00000000-0000-0000-0000-000000000000',
      scope_label: null,
      items: [],
      has_user_order: false,
      unresolved_items: [],
    });
    const chain: {
      select: () => typeof chain;
      eq: ReturnType<typeof vi.fn>;
    } = {
      select: () => chain,
      eq: vi.fn(),
    };
    chain.eq.mockImplementation((column: string) => {
      if (column === 'entity_id') return Promise.resolve({ data: [], error: null });
      return chain;
    });
    vi.mocked(supabaseAdmin.from).mockReturnValue(chain as never);

    await buildCanonicalLocationTimeline('user-a', DEPOT, LA);

    expect(stitchedTimelineService.getStitchedTimelineForLocation).toHaveBeenCalledWith('user-a', DEPOT, {
      timezone: LA,
    });
    expect(supabaseAdmin.from).toHaveBeenCalledWith('entity_timeline_events');
    expect(chain.eq).toHaveBeenCalledWith('user_id', 'user-a');
    expect(chain.eq).toHaveBeenCalledWith('entity_type', 'location');
    expect(chain.eq).toHaveBeenCalledWith('entity_id', DEPOT);
  });
});
