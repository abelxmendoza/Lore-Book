import { describe, it, expect, vi, beforeEach } from 'vitest';

type Call = { table: string; method: string; args: unknown[] };
type Response = { data: unknown; error?: unknown };

type TestState = {
  responses: Record<string, Response[]>;
  calls: Call[];
};

let state: TestState;

function nextResponse(table: string): Response {
  const queue = state.responses[table];
  if (queue && queue.length > 0) return queue.shift()!;
  return { data: null, error: null };
}

class MockQuery implements PromiseLike<Response> {
  constructor(private table: string) {}

  private log(method: string, args: unknown[]) {
    state.calls.push({ table: this.table, method, args });
  }

  select(...args: unknown[]) {
    this.log('select', args);
    return this;
  }
  eq(...args: unknown[]) {
    this.log('eq', args);
    return this;
  }
  or(...args: unknown[]) {
    this.log('or', args);
    return this;
  }
  order(...args: unknown[]) {
    this.log('order', args);
    return this;
  }
  limit(...args: unknown[]) {
    this.log('limit', args);
    return this;
  }
  contains(...args: unknown[]) {
    this.log('contains', args);
    return this;
  }
  overlaps(...args: unknown[]) {
    this.log('overlaps', args);
    return this;
  }
  in(...args: unknown[]) {
    this.log('in', args);
    return this;
  }
  upsert(...args: unknown[]) {
    this.log('upsert', args);
    return this;
  }
  single() {
    this.log('single', []);
    return Promise.resolve(nextResponse(this.table));
  }
  maybeSingle() {
    this.log('maybeSingle', []);
    return Promise.resolve(nextResponse(this.table));
  }
  then<TResult1 = Response, TResult2 = never>(
    onfulfilled?: ((value: Response) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve(nextResponse(this.table)).then(onfulfilled, onrejected);
  }
}

vi.mock('../../src/services/supabaseClient', () => ({
  supabaseAdmin: {
    from: vi.fn((table: string) => new MockQuery(table)),
  },
}));

vi.mock('../../src/services/organizationService', () => ({
  organizationService: {
    getGroupHierarchy: vi.fn(),
    getMembers: vi.fn(),
    classifyGroupEventAudience: vi.fn(),
  },
}));

vi.mock('../../src/services/events/userPostedEventService', () => ({
  listUserPostedEventsForOrganization: vi.fn(),
}));
vi.mock('../../src/services/organizations/organizationEntityTimelineService', () => ({
  buildCanonicalOrganizationTimeline: vi.fn().mockResolvedValue({
    sharedExperiences: [],
    lore: [],
    unresolved: [],
    legacyOnly: [],
    compatibilityReview: [],
    summary: { lastEventAt: null, lastEventId: null },
  }),
}));
vi.mock('../../src/services/locations/locationEntityTimelineService', () => ({
  buildCanonicalLocationTimeline: vi.fn(),
}));

import { EntityTimelineBuilder, getOrganizationIdsForCharacters } from '../../src/services/conversationCentered/entityTimelineBuilder';
import { organizationService } from '../../src/services/organizationService';
import { listUserPostedEventsForOrganization } from '../../src/services/events/userPostedEventService';
import { buildCanonicalOrganizationTimeline } from '../../src/services/organizations/organizationEntityTimelineService';

const USER_ID = 'user-1';

function upsertCallsFor(table: string) {
  return state.calls.filter((c) => c.table === table && c.method === 'upsert');
}

// Safe defaults for every test — individual tests override with mockResolvedValueOnce/mockReturnValue as needed.
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(organizationService.classifyGroupEventAudience).mockReturnValue('without_user');
  vi.mocked(organizationService.getGroupHierarchy).mockResolvedValue({ subgroups: [], related: [] });
  vi.mocked(organizationService.getMembers).mockResolvedValue([]);
  vi.mocked(listUserPostedEventsForOrganization).mockResolvedValue([]);
  vi.mocked(buildCanonicalOrganizationTimeline).mockResolvedValue({
    sharedExperiences: [],
    lore: [],
    unresolved: [],
    legacyOnly: [],
    compatibilityReview: [],
    summary: { lastEventAt: null, lastEventId: null },
  });
});

describe('EntityTimelineBuilder.buildTimelines', () => {
  beforeEach(() => {
    state = { responses: {}, calls: [] };
  });

  it('organization GET uses canonical chronology, not entity_timeline_events buckets', async () => {
    const builder = new EntityTimelineBuilder('organization');
    const result = await builder.buildTimelines(USER_ID, 'org-1', 'America/Los_Angeles');

    expect(buildCanonicalOrganizationTimeline).toHaveBeenCalledWith(USER_ID, 'org-1', 'America/Los_Angeles');
    expect(result.sharedExperiences).toEqual([]);
    expect(state.calls.filter((c) => c.table === 'entity_timeline_events' && c.method === 'select')).toHaveLength(0);
  });
});

