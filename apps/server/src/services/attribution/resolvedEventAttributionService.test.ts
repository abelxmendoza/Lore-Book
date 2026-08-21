import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  calls: [] as Array<{ table: string; op: string; args: unknown[] }>,
  eventRow: {
    id: 'evt-concert',
    title: 'Northwind Hall outing',
    summary: 'I went with Maya.',
    people: ['char-maya', 'char-priya'],
    locations: ['loc-catch-one'],
    metadata: {},
  } as Record<string, unknown>,
}));

function chain(table: string) {
  const self: Record<string, unknown> = {
    select: (...args: unknown[]) => {
      h.calls.push({ table, op: 'select', args });
      return self;
    },
    eq: (...args: unknown[]) => {
      h.calls.push({ table, op: 'eq', args });
      return self;
    },
    update: (...args: unknown[]) => {
      h.calls.push({ table, op: 'update', args });
      return self;
    },
    maybeSingle: () => {
      h.calls.push({ table, op: 'maybeSingle', args: [] });
      return Promise.resolve({ data: { ...h.eventRow }, error: null });
    },
    then: (
      onfulfilled?: (value: { data: unknown; error: null }) => unknown,
      onrejected?: (reason: unknown) => unknown,
    ) => Promise.resolve({ data: null, error: null }).then(onfulfilled, onrejected),
  };
  return self;
}

vi.mock('../../logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('../supabaseClient', () => ({
  supabaseAdmin: { from: (table: string) => chain(table) },
}));

import { correctResolvedEventAttribution } from './resolvedEventAttributionService';

describe('correctResolvedEventAttribution — tenant isolation', () => {
  beforeEach(() => {
    h.calls = [];
  });

  it('scopes the select and update to the caller user_id + event id, and does not create a second event', async () => {
    const result = await correctResolvedEventAttribution('user-a', 'evt-concert', {
      action: 'retract',
      entityId: 'char-priya',
    });

    expect(result?.eventId).toBe('evt-concert');
    expect(result?.duplicateCreated).toBe(false);
    expect(result?.people).toEqual(['char-maya']);

    const eqCalls = h.calls.filter((call) => call.op === 'eq');
    expect(eqCalls).toEqual(
      expect.arrayContaining([
        { table: 'resolved_events', op: 'eq', args: ['user_id', 'user-a'] },
        { table: 'resolved_events', op: 'eq', args: ['id', 'evt-concert'] },
      ]),
    );
    expect(eqCalls.filter((call) => call.args[0] === 'user_id').map((call) => call.args[1])).toEqual([
      'user-a',
      'user-a',
    ]);
    expect(h.calls.some((call) => call.op === 'update')).toBe(true);
    expect(h.calls.some((call) => call.op === 'insert')).toBe(false);
  });

  it('does not attach user-b filters when correcting as user-a', async () => {
    await correctResolvedEventAttribution('user-a', 'evt-concert', {
      action: 'retract',
      entityId: 'char-priya',
    });
    const userIds = h.calls.filter((call) => call.op === 'eq' && call.args[0] === 'user_id').map((call) => call.args[1]);
    expect(userIds).not.toContain('user-b');
    expect(userIds.every((id) => id === 'user-a')).toBe(true);
  });
});
