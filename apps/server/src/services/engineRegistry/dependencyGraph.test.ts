import { beforeEach, describe, expect, it, vi } from 'vitest';

import { logger } from '../../logger';
import { supabaseAdmin } from '../supabaseClient';

import { DependencyGraph, resetDependencyGraphDiagnosticsForTests } from './dependencyGraph';

vi.mock('../../logger', () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

vi.mock('../supabaseClient', () => ({
  supabaseAdmin: {
    from: vi.fn(),
  },
}));

describe('DependencyGraph', () => {
  let graph: DependencyGraph;
  let mockFrom: ReturnType<typeof vi.fn>;
  let mockSelect: ReturnType<typeof vi.fn>;
  let mockEq: ReturnType<typeof vi.fn>;
  let mockInsert: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    resetDependencyGraphDiagnosticsForTests();

    graph = new DependencyGraph();
    mockEq = vi.fn().mockResolvedValue({ data: [], error: null });
    mockSelect = vi.fn().mockReturnValue({ eq: mockEq });
    mockInsert = vi.fn().mockResolvedValue({ data: null, error: null });
    mockFrom = vi.fn().mockReturnValue({
      select: mockSelect,
      insert: mockInsert,
    });

    vi.mocked(supabaseAdmin.from).mockImplementation(mockFrom);
  });

  it('reads dependencies from engine_dependencies', async () => {
    mockEq.mockResolvedValue({
      data: [{ depends_on: 'identityCore' }, { depends_on: 'personality' }],
      error: null,
    });

    const dependencies = await graph.getDependencies('storyOfSelf');

    expect(dependencies).toEqual(['identityCore', 'personality']);
    expect(mockFrom).toHaveBeenCalledWith('engine_dependencies');
    expect(mockSelect).toHaveBeenCalledWith('depends_on');
    expect(mockEq).toHaveBeenCalledWith('engine_name', 'storyOfSelf');
  });

  it('returns an empty list and warns once when engine_dependencies is missing', async () => {
    const missingTableError = {
      code: 'PGRST205',
      message: "Could not find the table 'public.engine_dependencies' in the schema cache",
    };
    mockEq.mockResolvedValue({ data: null, error: missingTableError });

    await expect(graph.getDependencies('insightEngine')).resolves.toEqual([]);
    await expect(graph.getDependencies('xpEngine')).resolves.toEqual([]);

    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        error: missingTableError,
        engine: 'insightEngine',
        table: 'engine_dependencies',
      }),
      expect.stringContaining('Engine dependency table missing')
    );
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('logs normal Supabase query errors as errors', async () => {
    const queryError = { code: '42501', message: 'permission denied for table engine_dependencies' };
    mockEq.mockResolvedValue({ data: null, error: queryError });

    await expect(graph.getDependencies('recommendationEngine')).resolves.toEqual([]);

    expect(logger.error).toHaveBeenCalledWith(
      { error: queryError, engine: 'recommendationEngine' },
      'Failed to get dependencies'
    );
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('resolves dependency order with transitive dependencies', async () => {
    mockEq.mockImplementation(async (_column: string, engine: string) => {
      const rowsByEngine: Record<string, Array<{ depends_on: string }>> = {
        storyOfSelf: [{ depends_on: 'personality' }],
        personality: [{ depends_on: 'identityCore' }],
        identityCore: [],
      };
      return { data: rowsByEngine[engine] ?? [], error: null };
    });

    const order = await graph.resolveOrder(['storyOfSelf', 'identityCore', 'personality']);

    expect(order).toEqual(['identityCore', 'personality', 'storyOfSelf']);
  });

  it('inserts a dependency edge', async () => {
    await graph.addDependency('storyOfSelf', 'personality');

    expect(mockFrom).toHaveBeenCalledWith('engine_dependencies');
    expect(mockInsert).toHaveBeenCalledWith({
      engine_name: 'storyOfSelf',
      depends_on: 'personality',
    });
  });
});