describe('EntityTimelineBuilder compatibility stop-write', () => {
  beforeEach(() => {
    state = { responses: {}, calls: [] };
  });

  it('does not write entity_timeline_events for a new location event', async () => {
    const builder = new EntityTimelineBuilder('location');
    await builder.processEventForEntity(USER_ID, 'loc-1', 'ev-1', {
      title: 'Night at Northwind Depot',
      summary: 'Worked a night shift.',
      type: 'visit',
      start_time: '2026-08-10T18:00:00Z',
      people: ['self-char-1'],
    });
    expect(upsertCallsFor('entity_timeline_events')).toHaveLength(0);
    expect(state.calls.filter((c) => c.table === 'entity_timeline_events')).toHaveLength(0);
  });

  it('does not write entity_timeline_events for a new organization event', async () => {
    const builder = new EntityTimelineBuilder('organization');
    await builder.processEventForEntity(USER_ID, 'org-acme', 'ev-1', {
      title: 'Started at Acme',
      summary: 'First week onboarding.',
      type: 'work',
      start_time: '2026-08-10T18:00:00Z',
      people: ['member-1'],
    });
    expect(upsertCallsFor('entity_timeline_events')).toHaveLength(0);
    expect(state.calls.filter((c) => c.table === 'entity_timeline_events')).toHaveLength(0);
  });

  it('rebuild does not recreate location chronology from resolved_events or episodes', async () => {
    state.responses['resolved_events'] = [
      {
        data: [{
          id: 'ev-1',
          title: 'Beach trip',
          start_time: '2026-02-01T00:00:00Z',
          people: ['self-char-1'],
          locations: ['loc-1'],
        }],
        error: null,
      },
    ];
    state.responses['episodes'] = [
      { data: [{ id: 'episode-1', title: 'The Old Pier', start_at: '2026-04-01T00:00:00Z' }], error: null },
    ];

    const builder = new EntityTimelineBuilder('location');
    const result = await builder.rebuildTimelinesForEntity(USER_ID, 'loc-1');

    expect(result).toMatchObject({ rebuilt: false, deprecated: true, writesEnabled: false });
    expect(state.calls.some((c) => c.table === 'resolved_events')).toBe(false);
    expect(state.calls.some((c) => c.table === 'episodes')).toBe(false);
    expect(upsertCallsFor('entity_timeline_events')).toHaveLength(0);
  });

  it('rebuild does not recreate organization chronology from member overlap or posted events', async () => {
    state.responses['organization_members'] = [
      { data: [{ character_id: 'member-1' }, { character_id: 'member-2' }], error: null },
    ];
    vi.mocked(listUserPostedEventsForOrganization).mockResolvedValue([
      {
        id: 'posted-1',
        title: 'Company picnic',
        summary: 'Posted from the Life Log',
        type: 'event',
        start_time: '2026-05-01T00:00:00Z',
        locations: [],
        people: [],
        activities: [],
        confidence: 1,
        metadata: {},
        created_at: '2026-05-01T00:00:00Z',
        updated_at: '2026-05-01T00:00:00Z',
      },
    ]);

    const builder = new EntityTimelineBuilder('organization');
    const result = await builder.rebuildTimelinesForEntity(USER_ID, 'org-1');

    expect(result).toMatchObject({ rebuilt: false, deprecated: true, writesEnabled: false });
    expect(listUserPostedEventsForOrganization).not.toHaveBeenCalled();
    expect(state.calls.some((c) => c.table === 'resolved_events')).toBe(false);
    expect(state.calls.some((c) => c.table === 'conversation_sessions')).toBe(false);
    expect(upsertCallsFor('entity_timeline_events')).toHaveLength(0);
  });

  it('does not write an episode-sourced compatibility row', async () => {
    const builder = new EntityTimelineBuilder('location');
    await builder.processEpisodeForEntity(USER_ID, 'loc-1', {
      id: 'episode-1',
      title: 'The Old Pier',
      start_at: '2026-04-01T00:00:00Z',
    });
    expect(upsertCallsFor('entity_timeline_events')).toHaveLength(0);
  });
});

describe('getOrganizationIdsForCharacters', () => {
  beforeEach(() => {
    state = { responses: {}, calls: [] };
  });

  it('returns distinct organization ids for the given character ids', async () => {
    state.responses['organization_members'] = [
      {
        data: [
          { organization_id: 'org-1' },
          { organization_id: 'org-2' },
          { organization_id: 'org-1' },
        ],
        error: null,
      },
    ];

    const result = await getOrganizationIdsForCharacters(USER_ID, ['char-1', 'char-2']);

    expect(result.sort()).toEqual(['org-1', 'org-2']);
    const inCall = state.calls.find((c) => c.table === 'organization_members' && c.method === 'eq' && c.args[0] === 'status');
    expect(inCall).toBeTruthy();
  });

  it('returns an empty array without querying when given no character ids', async () => {
    const result = await getOrganizationIdsForCharacters(USER_ID, []);
    expect(result).toEqual([]);
    expect(state.calls).toHaveLength(0);
  });
});
