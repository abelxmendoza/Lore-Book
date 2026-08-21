import { beforeEach, describe, expect, it, vi } from 'vitest';

type TableResult = { data: unknown; error: unknown };
let tableResults: Record<string, TableResult> = {};

function makeChain(result: TableResult) {
  const chain: Record<string, unknown> = {};
  for (const key of ['select', 'eq', 'in', 'overlaps', 'order', 'limit', 'contains']) {
    chain[key] = () => chain;
  }
  chain.then = (resolve: (v: TableResult) => void) => resolve(result);
  return chain;
}

vi.mock('./supabaseClient', () => ({
  supabaseAdmin: {
    from: vi.fn((table: string) => makeChain(tableResults[table] ?? { data: [], error: null })),
  },
}));

const getStitchedTimelineForOrganization = vi.fn();
vi.mock('./chronologyV2/stitchedTimelineService', () => ({
  stitchedTimelineService: {
    getStitchedTimelineForOrganization: (...args: unknown[]) => getStitchedTimelineForOrganization(...args),
  },
}));

vi.mock('./groupAnalyticsService', () => ({
  groupAnalyticsService: {},
}));

import { organizationService } from './organizationService';

const USER = 'user-1';
const ORG = 'org-acme';
const MAYA = 'char-maya';

describe('organization derived events', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tableResults = {
      organization_members: {
        data: [{ character_id: MAYA, character_name: 'Maya', organization_id: ORG }],
        error: null,
      },
      organizations: { data: [{ id: ORG, name: 'Acme' }], error: null },
      organization_relationships: { data: [], error: null },
      locations: { data: [], error: null },
      resolved_events: { data: [], error: null },
      character_timeline_events: {
        data: [{
          event_id: 'evt-concert',
          character_id: MAYA,
          event_title: 'Concert with Maya',
          event_date: '2026-07-12',
          event_summary: 'Maya attended a concert',
          event_type: 'social',
          user_was_present: true,
        }],
        error: null,
      },
    };
    vi.spyOn(organizationService, 'getGroupHierarchy').mockResolvedValue({
      subgroups: [],
      related: [],
    });
    vi.spyOn(organizationService, 'getMembers').mockResolvedValue([
      { character_id: MAYA, character_name: 'Maya' } as never,
    ]);
    getStitchedTimelineForOrganization.mockResolvedValue({
      items: [],
      unresolved_items: [],
    });
  });

  it('does not manufacture an org event from member overlap + a personal concert', async () => {
    const context = await organizationService.getDerivedContext(USER, ORG);
    expect(context.events).toEqual([]);
  });

  it('keeps canonical organization attribution dated from occurredStart', async () => {
    getStitchedTimelineForOrganization.mockResolvedValue({
      items: [{
        id: 'event:evt-standup',
        sourceId: 'evt-standup',
        title: 'Acme standup',
        body: 'Weekly standup',
        occurredAt: '2026-07-12T19:30:00.000Z',
        occurrenceStatus: 'point',
        userPresence: 'attended',
        canonicalEventType: 'meeting',
        sourceType: 'resolved_event',
        temporalProjection: { isUnresolved: false, occurredStart: '2026-07-12T19:30:00.000Z' },
      }],
      unresolved_items: [],
    });
    tableResults.resolved_events = {
      data: [{ id: 'evt-standup', people: [MAYA] }],
      error: null,
    };

    const context = await organizationService.getDerivedContext(USER, ORG);
    expect(context.events).toHaveLength(1);
    expect(context.events[0].title).toBe('Acme standup');
    expect(context.events[0].date).toBe('2026-07-12T19:30:00.000Z');
    expect(context.events[0].involved).toEqual(['Maya']);
  });
});
