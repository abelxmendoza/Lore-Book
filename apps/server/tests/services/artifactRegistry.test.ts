import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockFrom = vi.fn();

vi.mock('../../src/services/supabaseClient', () => ({
  supabaseAdmin: { from: (...args: unknown[]) => mockFrom(...args) },
}));

vi.mock('../../src/services/provenance', () => ({
  correctionAuthority: {
    getMutationHistory: vi.fn().mockResolvedValue([]),
  },
  provenanceEdgeService: {
    getEdgesForArtifact: vi.fn().mockResolvedValue([]),
  },
}));

import { artifactRegistry } from '../../src/services/artifactRegistry';

function chain(result: { data?: unknown; error?: unknown }) {
  const builder = {
    select: vi.fn(),
    eq: vi.fn(),
    in: vi.fn(),
    order: vi.fn(),
    limit: vi.fn(),
    maybeSingle: vi.fn(),
    then: (resolve: (value: typeof result) => void) => resolve(result),
  };
  builder.select.mockReturnValue(builder);
  builder.eq.mockReturnValue(builder);
  builder.in.mockReturnValue(builder);
  builder.order.mockReturnValue(builder);
  builder.limit.mockReturnValue(builder);
  builder.maybeSingle.mockResolvedValue(result);
  return builder;
}

describe('artifactRegistry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('listGrouped returns journal_entries and insights buckets', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'journal_entries') {
        return chain({
          data: [
            {
              id: 'e1',
              title: 'Morning run',
              content: 'Ran 5k',
              metadata: { truth_state: 'CANONICAL' },
              created_at: '2024-01-02T00:00:00Z',
            },
          ],
        });
      }
      if (table === 'insights') {
        return chain({
          data: [
            {
              id: 'i1',
              content: 'You run consistently',
              metadata: { truth_state: 'INFERRED' },
              created_at: '2024-01-01T00:00:00Z',
            },
          ],
        });
      }
      return chain({ data: [] });
    });

    const grouped = await artifactRegistry.listGrouped('user-1', 10);

    expect(grouped.journal_entries).toHaveLength(1);
    expect(grouped.insights).toHaveLength(1);
    expect(grouped.entities).toEqual([]);
  });

  it('list filters by type when provided', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'characters') {
        return chain({
          data: [
            {
              id: 'c1',
              name: 'Maya',
              subtitle: 'Friend',
              metadata: {},
              created_at: '2024-01-03T00:00:00Z',
            },
          ],
        });
      }
      return chain({ data: [] });
    });

    const artifacts = await artifactRegistry.list('user-1', { type: 'character', limit: 5 });

    expect(artifacts).toHaveLength(1);
    expect(artifacts[0]).toMatchObject({
      id: 'c1',
      type: 'character',
      title: 'Maya',
      sourceTable: 'characters',
    });
  });
});
