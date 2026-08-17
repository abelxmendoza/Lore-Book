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

import { EntityTimelineBuilder, getOrganizationIdsForCharacters } from '../../src/services/conversationCentered/entityTimelineBuilder';
import { organizationService } from '../../src/services/organizationService';
import { listUserPostedEventsForOrganization } from '../../src/services/events/userPostedEventService';

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
});

describe('EntityTimelineBuilder.buildTimelines', () => {
  beforeEach(() => {
    state = { responses: {}, calls: [] };
  });

  it('buckets rows into sharedExperiences vs lore by timeline_type', async () => {
    state.responses['entity_timeline_events'] = [
      {
        data: [
          {
            id: 'row-1',
            event_id: 'ev-1',
            source_thread_id: null,
            event_title: 'Board meeting',
            event_date: '2026-01-01T00:00:00Z',
            event_summary: 'Quarterly review',
            event_type: 'meeting',
            timeline_type: 'shared_experience',
            entity_role: 'participant',
            user_was_present: true,
            confidence: 0.7,
          },
          {
            id: 'row-2',
            event_id: 'ev-2',
            source_thread_id: null,
            event_title: 'Company history',
            event_date: '2025-06-01T00:00:00Z',
            event_summary: 'Founding story',
            event_type: 'lore',
            timeline_type: 'lore',
            entity_role: 'subject',
            user_was_present: false,
            confidence: 0.7,
          },
        ],
        error: null,
      },
    ];

    const builder = new EntityTimelineBuilder('organization');
    const result = await builder.buildTimelines(USER_ID, 'org-1');

    expect(result.sharedExperiences).toHaveLength(1);
    expect(result.sharedExperiences[0].id).toBe('row-1');
    expect(result.lore).toHaveLength(1);
    expect(result.lore[0].id).toBe('row-2');
  });
});

describe('EntityTimelineBuilder.rebuildTimelinesForEntity — location', () => {
  beforeEach(() => {
    state = { responses: {}, calls: [] };
  });

  it('matches resolved_events via .contains(locations, [id]) and upserts a visited entry', async () => {
    state.responses['resolved_events'] = [
      {
        data: [
          {
            id: 'ev-1',
            title: 'Beach trip',
            summary: 'A day at the pier',
            type: 'outing',
            start_time: '2026-02-01T00:00:00Z',
            people: ['self-char-1'],
          },
        ],
        error: null,
      },
    ];
    state.responses['characters'] = [{ data: { id: 'self-char-1' }, error: null }];
    state.responses['conversation_sessions'] = [{ data: [], error: null }];

    const builder = new EntityTimelineBuilder('location');
    await builder.rebuildTimelinesForEntity(USER_ID, 'loc-1');

    const containsCall = state.calls.find((c) => c.table === 'resolved_events' && c.method === 'contains');
    expect(containsCall).toBeTruthy();
    expect(containsCall!.args).toEqual(['locations', ['loc-1']]);

    const upserts = upsertCallsFor('entity_timeline_events');
    expect(upserts).toHaveLength(1);
    const payload = upserts[0].args[0] as Record<string, unknown>;
    expect(payload).toMatchObject({
      entity_type: 'location',
      entity_id: 'loc-1',
      event_id: 'ev-1',
      timeline_type: 'shared_experience',
      entity_role: 'visited',
      user_was_present: true,
    });
  });

  it('classifies as lore when the self character is not present', async () => {
    state.responses['resolved_events'] = [
      {
        data: [
          {
            id: 'ev-1',
            title: 'Someone else\'s visit',
            summary: 'Heard about it later',
            type: 'story',
            start_time: '2026-02-01T00:00:00Z',
            people: ['other-char'],
          },
        ],
        error: null,
      },
    ];
    state.responses['characters'] = [{ data: { id: 'self-char-1' }, error: null }];
    state.responses['conversation_sessions'] = [{ data: [], error: null }];

    const builder = new EntityTimelineBuilder('location');
    await builder.rebuildTimelinesForEntity(USER_ID, 'loc-1');

    const payload = upsertCallsFor('entity_timeline_events')[0].args[0] as Record<string, unknown>;
    expect(payload).toMatchObject({ timeline_type: 'lore', user_was_present: false, entity_role: 'visited' });
  });
});

