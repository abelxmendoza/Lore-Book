import { describe, it, expect, vi, beforeEach } from 'vitest';
import { memoryService } from '../src/services/memoryService';
import { supabaseAdmin } from '../src/services/supabaseClient';

vi.mock('../src/services/supabaseClient', () => ({
  supabaseAdmin: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          order: vi.fn(() => ({
            limit: vi.fn(() => Promise.resolve({ data: [], error: null }))
          }))
        }))
      })),
      insert: vi.fn(() => Promise.resolve({ data: null, error: null })),
      update: vi.fn(() => ({
        eq: vi.fn(() => Promise.resolve({ data: null, error: null }))
      }))
    }))
  }
}));

describe('MemoryService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('searchEntries', () => {
    it('should return empty array when table does not exist', async () => {
      const mockError = {
        code: '42P01',
        message: 'relation "journal_entries" does not exist'
      };

      vi.mocked(supabaseAdmin.from).mockReturnValueOnce({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            order: vi.fn(() => ({
              limit: vi.fn(() => Promise.resolve({ data: null, error: mockError }))
            }))
          }))
        }))
      } as any);

      const result = await memoryService.searchEntries('test-user-id', {});
      expect(result).toEqual([]);
    });

    it('should return entries when table exists', async () => {
      const mockEntries = [
        {
          id: '1',
          user_id: 'test-user-id',
          content: 'Test entry',
          date: new Date().toISOString(),
          tags: ['test'],
          chapter_id: null,
          mood: 'happy',
          summary: 'Test summary',
          source: 'manual',
          metadata: {}
        }
      ];

      vi.mocked(supabaseAdmin.from).mockReturnValueOnce({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            order: vi.fn(() => ({
              limit: vi.fn(() => Promise.resolve({ data: mockEntries, error: null }))
            }))
          }))
        }))
      } as any);

      const result = await memoryService.searchEntries('test-user-id', {});
      expect(result).toEqual(mockEntries);
    });
  });

  describe('getTimeline', () => {
    it('should return empty timeline when no data exists', async () => {
      const result = await memoryService.getTimeline('test-user-id');
      expect(result).toEqual({
        chapters: [],
        unassigned: []
      });
    });
  });

  describe('listTags', () => {
    it('should return empty array when no entries exist', async () => {
      const result = await memoryService.listTags('test-user-id');
      expect(result).toEqual([]);
    });
  });
});

