import { describe, it, expect, vi, beforeEach } from 'vitest';

const updateCalls: Array<{ payload: Record<string, unknown>; ltArg?: unknown }> = [];

vi.mock('../supabaseClient', () => ({
  supabaseAdmin: {
    from: vi.fn((table: string) => {
      if (table !== 'conversation_sessions') throw new Error(`unexpected table ${table}`);
      const chain: Record<string, unknown> = {};
      chain.update = vi.fn((payload: Record<string, unknown>) => {
        const call = { payload, ltArg: undefined as unknown };
        updateCalls.push(call);
        return {
          eq: () => ({
            eq: () => ({
              lt: (_col: string, value: unknown) => {
                call.ltArg = value;
                return Promise.resolve({ error: null });
              },
            }),
          }),
        };
      });
      return chain;
    }),
  },
}));

import { bumpThreadActivity } from './threadActivity';

describe('bumpThreadActivity', () => {
  beforeEach(() => {
    updateCalls.length = 0;
  });

  it('writes the given timestamp and guards the update with a .lt(updated_at, at) filter', async () => {
    await bumpThreadActivity('user-1', 'session-1', '2026-08-16T12:00:00.000Z');

    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].payload).toEqual({ updated_at: '2026-08-16T12:00:00.000Z' });
    expect(updateCalls[0].ltArg).toBe('2026-08-16T12:00:00.000Z');
  });

  it('defaults to the current time when no timestamp is given', async () => {
    const before = Date.now();
    await bumpThreadActivity('user-1', 'session-1');
    const after = Date.now();

    const written = updateCalls[0].payload.updated_at as string;
    const writtenMs = Date.parse(written);
    expect(writtenMs).toBeGreaterThanOrEqual(before);
    expect(writtenMs).toBeLessThanOrEqual(after);
  });
});