describe('EntityTimelineBuilder.rebuildTimelinesForEntity — organization', () => {
  beforeEach(() => {
    state = { responses: {}, calls: [] };
  });

  it('resolves active members then matches resolved_events via .overlaps(people, memberIds)', async () => {
    state.responses['organization_members'] = [
      { data: [{ character_id: 'member-1' }, { character_id: 'member-2' }], error: null },
    ];
    state.responses['resolved_events'] = [
      {
        data: [
          {
            id: 'ev-1',
            title: 'Team offsite',
            summary: 'Annual retreat',
            type: 'event',
            start_time: '2026-03-01T00:00:00Z',
            people: ['member-1'],
          },
        ],
        error: null,
      },
    ];
    state.responses['characters'] = [{ data: { id: 'self-char-1' }, error: null }];
    state.responses['conversation_sessions'] = [{ data: [], error: null }];

    const builder = new EntityTimelineBuilder('organization');
    await builder.rebuildTimelinesForEntity(USER_ID, 'org-1');

    const overlapsCall = state.calls.find((c) => c.table === 'resolved_events' && c.method === 'overlaps');
    expect(overlapsCall).toBeTruthy();
    expect(overlapsCall!.args).toEqual(['people', ['member-1', 'member-2']]);

    const payload = upsertCallsFor('entity_timeline_events')[0].args[0] as Record<string, unknown>;
    expect(payload).toMatchObject({ entity_type: 'organization', entity_id: 'org-1', event_id: 'ev-1' });
  });

  it('skips the resolved_events query entirely when the org has no active members', async () => {
    state.responses['organization_members'] = [{ data: [], error: null }];
    state.responses['conversation_sessions'] = [{ data: [], error: null }];

    const builder = new EntityTimelineBuilder('organization');
    await builder.rebuildTimelinesForEntity(USER_ID, 'org-1');

    expect(state.calls.some((c) => c.table === 'resolved_events')).toBe(false);
    expect(upsertCallsFor('entity_timeline_events')).toHaveLength(0);
  });
});

describe('EntityTimelineBuilder — thread-as-source-row folding', () => {
  beforeEach(() => {
    state = { responses: {}, calls: [] };
  });

  it('folds a primary-entity-linked thread into a lore entry with source_thread_id set and event_id null', async () => {
    state.responses['organization_members'] = [{ data: [], error: null }];
    // First conversation_sessions call: the primary-entity thread list.
    // Second: the per-thread detail fetch inside processThreadForEntity.
    state.responses['conversation_sessions'] = [
      { data: [{ id: 'thread-1' }], error: null },
      {
        data: {
          title: 'Chat about Acme Corp',
          updated_at: '2026-04-01T00:00:00Z',
          metadata: { threadMeta: { summary_short: 'Discussed Acme\'s new office' } },
        },
        error: null,
      },
    ];

    const builder = new EntityTimelineBuilder('organization');
    await builder.rebuildTimelinesForEntity(USER_ID, 'org-1');

    const listCall = state.calls.find(
      (c) => c.table === 'conversation_sessions' && c.method === 'eq' && c.args[0] === 'primary_entity_id'
    );
    expect(listCall).toBeTruthy();

    const upserts = upsertCallsFor('entity_timeline_events');
    expect(upserts).toHaveLength(1);
    const payload = upserts[0].args[0] as Record<string, unknown>;
    expect(payload).toMatchObject({
      entity_type: 'organization',
      entity_id: 'org-1',
      event_id: null,
      source_thread_id: 'thread-1',
      timeline_type: 'lore',
      entity_role: 'mentioned',
      event_summary: "Discussed Acme's new office",
    });
  });

  it('uses "referenced" as the thread entity_role for locations', async () => {
    state.responses['resolved_events'] = [{ data: [], error: null }];
    state.responses['conversation_sessions'] = [
      { data: [{ id: 'thread-1' }], error: null },
      {
        data: {
          title: 'Chat about The Old Pier',
          updated_at: '2026-04-01T00:00:00Z',
          metadata: {},
        },
        error: null,
      },
    ];

    const builder = new EntityTimelineBuilder('location');
    await builder.rebuildTimelinesForEntity(USER_ID, 'loc-1');

    const payload = upsertCallsFor('entity_timeline_events')[0].args[0] as Record<string, unknown>;
    expect(payload).toMatchObject({ entity_role: 'referenced', source_thread_id: 'thread-1' });
  });
});

