import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFrom = vi.fn();
const mockRpc = vi.fn();
vi.mock('../../src/services/supabaseClient', () => ({
  supabaseAdmin: {
    from: (...args: unknown[]) => mockFrom(...args),
    rpc: (...args: unknown[]) => mockRpc(...args),
  },
}));
vi.mock('../../src/logger', () => ({ logger: { debug: vi.fn(), error: vi.fn() } }));

import { SimilarityDetector } from '../../src/services/consolidation/similarityDetector';

describe('SimilarityDetector', () => {
  let detector: SimilarityDetector;

  beforeEach(() => {
    vi.clearAllMocks();
    detector = new SimilarityDetector();
  });

  it('returns SimilarityScore[] and uses k-NN for candidate pairs', async () => {
    const entries = [
      { id: 'e1', content: 'Hello world', date: '2025-01-01', embedding: [0.1, 0.2], tags: [], people: [] },
      { id: 'e2', content: 'Hello world', date: '2025-01-01', embedding: [0.1, 0.2], tags: [], people: [] },
      { id: 'e3', content: 'Different', date: '2025-01-02', embedding: [0.9, 0.8], tags: [], people: [] },
    ];
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: entries, error: null }),
      in: vi.fn().mockReturnThis(),
    });
    // match_journal_entries: for e1 return [e2]; for e2 return [e1]; for e3 return []
    mockRpc
      .mockResolvedValueOnce({ data: [{ id: 'e2' }] })
      .mockResolvedValueOnce({ data: [{ id: 'e1' }] })
      .mockResolvedValueOnce({ data: [] });

    const result = await detector.detectSimilarities('user-1');

    expect(Array.isArray(result)).toBe(true);
    // e1-e2 is an exact duplicate (same content); check is run on candidate pairs
    const exact = result.find(r => r.similarity_type === 'exact');
    expect(exact).toBeDefined();
    expect(exact!.entry1_id).toBeDefined();
    expect(exact!.entry2_id).toBeDefined();
    expect(exact!.score).toBe(1.0);
    expect(mockRpc).toHaveBeenCalledWith(
      'match_journal_entries',
      expect.objectContaining({ user_uuid: 'user-1', match_count: 6, match_threshold: 0.5 })
    );
  });

  it('returns empty when fewer than 2 entries', async () => {
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: [{ id: 'e1' }], error: null }),
    });

    const result = await detector.detectSimilarities('user-1');

    expect(result).toEqual([]);
    expect(mockRpc).not.toHaveBeenCalled();
  });
});
