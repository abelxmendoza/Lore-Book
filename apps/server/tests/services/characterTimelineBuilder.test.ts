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

vi.mock('../../src/services/conversationCentered/eventImpactDetector', () => ({
  eventImpactDetector: {
    getEventImpacts: vi.fn().mockResolvedValue([]),
  },
}));

import { characterTimelineBuilder } from '../../src/services/conversationCentered/characterTimelineBuilder';

const USER_ID = 'user-1';

function upsertCallsFor(table: string) {
  return state.calls.filter((c) => c.table === table && c.method === 'upsert');
}

beforeEach(() => {
  vi.clearAllMocks();
  state = { responses: {}, calls: [] };
});

describe('CharacterTimelineBuilder.processEpisodeForCharacter', () => {
  it('upserts a lore entry with source_episode_id set and event_id null', async () => {
    await characterTimelineBuilder.processEpisodeForCharacter(USER_ID, 'char-1', {
      id: 'episode-1',
      title: 'Coffee with Vicky',
      start_at: '2026-06-01T09:00:00Z',
      source_message_ids: ['m1', 'm2'],
    });

    const upserts = upsertCallsFor('character_timeline_events');
    expect(upserts).toHaveLength(1);
    const payload = upserts[0].args[0] as Record<string, unknown>;
    expect(payload).toMatchObject({
      user_id: USER_ID,
      character_id: 'char-1',
      event_id: null,
      source_episode_id: 'episode-1',
      timeline_type: 'lore',
      character_role: 'mentioned',
      user_was_present: true,
      event_title: 'Coffee with Vicky',
      event_date: '2026-06-01T09:00:00Z',
    });
  });
});

describe('CharacterTimelineBuilder.rebuildTimelinesForCharacter — episode folding', () => {
  it('folds episodes where this character is the primary entity', async () => {
    state.responses['characters'] = [{ data: { name: 'Vicky' }, error: null }];
    state.responses['resolved_events'] = [{ data: [], error: null }];
    state.responses['episodes'] = [
      {
        data: [
          { id: 'episode-1', title: 'Start · Vicky', start_at: '2026-06-01T09:00:00Z', source_message_ids: ['m1'] },
        ],
        error: null,
      },
    ];

    await characterTimelineBuilder.rebuildTimelinesForCharacter(USER_ID, 'char-1');

    const episodesCall = state.calls.find(
      (c) => c.table === 'episodes' && c.method === 'eq' && c.args[0] === 'primary_entity_type'
    );
    expect(episodesCall).toBeTruthy();
    expect(episodesCall!.args).toEqual(['primary_entity_type', 'character']);

    const upserts = upsertCallsFor('character_timeline_events');
    expect(upserts).toHaveLength(1);
    const payload = upserts[0].args[0] as Record<string, unknown>;
    expect(payload).toMatchObject({ character_id: 'char-1', source_episode_id: 'episode-1' });
  });

  it('still folds resolved_events even when there are no matching episodes', async () => {
    state.responses['characters'] = [{ data: { name: 'Vicky' }, error: null }];
    state.responses['resolved_events'] = [
      {
        data: [
          {
            id: 'ev-1',
            title: 'Birthday party',
            summary: 'Turned 30',
            type: 'party',
            start_time: '2026-05-01T00:00:00Z',
            people: ['char-1'],
          },
        ],
        error: null,
      },
    ];
    state.responses['episodes'] = [{ data: [], error: null }];

    await characterTimelineBuilder.rebuildTimelinesForCharacter(USER_ID, 'char-1');

    const upserts = upsertCallsFor('character_timeline_events');
    expect(upserts).toHaveLength(1);
    const payload = upserts[0].args[0] as Record<string, unknown>;
    expect(payload).toMatchObject({ character_id: 'char-1', event_id: 'ev-1' });
  });

  it('does nothing when the character does not exist', async () => {
    state.responses['characters'] = [{ data: null, error: null }];

    await characterTimelineBuilder.rebuildTimelinesForCharacter(USER_ID, 'char-missing');

    expect(state.calls.some((c) => c.table === 'resolved_events' || c.table === 'episodes')).toBe(false);
  });
});
