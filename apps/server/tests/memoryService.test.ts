import { describe, it, expect, vi, beforeEach } from 'vitest';
import { memoryService } from '../src/services/memoryService';
import { supabaseAdmin } from '../src/services/supabaseClient';
import { dateAssignmentService } from '../src/services/dateAssignmentService';
import { peoplePlacesService } from '../src/services/peoplePlacesService';
import { embeddingService } from '../src/services/embeddingService';

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

vi.mock('../src/services/dateAssignmentService', () => ({
  dateAssignmentService: { suggestDate: vi.fn() },
}));

vi.mock('../src/services/peoplePlacesService', () => ({
  peoplePlacesService: { recordEntitiesForEntry: vi.fn().mockResolvedValue([]) },
}));

vi.mock('../src/services/embeddingService', () => ({
  embeddingService: { embedText: vi.fn().mockResolvedValue([0.1, 0.2]) },
}));

vi.mock('../src/services/characterFoundationService', () => ({
  characterFoundationService: { promoteEntityToCharacter: vi.fn().mockResolvedValue(undefined) },
}));

vi.mock('../src/services/skills/skillExtractionService', () => ({
  skillExtractionService: { processEntryForSkills: vi.fn().mockResolvedValue([]) },
}));

vi.mock('../src/services/quests/questSuggestionService', () => ({
  questSuggestionService: { processEntryForQuestSuggestions: vi.fn().mockResolvedValue(0) },
}));

vi.mock('../src/services/projects/projectSuggestionService', () => ({
  projectSuggestionService: { processEntryForProjectSuggestions: vi.fn().mockResolvedValue(0) },
}));

vi.mock('../src/services/unifiedErIngestion', () => ({
  ingestJournalEntry: vi.fn().mockResolvedValue(undefined),
}));

describe('MemoryService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    memoryService.invalidateEntryListCache('test-user-id');
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
      expect(result.timeline).toEqual({
        chapters: [],
        unassigned: [],
      });
      expect(result.timing).toMatchObject({
        totalMs: expect.any(Number),
        dbMs: expect.any(Number),
        stitchMs: expect.any(Number),
        serializeMs: expect.any(Number),
        chapterLoadMs: expect.any(Number),
        entryCacheHit: expect.any(Boolean),
        openaiMs: 0,
      });
    });
  });

  describe('saveEntry — time_precision/time_confidence evidence (not just now()-defaults)', () => {
    let insertedRows: Record<string, unknown>[];

    beforeEach(() => {
      insertedRows = [];
      vi.mocked(supabaseAdmin.from).mockImplementation((table: string) => {
        if (table === 'journal_entries') {
          return {
            insert: vi.fn((row: Record<string, unknown>) => {
              insertedRows.push(row);
              return Promise.resolve({ data: null, error: null });
            }),
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                order: vi.fn(() => ({ limit: vi.fn(() => Promise.resolve({ data: [], error: null })) })),
              })),
            })),
          } as any;
        }
        return {
          select: vi.fn(() => ({ eq: vi.fn(() => ({ order: vi.fn(() => ({ limit: vi.fn(() => Promise.resolve({ data: [], error: null })) })) })) })),
          insert: vi.fn(() => Promise.resolve({ data: null, error: null })),
          update: vi.fn(() => ({ eq: vi.fn(() => Promise.resolve({ data: null, error: null })) })),
        } as any;
      });
    });

    it('an explicit caller-supplied date is stored as occurrence, not recording time', async () => {
      await memoryService.saveEntry({
        userId: 'u1',
        content: 'Short note.',
        date: '2026-07-04T00:00:00.000Z',
      });
      expect(insertedRows[0]).toMatchObject({
        date: '2026-07-04T00:00:00.000Z',
        timestamp: '2026-07-04T00:00:00.000Z',
      });
      expect(insertedRows[0].time_confidence as number).toBeGreaterThanOrEqual(0.9);
    });

    it('a confident, explicit date extracted from content carries its real precision/confidence through', async () => {
      vi.mocked(dateAssignmentService.suggestDate).mockResolvedValueOnce({
        date: new Date('2026-03-01T00:00:00.000Z'),
        precision: 'month',
        confidence: 0.85,
        source: 'extracted',
      });
      await memoryService.saveEntry({
        userId: 'u1',
        content: 'A long enough entry describing something that happened sometime in March, a while back now.',
      });
      expect(insertedRows[0]).toMatchObject({ time_precision: 'month', time_confidence: 0.85 });
    });

    it('a low-confidence suggestion does not mint today as occurrence', async () => {
      vi.mocked(dateAssignmentService.suggestDate).mockResolvedValueOnce({
        date: new Date(),
        precision: 'day',
        confidence: 0.2,
        source: 'default',
        context: 'No date found, using current date',
      });
      await memoryService.saveEntry({
        userId: 'u1',
        content: 'A long enough entry with genuinely no date information anywhere in it at all.',
      });
      expect(insertedRows[0].date).toBeNull();
      expect(insertedRows[0].timestamp).toBeNull();
      expect(insertedRows[0].time_precision).toBe('unknown');
      expect(insertedRows[0].time_confidence).toBe(0);
    });

    it('no content to infer from leaves occurrence null instead of stamping now()', async () => {
      await memoryService.saveEntry({ userId: 'u1', content: 'short' });
      expect(insertedRows[0]).toMatchObject({
        date: null,
        timestamp: null,
        time_precision: 'unknown',
        time_confidence: 0,
      });
    });

    it('a dateAssignmentService failure does not mint today as occurrence', async () => {
      vi.mocked(dateAssignmentService.suggestDate).mockRejectedValueOnce(new Error('boom'));
      await memoryService.saveEntry({
        userId: 'u1',
        content: 'A long enough entry that will trigger date suggestion, which then fails.',
      });
      expect(insertedRows[0]).toMatchObject({
        date: null,
        timestamp: null,
        time_precision: 'unknown',
        time_confidence: 0,
      });
    });
  });

  describe('listTags', () => {
    it('should return empty array when no entries exist', async () => {
      const result = await memoryService.listTags('test-user-id');
      expect(result.tags).toEqual([]);
      expect(result.timing).toMatchObject({
        totalMs: expect.any(Number),
        dbMs: expect.any(Number),
        computeMs: expect.any(Number),
        serializeMs: expect.any(Number),
        entryCacheHit: expect.any(Boolean),
        openaiMs: 0,
      });
    });
  });
});

