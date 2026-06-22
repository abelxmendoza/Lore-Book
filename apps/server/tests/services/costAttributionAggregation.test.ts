import { describe, it, expect, vi, beforeEach } from 'vitest';

const fromMock = vi.fn();
const rpcMock = vi.fn();
vi.mock('../../src/services/supabaseClient', () => ({
  supabaseAdmin: {
    from: (...a: unknown[]) => fromMock(...a),
    rpc: (...a: unknown[]) => rpcMock(...a),
  },
}));

import { getCostSummary, costAttributionService } from '../../src/services/costAttributionService';

/** Chainable supabase read stub: from().select().gte() resolves to `result`. */
function readChain(result: { data?: unknown; error?: unknown }) {
  const c: Record<string, unknown> = {};
  for (const m of ['select', 'gte', 'in', 'order']) c[m] = () => c;
  c.limit = () => Promise.resolve(result);
  c.then = (res: (v: unknown) => unknown) => Promise.resolve(result).then(res);
  return c;
}

describe('getCostSummary (aggregation)', () => {
  beforeEach(() => {
    fromMock.mockReset();
    rpcMock.mockReset();
  });

  it('aggregates by operation, model, and day with totals and percentages', async () => {
    fromMock.mockReturnValue(
      readChain({
        data: [
          { day: '2026-06-21', operation: 'chat', model: 'gpt-4o-mini', calls: 3, estimated_usd: 0.6 },
          { day: '2026-06-22', operation: 'chat', model: 'gpt-4o-mini', calls: 1, estimated_usd: 0.2 },
          { day: '2026-06-22', operation: 'ingestion', model: 'gpt-4o', calls: 2, estimated_usd: 0.2 },
        ],
        error: null,
      }),
    );

    const s = await getCostSummary(30);

    expect(s.totalUsd).toBeCloseTo(1.0, 6);
    expect(s.totalCalls).toBe(6);

    // byOperation sorted by usd desc, with pctOfTotal.
    expect(s.byOperation[0]).toMatchObject({ operation: 'chat', calls: 4 });
    expect(s.byOperation[0].usd).toBeCloseTo(0.8, 6);
    expect(s.byOperation[0].pctOfTotal).toBeCloseTo(80, 1);
    expect(s.byOperation[1]).toMatchObject({ operation: 'ingestion', calls: 2 });

    // byModel aggregated.
    expect(s.byModel.find((m) => m.model === 'gpt-4o-mini')?.calls).toBe(4);

    // byDay sorted ascending.
    expect(s.byDay.map((d) => d.day)).toEqual(['2026-06-21', '2026-06-22']);
    expect(s.byDay[1].usd).toBeCloseTo(0.4, 6);
  });

  it('returns zeros (not a crash) when the table read errors', async () => {
    fromMock.mockReturnValue(readChain({ data: null, error: { message: 'no table' } }));
    const s = await getCostSummary(7);
    expect(s.totalUsd).toBe(0);
    expect(s.totalCalls).toBe(0);
    expect(s.byOperation).toEqual([]);
    expect(s.rangeDays).toBe(7);
  });
});

describe('costAttributionService.flush', () => {
  beforeEach(() => {
    fromMock.mockReset();
    rpcMock.mockReset();
    // drain any residual buffer from other tests
    void costAttributionService.flush();
  });

  it('flushes buffered deltas to the increment RPC', async () => {
    rpcMock.mockResolvedValue({ error: null });
    costAttributionService.record({
      operation: 'chat',
      model: 'gpt-4o-mini',
      inputTokens: 100,
      outputTokens: 50,
      usd: 0.0003,
    });
    await costAttributionService.flush();

    expect(rpcMock).toHaveBeenCalledWith(
      'record_openai_cost_daily',
      expect.objectContaining({ p_operation: 'chat', p_model: 'gpt-4o-mini', p_calls: 1 }),
    );
    // buffer drained
    expect(costAttributionService.__peek().size).toBe(0);
  });

  it('re-buffers a bucket when the RPC fails (no silent spend loss)', async () => {
    rpcMock.mockResolvedValue({ error: { message: 'rpc down' } });
    costAttributionService.record({
      operation: 'ingestion',
      model: 'gpt-4o',
      inputTokens: 10,
      outputTokens: 0,
      usd: 0.0001,
    });
    await costAttributionService.flush();
    // failed flush re-buffers so it retries next time
    expect(costAttributionService.__peek().size).toBeGreaterThan(0);
  });
});