describe('EntityTimelineBuilder.processEventForEntity — organization fields', () => {
  beforeEach(() => {
    state = { responses: {}, calls: [] };
  });

  it('resolves involved_names from the org roster and audience via organizationService.classifyGroupEventAudience', async () => {
    state.responses['organization_members'] = [
      {
        data: [
          { character_id: 'member-1', character_name: 'Alice' },
          { character_id: 'member-2', character_name: 'Bob' },
        ],
        error: null,
      },
    ];
    state.responses['characters'] = [{ data: { id: 'self-char-1' }, error: null }];
    vi.mocked(organizationService.classifyGroupEventAudience).mockReturnValue('group_wide');
    vi.mocked(organizationService.getGroupHierarchy).mockResolvedValue({
      subgroups: [{ id: 'sg-1', name: 'Core Team' }],
      related: [],
    });
    vi.mocked(organizationService.getMembers).mockResolvedValue([
      { character_id: 'member-1', character_name: 'Alice' } as any,
    ]);

    const builder = new EntityTimelineBuilder('organization');
    await builder.processEventForEntity(USER_ID, 'org-1', 'ev-1', {
      title: 'Team offsite',
      summary: 'Annual retreat',
      type: 'event',
      start_time: '2026-03-01T00:00:00Z',
      people: ['member-1', 'member-2', 'stranger'],
    });

    expect(organizationService.classifyGroupEventAudience).toHaveBeenCalledWith(
      expect.objectContaining({ involved: ['Alice', 'Bob'], title: 'Team offsite' })
    );

    const payload = upsertCallsFor('entity_timeline_events')[0].args[0] as Record<string, unknown>;
    expect(payload).toMatchObject({
      involved_names: ['Alice', 'Bob'],
      audience: 'group_wide',
      subgroup_names: ['Core Team'],
      source: 'conversation',
    });
  });

  it('leaves involved_names/audience/subgroup_names/source null for locations', async () => {
    state.responses['characters'] = [{ data: { id: 'self-char-1' }, error: null }];

    const builder = new EntityTimelineBuilder('location');
    await builder.processEventForEntity(USER_ID, 'loc-1', 'ev-1', {
      title: 'Beach trip',
      type: 'outing',
      start_time: '2026-02-01T00:00:00Z',
      people: ['self-char-1'],
    });

    expect(organizationService.classifyGroupEventAudience).not.toHaveBeenCalled();
    const payload = upsertCallsFor('entity_timeline_events')[0].args[0] as Record<string, unknown>;
    expect(payload).toMatchObject({
      involved_names: null,
      audience: null,
      subgroup_names: null,
      source: null,
    });
  });
});

describe('EntityTimelineBuilder.rebuildTimelinesForEntity — posted-event folding (organizations only)', () => {
  beforeEach(() => {
    state = { responses: {}, calls: [] };
  });

  it('folds a user-posted event with source user_posted, with_user, shared_experience', async () => {
    state.responses['organization_members'] = [{ data: [], error: null }];
    state.responses['conversation_sessions'] = [{ data: [], error: null }];
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
    await builder.rebuildTimelinesForEntity(USER_ID, 'org-1');

    const payload = upsertCallsFor('entity_timeline_events')[0].args[0] as Record<string, unknown>;
    expect(payload).toMatchObject({
      entity_id: 'org-1',
      event_id: 'posted-1',
      timeline_type: 'shared_experience',
      user_was_present: true,
      audience: 'with_user',
      source: 'user_posted',
    });
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
