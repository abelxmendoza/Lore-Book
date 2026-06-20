import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../logger', () => ({
  logger: { warn: vi.fn(), info: vi.fn() },
}));

const mockFrom = vi.fn();

vi.mock('../supabaseClient', () => ({
  supabaseAdmin: { from: (...args: unknown[]) => mockFrom(...args) },
}));

import { chainableQuery } from '../../../tests/fixtures/cognitionSupabaseMock';
import { combineSalienceComponents, recomputeSalienceForUser, getTopSalient } from './salienceService';

describe('salienceService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('combineSalienceComponents clamps to [0.05, 0.99]', () => {
    const low = combineSalienceComponents({
      frequency: 0,
      recency: 0,
      emotional: 0,
      relationship: 0,
      userCorrection: 0,
      explicitEmphasis: 0,
    });
    const high = combineSalienceComponents({
      frequency: 1,
      recency: 1,
      emotional: 1,
      relationship: 1,
      userCorrection: 1,
      explicitEmphasis: 1,
    });
    expect(low).toBe(0.05);
    expect(high).toBe(0.99);
  });

  it('recomputeSalienceForUser handles invalid event dates without throwing', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'resolved_events') {
        return chainableQuery({
          data: [
            {
              id: 'evt-bad-date',
              start_time: 'not-a-date',
              confidence: 0.8,
              metadata: {},
              people: [],
            },
          ],
          error: null,
        });
      }
      if (table === 'narrative_claims') {
        return chainableQuery({ data: [], error: null });
      }
      if (table === 'salience_scores') {
        return chainableQuery({ data: null, error: null });
      }
      return chainableQuery({ data: null, error: null });
    });

    const written = await recomputeSalienceForUser('user-1');
    expect(written).toBe(1);
  });

  it('recomputeSalienceForUser continues when events query fails', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'resolved_events') {
        return chainableQuery({ data: null, error: { message: 'timeout' } });
      }
      if (table === 'narrative_claims') {
        return chainableQuery({ data: [], error: null });
      }
      return chainableQuery({ data: null, error: null });
    });

    const written = await recomputeSalienceForUser('user-1');
    expect(written).toBe(0);
  });

  it('getTopSalient returns empty array on query error', async () => {
    mockFrom.mockReturnValue(chainableQuery({ data: null, error: { message: 'fail' } }));
    const items = await getTopSalient('user-1');
    expect(items).toEqual([]);
  });

  it('getTopSalient returns ranked items', async () => {
    mockFrom.mockReturnValue(
      chainableQuery({
        data: [
          { target_kind: 'resolved_event', target_id: 'e1', score: 0.9, components: {} },
          { target_kind: 'narrative_claim', target_id: 'c1', score: 0.7, components: {} },
        ],
        error: null,
      }),
    );
    const items = await getTopSalient('user-1', 5);
    expect(items).toHaveLength(2);
    expect(items[0].score).toBe(0.9);
  });
});
