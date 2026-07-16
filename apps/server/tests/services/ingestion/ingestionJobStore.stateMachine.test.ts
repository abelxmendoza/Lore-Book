import { describe, it, expect, vi, beforeEach } from 'vitest';

const fromMock = vi.fn();
vi.mock('../../../src/services/supabaseClient', () => ({
  supabaseAdmin: { from: (...args: unknown[]) => fromMock(...args) },
}));

vi.mock('../../../src/services/chat/chatDurability', () => ({
  incMetric: vi.fn(),
}));

import { ingestionJobStore } from '../../../src/services/ingestion/ingestionJobStore';

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

describe('ingestionJobStore state machine fields', () => {
  beforeEach(() => fromMock.mockReset());

  it('persist writes logical_status QUEUED and stage RAW_MESSAGE_PERSISTED', async () => {
    let upserted: Record<string, unknown> | null = null;
    const c = chain({ data: [{ id: 'job-1' }], error: null });
    c.upsert = (row: Record<string, unknown>) => {
      upserted = row;
      return c;
    };
    fromMock.mockReturnValue(c);

    const ok = await ingestionJobStore.persist({
      id: 'job-1',
      idempotencyKey: 'msg-1',
      userId: 'u1',
      chatMessageId: 'msg-1',
      sessionId: 's1',
      priority: 'NORMAL',
      payload: { schemaVersion: 1 },
    });
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.isNew).toBe(true);
    expect(upserted?.logical_status).toBe('QUEUED');
    expect(upserted?.current_stage).toBe('RAW_MESSAGE_PERSISTED');
    expect(upserted?.status).toBe('pending');
  });

  it('markRetrying sets RETRYABLE_FAILED + category', async () => {
    let patch: Record<string, unknown> | null = null;
    const c = chain({ data: null, error: null });
    c.update = (p: Record<string, unknown>) => {
      patch = p;
      return c;
    };
    fromMock.mockReturnValue(c);

    await ingestionJobStore.markRetrying('job-1', 2, '429 rate limit', {
      category: 'rate_limit',
      code: 'rate_limit',
      failedStage: 'ENTITIES_RESOLVED',
      nextRetryAt: new Date('2030-01-01T00:00:00Z'),
    });
    expect(patch?.logical_status).toBe('RETRYABLE_FAILED');
    expect(patch?.last_error_category).toBe('rate_limit');
    expect(patch?.retryable).toBe(true);
    expect(patch?.status).toBe('pending');
  });

  it('markDead sets PERMANENT_FAILED', async () => {
    let patch: Record<string, unknown> | null = null;
    const c = chain({ data: null, error: null });
    c.update = (p: Record<string, unknown>) => {
      patch = p;
      return c;
    };
    fromMock.mockReturnValue(c);

    await ingestionJobStore.markDead('job-1', 'validation failed', {
      category: 'validation',
      code: 'validation',
    });
    expect(patch?.logical_status).toBe('PERMANENT_FAILED');
    expect(patch?.retryable).toBe(false);
    expect(patch?.status).toBe('dead');
  });
});
