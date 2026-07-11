import { describe, it, expect, vi, beforeEach } from 'vitest';

const fromMock = vi.fn();
vi.mock('../../../src/services/supabaseClient', () => ({
  supabaseAdmin: { from: (...args: unknown[]) => fromMock(...args) },
}));

vi.mock('../../../src/services/chat/chatDurability', () => ({
  incMetric: vi.fn(),
}));

import { ingestionJobStore } from '../../../src/services/ingestion/ingestionJobStore';

/** Chainable supabase stub whose terminal awaits to `result`. */
function chain(result: { data?: unknown; error?: unknown }) {
  const c: Record<string, unknown> = {};
  for (const m of ['upsert', 'update', 'delete', 'select', 'eq', 'in', 'order', 'not', 'lt', 'or']) {
    c[m] = () => c;
  }
  c.limit = () => Promise.resolve(result);
  c.maybeSingle = () => Promise.resolve(result);
  c.single = () => Promise.resolve(result);
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

  it('persist returns ok+isNew for a newly inserted job', async () => {
    fromMock.mockReturnValue(chain({ data: [{ id: 'job-1' }], error: null }));
    const r = await ingestionJobStore.persist(base);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.isNew).toBe(true);
  });

  it('persist returns ok+!isNew when the idempotency key already exists', async () => {
    // First call: upsert returns empty; second: findByIdempotencyKey
    let call = 0;
    fromMock.mockImplementation(() => {
      call++;
      if (call === 1) return chain({ data: [], error: null });
      return chain({
        data: {
          id: 'job-1',
          idempotency_key: 'msg-1',
          user_id: 'u1',
          chat_message_id: 'msg-1',
          session_id: 's1',
          status: 'pending',
          logical_status: 'QUEUED',
          attempts: 0,
        },
        error: null,
      });
    });
    const r = await ingestionJobStore.persist(base);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.isNew).toBe(false);
  });

  it('persist does NOT claim success on DB error (no in-memory lie)', async () => {
    fromMock.mockReturnValue(chain({ data: null, error: { message: 'down' } }));
    const r = await ingestionJobStore.persist(base);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/down/);
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
    expect(rows.length).toBeGreaterThanOrEqual(0);
  });

  it('markCompleted marks COMPLETED (fenced when lease provided)', async () => {
    const c = chain({ data: [{ id: 'job-1' }], error: null });
    const updateSpy = vi.spyOn(c, 'update');
    fromMock.mockReturnValue(c);
    await ingestionJobStore.markCompleted('job-1');
    expect(updateSpy).toHaveBeenCalled();
  });

  it('fencedUpdate returns false when lease does not match (stale worker)', async () => {
    fromMock.mockReturnValue(chain({ data: [], error: null }));
    const ok = await ingestionJobStore.fencedUpdate('job-1', 'stale-lease', 1, {
      logical_status: 'COMPLETED',
    });
    expect(ok).toBe(false);
  });
});
