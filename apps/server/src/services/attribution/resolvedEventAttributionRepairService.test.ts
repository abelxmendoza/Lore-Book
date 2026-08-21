import { beforeEach, describe, expect, it, vi } from 'vitest';

type Op = { table: string; op: string; args: unknown[] };

const h = vi.hoisted(() => ({
  calls: [] as Op[],
  updates: [] as Array<{ payload: Record<string, unknown>; filters: Array<[string, unknown]> }>,
  characters: [
    { id: 'char-maya', name: 'Maya', alias: [] },
    { id: 'char-priya', name: 'Priya', alias: [] },
  ],
  locations: [{ id: 'loc-catch-one', name: 'Catch One', aliases: [] }],
  events: [
    {
      id: 'evt-concert',
      title: 'Night at Catch One',
      summary: 'I was at Catch One with Maya. I thought about Priya afterward and told her about Disneyland.',
      people: ['char-maya', 'char-priya'],
      locations: ['loc-catch-one', 'loc-disneyland'],
      metadata: {},
    },
  ],
  extraLocations: [{ id: 'loc-disneyland', name: 'Disneyland', aliases: [] }],
}));

function chain(table: string) {
  const filters: Array<[string, unknown]> = [];
  let updatePayload: Record<string, unknown> | null = null;
  const self: Record<string, unknown> = {
    select: (...args: unknown[]) => {
      h.calls.push({ table, op: 'select', args });
      return self;
    },
    eq: (...args: unknown[]) => {
      h.calls.push({ table, op: 'eq', args });
      filters.push([String(args[0]), args[1]]);
      return self;
    },
    in: (...args: unknown[]) => {
      h.calls.push({ table, op: 'in', args });
      return self;
    },
    order: (...args: unknown[]) => {
      h.calls.push({ table, op: 'order', args });
      return self;
    },
    limit: (...args: unknown[]) => {
      h.calls.push({ table, op: 'limit', args });
      return self;
    },
    update: (...args: unknown[]) => {
      h.calls.push({ table, op: 'update', args });
      updatePayload = (args[0] as Record<string, unknown>) ?? {};
      return self;
    },
    then: (
      onfulfilled?: (value: { data: unknown; error: null }) => unknown,
      onrejected?: (reason: unknown) => unknown,
    ) => {
      if (updatePayload) {
        h.updates.push({ payload: updatePayload, filters: [...filters] });
        return Promise.resolve({ data: null, error: null }).then(onfulfilled, onrejected);
      }
      if (table === 'characters') {
        return Promise.resolve({ data: h.characters, error: null }).then(onfulfilled, onrejected);
      }
      if (table === 'locations') {
        return Promise.resolve({
          data: [...h.locations, ...h.extraLocations],
          error: null,
        }).then(onfulfilled, onrejected);
      }
      if (table === 'resolved_events') {
        return Promise.resolve({ data: h.events, error: null }).then(onfulfilled, onrejected);
      }
      if (table === 'event_unit_links' || table === 'extracted_units') {
        return Promise.resolve({ data: [], error: null }).then(onfulfilled, onrejected);
      }
      return Promise.resolve({ data: [], error: null }).then(onfulfilled, onrejected);
    },
  };
  return self;
}

vi.mock('../../logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('../supabaseClient', () => ({
  supabaseAdmin: { from: (table: string) => chain(table) },
}));

import { repairResolvedEventAttributionForUser } from './resolvedEventAttributionRepairService';

describe('repairResolvedEventAttributionForUser', () => {
  beforeEach(() => {
    h.calls = [];
    h.updates = [];
  });

  it('dry-run reports contamination without writing', async () => {
    const report = await repairResolvedEventAttributionForUser('user-a');
    expect(report.dryRun).toBe(true);
    expect(report.userId).toBe('user-a');
    expect(report.eventsScanned).toBe(1);
    expect(report.eventsChanged).toBe(1);
    expect(report.peopleRemoved).toBe(1);
    expect(report.locationsRemoved).toBe(1);
    expect(h.calls.some((call) => call.op === 'update')).toBe(false);
    expect(h.updates).toHaveLength(0);
  });

  it('apply updates the same event id scoped by user_id and does not insert a new event', async () => {
    const report = await repairResolvedEventAttributionForUser('user-a', { dryRun: false });
    expect(report.dryRun).toBe(false);
    expect(report.eventsChanged).toBe(1);
    expect(h.updates).toHaveLength(1);

    const update = h.updates[0]!;
    expect(update.payload.people).toEqual(['char-maya']);
    expect(update.payload.locations).toEqual(['loc-catch-one']);
    expect(update.filters).toEqual(
      expect.arrayContaining([
        ['user_id', 'user-a'],
        ['id', 'evt-concert'],
      ]),
    );
    expect(h.calls.some((call) => call.op === 'insert')).toBe(false);
    expect((update.payload.metadata as { entityAttributions?: unknown[] }).entityAttributions).toBeTruthy();
  });

  it('scopes character, location, and event reads to the requesting tenant', async () => {
    await repairResolvedEventAttributionForUser('user-a');
    await repairResolvedEventAttributionForUser('user-b');

    const userFilters = h.calls.filter((call) => call.op === 'eq' && call.args[0] === 'user_id');
    const tables = [...new Set(userFilters.map((call) => call.table))];
    expect(tables).toEqual(expect.arrayContaining(['characters', 'locations', 'resolved_events']));
    expect(userFilters.some((call) => call.table === 'characters' && call.args[1] === 'user-a')).toBe(true);
    expect(userFilters.some((call) => call.table === 'resolved_events' && call.args[1] === 'user-a')).toBe(true);
    expect(userFilters.some((call) => call.table === 'characters' && call.args[1] === 'user-b')).toBe(true);
    expect(userFilters.every((call) => call.args[1] === 'user-a' || call.args[1] === 'user-b')).toBe(true);
  });
});
