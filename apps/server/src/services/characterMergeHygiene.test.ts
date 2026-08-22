import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { StitchedTimelineItem } from './chronologyV2/stitchedTimelineService';

const { events, tables, makeChain } = vi.hoisted(() => {
  type EventRow = { id: string; people: string[]; user_id: string };
  const events: EventRow[] = [];
  const tables: string[] = [];

  function makeChain(table: string) {
    tables.push(table);
    const filters: Record<string, unknown> = {};
    let payload: Record<string, unknown> | undefined;
    const chain: Record<string, unknown> = {};
    chain.select = () => chain;
    chain.update = (next: Record<string, unknown>) => {
      payload = next;
      return chain;
    };
    chain.delete = () => chain;
    chain.eq = (column: string, value: unknown) => {
      filters[column] = value;
      return chain;
    };
    chain.contains = (_column: string, value: unknown) => {
      filters.contains = value;
      return chain;
    };
    chain.then = (resolve: (value: unknown) => void, reject?: (reason: unknown) => void) => {
      try {
        if (table === 'character_timeline_events') {
          reject(new Error('character_timeline_events must not be queried after DROP'));
          return;
        }
        if (table === 'resolved_events' && payload?.people && typeof filters.id === 'string') {
          const next = events.map((row) =>
            row.id === filters.id && row.user_id === filters.user_id
              ? { ...row, people: payload!.people as string[] }
              : row,
          );
          events.splice(0, events.length, ...next);
          resolve({ data: null, error: null });
          return;
        }
        if (table === 'resolved_events') {
          const sourceId = Array.isArray(filters.contains) ? filters.contains[0] : null;
          const data = events.filter(
            (row) => row.user_id === filters.user_id && sourceId && row.people.includes(sourceId as string),
          );
          resolve({ data, error: null });
          return;
        }
        resolve({ data: [], error: null });
      } catch (err) {
        reject?.(err);
      }
    };
    return chain;
  }

  return { events, tables, makeChain };
});

vi.mock('./supabaseClient', () => ({
  supabaseAdmin: {
    from: (table: string) => makeChain(table),
  },
}));

vi.mock('../logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { rewriteResolvedEventPeopleCharacterIds } from './characters/resolvedEventPeopleRewrite';
import { projectCharacterTimelineFromSources } from './characters/characterEntityTimelineService';

const USER = 'user-maya-1';
const OTHER = 'user-tenant-2';
const MAYA_TEMP = 'char-maya-temp';
const MAYA_CHEN = 'char-maya-chen';
const EVT_1 = 'evt_1';
const EVT_NEW = 'evt_new';
const LA = 'America/Los_Angeles';
const NOW = new Date('2026-08-21T17:00:00Z');

function stitchedEvent(id: string, occurredAt: string): StitchedTimelineItem {
  return {
    id: `event:${id}`,
    kind: 'event',
    sourceId: id,
    sourceIds: [id],
    sourceKind: 'resolved_event',
    sourceType: 'resolved_event',
    sortTime: occurredAt,
    userSortIndex: null,
    title: 'Maya started at MemoVault',
    body: '',
    timePrecision: 'date',
    occurrenceStatus: 'confirmed',
    userPresence: 'attended',
    occurredAt,
    temporal: {
      occurred: {
        start: occurredAt,
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
  };
}

describe('character merge after character_timeline_events drop', () => {
  beforeEach(() => {
    tables.length = 0;
    events.splice(0, events.length,
      { id: EVT_1, people: [MAYA_TEMP], user_id: USER },
      { id: 'evt-other-tenant', people: [MAYA_TEMP], user_id: OTHER },
    );
  });

  it('rewrites resolved_events.people[] onto the surviving Character without CTE', async () => {
    const updated = await rewriteResolvedEventPeopleCharacterIds(USER, MAYA_TEMP, MAYA_CHEN);
    expect(updated).toBe(1);
    expect(events.find((row) => row.id === EVT_1)?.people).toEqual([MAYA_CHEN]);
    expect(events.find((row) => row.user_id === OTHER)?.people).toEqual([MAYA_TEMP]);
    expect(tables).not.toContain('character_timeline_events');
  });

  it('Character Timeline follows the survivor from canonical people[]', () => {
    const item = stitchedEvent(EVT_1, '2026-03-12T19:00:00.000Z');
    const modal = projectCharacterTimelineFromSources({
      entityId: MAYA_CHEN,
      timezone: LA,
      now: NOW,
      stitchedItems: [item],
    });
    const shown = [...modal.sharedExperiences, ...modal.lore][0];
    expect(shown?.entityId).toBe(MAYA_CHEN);
    expect(shown?.eventId).toBe(EVT_1);
    expect(shown?.occurredStart).toBe('2026-03-12T19:00:00.000Z');
    expect(modal.summary.firstKnownOccurrenceAt).not.toBe('1999-01-01T00:00:00.000Z');
  });

  it('event merge uses canonical evt_new', () => {
    const item = stitchedEvent(EVT_NEW, '2026-04-02T18:00:00.000Z');
    const modal = projectCharacterTimelineFromSources({
      entityId: MAYA_CHEN,
      timezone: LA,
      now: NOW,
      stitchedItems: [item],
    });
    expect([...modal.sharedExperiences, ...modal.lore].map((row) => row.eventId)).toEqual([EVT_NEW]);
  });
});
