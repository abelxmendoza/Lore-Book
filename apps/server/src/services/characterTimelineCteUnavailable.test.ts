import { beforeEach, describe, expect, it, vi } from 'vitest';

const { tables, makeChain } = vi.hoisted(() => {
  const tables: string[] = [];
  function makeChain(table: string) {
    tables.push(table);
    const chain: Record<string, unknown> = {};
    chain.select = () => chain;
    chain.update = () => chain;
    chain.contains = () => chain;
    chain.eq = () => chain;
    chain.then = (resolve: (value: unknown) => void, reject?: (reason: unknown) => void) => {
      if (table === 'character_timeline_events') {
        reject?.(Object.assign(new Error('relation does not exist'), { code: '42P01' }));
        return;
      }
      if (table === 'resolved_events') {
        resolve({ data: [{ id: 'evt_1', people: ['char-maya-temp'] }], error: null });
        return;
      }
      resolve({ data: [], error: null });
    };
    return chain;
  }
  return { tables, makeChain };
});

vi.mock('./supabaseClient', () => ({
  supabaseAdmin: {
    from: (table: string) => makeChain(table),
  },
}));

vi.mock('../logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const getStitchedTimelineForEntity = vi.fn();
vi.mock('./chronologyV2/stitchedTimelineService', () => ({
  stitchedTimelineService: {
    getStitchedTimelineForEntity: (...args: unknown[]) => getStitchedTimelineForEntity(...args),
    getStitchedTimeline: vi.fn(),
  },
}));

vi.mock('./temporal/userTimezoneService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./temporal/userTimezoneService')>();
  return {
    ...actual,
    getUserTimezone: vi.fn().mockResolvedValue('America/Los_Angeles'),
  };
});

import { buildCanonicalCharacterTimeline } from './characters/characterEntityTimelineService';
import { rewriteResolvedEventPeopleCharacterIds } from './characters/resolvedEventPeopleRewrite';
import { characterTimelineBuilder } from './conversationCentered/characterTimelineBuilder';

describe('character_timeline_events after DROP', () => {
  beforeEach(() => {
    tables.length = 0;
    getStitchedTimelineForEntity.mockResolvedValue({
      scope_type: 'global',
      scope_id: '00000000-0000-0000-0000-000000000000',
      scope_label: null,
      items: [{
        id: 'event:evt_1',
        kind: 'event',
        sourceId: 'evt_1',
        sourceIds: ['evt_1'],
        sourceKind: 'resolved_event',
        sourceType: 'resolved_event',
        sortTime: '2026-03-12T19:00:00.000Z',
        userSortIndex: null,
        title: 'Maya started at MemoVault',
        body: '',
        timePrecision: 'date',
        occurrenceStatus: 'confirmed',
        userPresence: 'attended',
        occurredAt: '2026-03-12T19:00:00.000Z',
        temporal: {
          occurred: {
            start: '2026-03-12T19:00:00.000Z',
            end: null,
            timezone: null,
            precision: 'date',
            source: 'user_stated',
            status: 'anchored',
            confidence: 0.9,
            expression: null,
          },
          mentionedAt: null,
          recordedAt: null,
          knownFrom: null,
          validFrom: null,
          validUntil: null,
          provenance: [],
        },
      }],
      has_user_order: false,
      unresolved_items: [],
    });
  });

  it('Character Timeline works when the table is gone', async () => {
    const modal = await buildCanonicalCharacterTimeline('user-1', 'char-maya-chen');
    expect(modal.sharedExperiences[0]?.eventId).toBe('evt_1');
    expect(tables).not.toContain('character_timeline_events');
  });

  it('builder has no rebuild/write methods', () => {
    expect(characterTimelineBuilder).toHaveProperty('buildTimelines');
    expect(characterTimelineBuilder).not.toHaveProperty('rebuildTimelinesForCharacter');
    expect(characterTimelineBuilder).not.toHaveProperty('processEventForCharacters');
    expect(characterTimelineBuilder).not.toHaveProperty('processEpisodeForCharacter');
    expect(characterTimelineBuilder).not.toHaveProperty('addEventToTimeline');
  });

  it('Character merge people rewrite does not require the table', async () => {
    await rewriteResolvedEventPeopleCharacterIds('user-1', 'char-maya-temp', 'char-maya-chen');
    expect(tables).not.toContain('character_timeline_events');
  });
});
