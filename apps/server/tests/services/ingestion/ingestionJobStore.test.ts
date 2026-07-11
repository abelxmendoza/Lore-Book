import { describe, it, expect, vi, beforeEach } from 'vitest';

const fromMock = vi.fn();
vi.mock('../../../src/services/supabaseClient', () => ({
  supabaseAdmin: { from: (...args: unknown[]) => fromMock(...args) },
}));

import { ingestionJobStore } from '../../../src/services/ingestion/ingestionJobStore';

/** Chainable supabase stub whose terminal awaits to `result`. */
function chain(result: { data?: unknown; error?: unknown }) {
  const c: Record<string, unknown> = {};
  for (const m of ['upsert', 'update', 'delete', 'select', 'eq', 'in', 'order']) {
    c[m] = () => c;
  }
  c.limit = () => Promise.resolve(result);
  c.then = (res: (v: unknown) => unknown) => Promise.resolve(result).then(res);
  return c;
}

const base = {
  id: 'job-1',
  idempotencyKey: 'msg-1',
  userId: 'u1',
  chatMessageId: 'msg-1',
  sessionId: 's1',
  priority: 'NORMAL',
  payload: { force: false },
};

describe('ingestionJobStore', () => {
  beforeEach(() => fromMock.mockReset());

  it('persist returns true for a newly inserted job', async () => {
    fromMock.mockReturnValue(chain({ data: [{ id: 'job-1' }], error: null }));
    expect(await ingestionJobStore.persist(base)).toBe(true);
  });

  it('persist returns false when the idempotency key already exists', async () => {
    // ignoreDuplicates => empty data array on conflict.
    fromMock.mockReturnValue(chain({ data: [], error: null }));
    expect(await ingestionJobStore.persist(base)).toBe(false);
  });

  it('persist degrades to true (in-memory) on DB error so enqueue is never blocked', async () => {
    fromMock.mockReturnValue(chain({ data: null, error: { message: 'down' } }));
    expect(await ingestionJobStore.persist(base)).toBe(true);
  });

  it('loadResumable maps unfinished rows', async () => {
    fromMock.mockReturnValue(
      chain({
        data: [
          {
            id: 'job-9',
            idempotency_key: 'msg-9',
            user_id: 'u1',
            chat_message_id: 'msg-9',
            session_id: 's1',
            priority: 'HIGH',
            payload: { force: true },
            attempts: 2,
          },
        ],
        error: null,
      }),
    );
    const rows = await ingestionJobStore.loadResumable();
    expect(rows).toHaveLength(1);
    expect(rows[0].idempotency_key).toBe('msg-9');
    expect(rows[0].attempts).toBe(2);
  });

  it('markCompleted marks COMPLETED (keeps row for diagnostics; delete only on update failure)', async () => {
    const c = chain({ data: null, error: null });
    const updateSpy = vi.spyOn(c, 'update');
    fromMock.mockReturnValue(c);
    await ingestionJobStore.markCompleted('job-1');
    expect(updateSpy).toHaveBeenCalled();
  });
});
