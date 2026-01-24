import { describe, it, expect, vi, beforeEach } from 'vitest';
import { saveEngineResults, getEngineResults, saveEngineResult } from './storage';
import { supabaseAdmin } from '../services/supabaseClient';

vi.mock('../services/supabaseClient', () => ({
  supabaseAdmin: {
    from: vi.fn(),
  },
}));

describe('Engine Storage', () => {
  let mockFrom: any;
  let mockUpsert: any;
  let mockSelect: any;
  let mockEq: any;
  let mockSingle: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockSingle = vi.fn().mockResolvedValue({
      data: null,
      error: null,
    });
    mockEq = vi.fn().mockReturnValue({ single: mockSingle });
    mockSelect = vi.fn().mockReturnValue({ eq: mockEq });
    mockUpsert = vi.fn().mockResolvedValue({ data: null, error: null });
    mockFrom = vi.fn().mockReturnValue({
      upsert: mockUpsert,
      select: mockSelect,
    });

    (supabaseAdmin.from as any) = mockFrom;
  });

  describe('saveEngineResults', () => {
    it('should save all engine results', async () => {
      const results = {
        health: { success: true, data: { status: 'healthy' }, duration: 100 },
        financial: { success: true, data: { balance: 1000 }, duration: 200 },
      };

      await saveEngineResults('user-123', results);

      expect(mockUpsert).toHaveBeenCalled();
      const upsertData = mockUpsert.mock.calls[0][0];
      expect(upsertData.user_id).toBe('user-123');
      expect(upsertData.results).toEqual(results);
      expect(upsertData.updated_at).toBeDefined();
    });

    it('should include updated_at timestamp', async () => {
      const results = {
        health: { success: true, data: {}, duration: 100 },
      };

      await saveEngineResults('user-123', results);

      const upsertData = mockUpsert.mock.calls[0][0];
      expect(upsertData.updated_at).toBeDefined();
    });

    it('should handle errors gracefully', async () => {
      mockUpsert.mockRejectedValue(new Error('Database error'));

      await expect(saveEngineResults('user-123', {})).rejects.toThrow('Database error');
    });
  });

  describe('saveEngineResult', () => {
    it('should save a single engine result', async () => {
      const result = {
        success: true,
        data: { status: 'healthy' },
        duration: 100,
      };

      // Mock the fetch for existing results
      mockSingle.mockResolvedValue({
        data: null,
        error: { code: 'PGRST116' }, // Not found
      });

      await saveEngineResult('user-123', 'health', result);

      expect(mockUpsert).toHaveBeenCalled();
      const upsertData = mockUpsert.mock.calls[0][0];
      expect(upsertData.user_id).toBe('user-123');
      expect(upsertData.results).toEqual({ health: result });
      expect(upsertData.updated_at).toBeDefined();
    });
  });

  describe('getEngineResults', () => {
    it('should retrieve engine results', async () => {
      const mockResults = {
        user_id: 'user-123',
        engine_name: 'health',
        result_data: { success: true, data: {} },
        updated_at: new Date().toISOString(),
      };

      mockSingle.mockResolvedValue({
        data: mockResults,
        error: null,
      });

      const results = await getEngineResults('user-123');

      expect(results).toBeDefined();
      expect(mockSelect).toHaveBeenCalled();
      expect(mockEq).toHaveBeenCalledWith('user_id', 'user-123');
    });

    it('should return null for stale results (TTL expired)', async () => {
      const staleDate = new Date();
      staleDate.setHours(staleDate.getHours() - 2); // 2 hours ago

      mockSingle.mockResolvedValue({
        data: {
          user_id: 'user-123',
          updated_at: staleDate.toISOString(),
        },
        error: null,
      });

      const results = await getEngineResults('user-123', 1); // 1 hour TTL

      expect(results).toBeNull();
    });

    it('should return results if within TTL', async () => {
      const recentDate = new Date();
      recentDate.setMinutes(recentDate.getMinutes() - 30); // 30 minutes ago

      mockSingle.mockResolvedValue({
        data: {
          results: { health: { success: true } },
          updated_at: recentDate.toISOString(),
        },
        error: null,
      });

      const results = await getEngineResults('user-123', 1); // 1 hour TTL

      expect(results).not.toBeNull();
      expect(results).toEqual({ health: { success: true } });
    });

    it('should return null if no results found', async () => {
      mockSingle.mockResolvedValue({
        data: null,
        error: { code: 'PGRST116' }, // Not found
      });

      const results = await getEngineResults('user-123');

      expect(results).toBeNull();
    });

    it('should handle database errors', async () => {
      mockSingle.mockResolvedValue({
        data: null,
        error: { message: 'Database error' },
      });

      const results = await getEngineResults('user-123');

      expect(results).toBeNull();
    });
  });
});
