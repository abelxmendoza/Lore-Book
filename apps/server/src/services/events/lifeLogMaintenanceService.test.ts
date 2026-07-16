import { beforeEach, describe, expect, it, vi } from 'vitest';

const { fromMock } = vi.hoisted(() => ({ fromMock: vi.fn() }));
vi.mock('../supabaseClient', () => ({ supabaseAdmin: { from: fromMock } }));
vi.mock('../../logger', () => ({ logger: { info: vi.fn(), warn: vi.fn() } }));

import { maintainLifeLogForUser } from './lifeLogMaintenanceService';

function query(result: unknown) {
  const chain: Record<string, any> = {};
  for (const method of ['select', 'eq', 'or', 'order', 'limit', 'update']) {
    chain[method] = vi.fn(() => chain);
  }
  chain.then = (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve);
  return chain;
}

describe('lifeLogMaintenanceService', () => {
  beforeEach(() => fromMock.mockReset());

  it('quarantines invalid derived rows and preserves their existing metadata', async () => {
    const read = query({
      data: [{
        id: 'bad-1', title: 'Captured Conversation', summary: 'hi im Abel Mendoza', type: null,
        metadata: { assembled_from_units: ['unit-1'] },
      }],
      error: null,
    });
    const write = query({ error: null });
    fromMock.mockReturnValueOnce(read).mockReturnValueOnce(write);

    const result = await maintainLifeLogForUser('user-1');

    expect(result).toEqual({ checked: 1, quarantined: 1, published: 0 });
    expect(write.update).toHaveBeenCalledWith(expect.objectContaining({
      metadata: expect.objectContaining({
        assembled_from_units: ['unit-1'],
        life_log: expect.objectContaining({
          publication_status: 'quarantined',
          eligibility_reason: 'rejected_failed_extraction',
          policy_version: 'v2',
        }),
      }),
    }));
  });

  it('coalesces simultaneous maintenance triggers for one user', async () => {
    const read = query({ data: [], error: null });
    fromMock.mockReturnValue(read);
    const first = maintainLifeLogForUser('user-2');
    const second = maintainLifeLogForUser('user-2');
    expect(first).toBe(second);
    await first;
    expect(fromMock).toHaveBeenCalledTimes(1);
  });
});
