import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildEngineContext } from './contextBuilder';
import { supabaseAdmin } from '../services/supabaseClient';
import { subDays } from 'date-fns';

vi.mock('../services/supabaseClient', () => ({
  supabaseAdmin: {
    from: vi.fn(),
  },
}));

describe('buildEngineContext', () => {
  let mockFrom: any;
  let mockSelect: any;
  let mockEq: any;
  let mockOrder: any;
  let mockLimit: any;
  let mockGte: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockLimit = vi.fn().mockResolvedValue({
      data: [{ id: '1', content: 'test', date: '2024-01-01', timestamp: '2024-01-01' }],
      error: null,
    });
    mockGte = vi.fn().mockReturnValue({ limit: mockLimit });
    mockOrder = vi.fn().mockReturnValue({ limit: mockLimit, gte: mockGte });
    mockEq = vi.fn().mockReturnValue({ order: mockOrder });
    mockSelect = vi.fn().mockReturnValue({ eq: mockEq });
    mockFrom = vi.fn().mockReturnValue({
      select: mockSelect,
    });

    (supabaseAdmin.from as any) = mockFrom;
  });

  it('should build context with default options', async () => {
    const context = await buildEngineContext('user-123');

    expect(context.user.id).toBe('user-123');
    expect(context.entries).toBeDefined();
    expect(mockFrom).toHaveBeenCalledWith('journal_entries');
    expect(mockLimit).toHaveBeenCalledWith(1000);
  });

  it('should apply entry limit', async () => {
    await buildEngineContext('user-123', { maxEntries: 500 });

    expect(mockLimit).toHaveBeenCalledWith(500);
  });

  it('should apply date cutoff', async () => {
    await buildEngineContext('user-123', { maxDays: 30 });

    expect(mockGte).toHaveBeenCalled();
    const dateArg = mockGte.mock.calls[0][1];
    expect(dateArg).toBeDefined();
  });

  it('should load all entries when includeAll is true', async () => {
    // When includeAll: true, .limit() is never called; .order() ends the chain and is awaited
    const manyEntries = Array(2000).fill(null).map((_, i) => ({
      id: String(i),
      content: 'test',
      date: '2024-01-01',
      timestamp: '2024-01-01',
    }));
    mockOrder.mockReturnValue(Promise.resolve({ data: manyEntries, error: null }));

    const context = await buildEngineContext('user-123', { includeAll: true });

    expect(context.entries.length).toBeGreaterThan(1000);
    expect(context.entries.length).toBe(2000);
  });

  it('should handle empty entries', async () => {
    mockLimit.mockResolvedValue({ data: [], error: null });

    const context = await buildEngineContext('user-123');

    expect(context.entries).toEqual([]);
    expect(context.user.id).toBe('user-123');
  });

  it('should handle database errors gracefully', async () => {
    mockLimit.mockResolvedValue({
      data: null,
      error: { message: 'Database error' },
    });

    const context = await buildEngineContext('user-123');

    expect(context.entries).toEqual([]);
    expect(context.user.id).toBe('user-123');
  });

  it('should return entries in chronological order', async () => {
    // DB returns most recent first (order ascending: false); contextBuilder reverses to oldest first
    const entriesFromDb = [
      { id: '3', content: 'third', date: '2024-01-03', timestamp: '2024-01-03' },
      { id: '2', content: 'second', date: '2024-01-02', timestamp: '2024-01-02' },
      { id: '1', content: 'first', date: '2024-01-01', timestamp: '2024-01-01' },
    ];
    mockLimit.mockResolvedValue({ data: entriesFromDb, error: null });

    const context = await buildEngineContext('user-123');

    // Reversed to chronological (oldest first): 1, 2, 3
    expect(context.entries[0].id).toBe('1');
    expect(context.entries[1].id).toBe('2');
    expect(context.entries[2].id).toBe('3');
  });

  it('should include relationships, goals, and habits', async () => {
    // Mock relationships table
    const mockRelationshipsFrom = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data: [{ id: 'rel-1' }], error: null }),
      }),
    });

    // Mock goals table
    const mockGoalsFrom = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data: [{ id: 'goal-1' }], error: null }),
      }),
    });

    // Mock habits table
    const mockHabitsFrom = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data: [{ id: 'habit-1' }], error: null }),
      }),
    });

    mockFrom.mockImplementation((table: string) => {
      if (table === 'relationships') return mockRelationshipsFrom();
      if (table === 'goals') return mockGoalsFrom();
      if (table === 'habits') return mockHabitsFrom();
      return { select: mockSelect };
    });

    const context = await buildEngineContext('user-123');

    expect(context.relationships).toBeDefined();
    expect(context.goals).toBeDefined();
    expect(context.habits).toBeDefined();
  });

  it('should handle missing optional tables gracefully', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'relationships' || table === 'goals' || table === 'habits') {
        throw new Error('Table not found');
      }
      return { select: mockSelect };
    });

    const context = await buildEngineContext('user-123');

    expect(context.relationships).toEqual([]);
    expect(context.goals).toEqual([]);
    expect(context.habits).toEqual([]);
  });

  it('should use both maxEntries and maxDays limits', async () => {
    await buildEngineContext('user-123', { maxEntries: 500, maxDays: 60 });

    expect(mockLimit).toHaveBeenCalledWith(500);
    expect(mockGte).toHaveBeenCalled();
  });
});
