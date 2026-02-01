import { describe, it, expect, vi, beforeEach } from 'vitest';
import { memoryExtractionWorker } from '../../src/jobs/memoryExtractionWorker';

vi.mock('../../src/services/supabaseClient', () => ({
  supabaseAdmin: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      not: vi.fn().mockReturnThis(),
      or: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({
        data: [],
        error: null,
      }),
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ error: null }),
    })),
  },
}));
vi.mock('../../src/services/conversationService');
vi.mock('../../src/services/memoryExtractionService');

describe('Memory Extraction Worker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('processBatch returns stats when Supabase returns network error', async () => {
    const { supabaseAdmin } = await import('../../src/services/supabaseClient');
    vi.mocked(supabaseAdmin.from).mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      not: vi.fn().mockReturnThis(),
      or: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({
        data: null,
        error: {
          message: 'TypeError: fetch failed',
          details: 'getaddrinfo ENOTFOUND jawzxiiwfagliloxnnkc.supabase.co',
        },
      }),
    } as any);

    const result = await memoryExtractionWorker.processBatch();

    expect(result).toEqual({ processed: 0, errors: 0, skipped: 0 });
  });

  it('processBatch returns stats when no sessions', async () => {
    const result = await memoryExtractionWorker.processBatch();

    expect(result).toEqual({ processed: 0, errors: 0, skipped: 0 });
  });
});
