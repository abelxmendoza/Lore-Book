import { describe, it, expect, vi, beforeEach } from 'vitest';
import { chapterService } from '../src/services/chapterService';
import { supabaseAdmin } from '../src/services/supabaseClient';

vi.mock('../src/services/supabaseClient', () => ({
  supabaseAdmin: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          order: vi.fn(() => Promise.resolve({ data: [], error: null }))
        }))
      })),
      insert: vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn(() => Promise.resolve({ data: null, error: null }))
        }))
      })),
      update: vi.fn(() => ({
        eq: vi.fn(() => ({
          select: vi.fn(() => ({
            single: vi.fn(() => Promise.resolve({ data: null, error: null }))
          }))
        }))
      }))
    }))
  }
}));

describe('ChapterService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('listChapters', () => {
    it('should return empty array when table does not exist', async () => {
      const mockError = {
        code: '42P01',
        message: 'relation "chapters" does not exist'
      };

      vi.mocked(supabaseAdmin.from).mockReturnValueOnce({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            order: vi.fn(() => Promise.resolve({ data: null, error: mockError }))
          }))
        }))
      } as any);

      const result = await chapterService.listChapters('test-user-id');
      expect(result).toEqual([]);
    });

    it('should return chapters when table exists', async () => {
      const mockChapters = [
        {
          id: '1',
          user_id: 'test-user-id',
          title: 'Test Chapter',
          start_date: new Date().toISOString(),
          end_date: null,
          description: 'Test description',
          summary: 'Test summary',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }
      ];

      vi.mocked(supabaseAdmin.from).mockReturnValueOnce({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            order: vi.fn(() => Promise.resolve({ data: mockChapters, error: null }))
          }))
        }))
      } as any);

      const result = await chapterService.listChapters('test-user-id');
      expect(result).toEqual(mockChapters);
    });
  });

  describe('createChapter', () => {
    it('should throw error when table does not exist', async () => {
      const mockError = {
        code: '42P01',
        message: 'relation "chapters" does not exist'
      };

      vi.mocked(supabaseAdmin.from).mockReturnValueOnce({
        insert: vi.fn(() => ({
          select: vi.fn(() => ({
            single: vi.fn(() => Promise.resolve({ data: null, error: mockError }))
          }))
        }))
      } as any);

      await expect(
        chapterService.createChapter('test-user-id', {
          title: 'Test Chapter',
          startDate: new Date().toISOString()
        })
      ).rejects.toThrow('Database table "chapters" does not exist');
    });
  });
});

