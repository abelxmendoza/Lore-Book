import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../logger', () => ({
  logger: { warn: vi.fn(), info: vi.fn() },
}));

const mockFrom = vi.fn();

vi.mock('../supabaseClient', () => ({
  supabaseAdmin: { from: (...args: unknown[]) => mockFrom(...args) },
}));

import { chainableQuery } from '../../../tests/fixtures/cognitionSupabaseMock';
import { upsertGraphEdge, listEdgesFromNode } from './graphEdgeRepository';

describe('graphEdgeRepository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects invalid edge kind combinations', async () => {
    const result = await upsertGraphEdge('user-1', {
      fromNodeId: 'n1',
      toNodeId: 'n2',
      relationKind: 'FRIEND_OF',
      fromNodeKind: 'event',
      toNodeKind: 'person',
    });
    expect(result).toBeNull();
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('inserts valid person-to-person FRIEND_OF edge', async () => {
    let call = 0;
    mockFrom.mockImplementation(() => {
      call += 1;
      if (call === 1) {
        return chainableQuery({ data: null, error: null });
      }
      return chainableQuery({
        data: {
          id: 'edge-1',
          relation_kind: 'FRIEND_OF',
          from_node_id: 'p1',
          to_node_id: 'p2',
        },
        error: null,
      });
    });

    const edge = await upsertGraphEdge('user-1', {
      fromNodeId: 'p1',
      toNodeId: 'p2',
      relationKind: 'FRIEND_OF',
      fromNodeKind: 'person',
      toNodeKind: 'person',
      confidence: 0.75,
    });

    expect(edge).toMatchObject({ id: 'edge-1', relation_kind: 'FRIEND_OF' });
  });

  it('updates existing active edge instead of duplicating', async () => {
    let call = 0;
    mockFrom.mockImplementation(() => {
      call += 1;
      if (call === 1) {
        return chainableQuery({ data: { id: 'edge-existing' }, error: null });
      }
      return chainableQuery({
        data: { id: 'edge-existing', confidence: 0.95 },
        error: null,
      });
    });

    const edge = await upsertGraphEdge('user-1', {
      fromNodeId: 'p1',
      toNodeId: 'p2',
      relationKind: 'WORKS_AT',
      fromNodeKind: 'person',
      toNodeKind: 'organization',
      confidence: 0.95,
    });

    expect(edge?.id).toBe('edge-existing');
  });

  it('listEdgesFromNode returns empty on error', async () => {
    mockFrom.mockReturnValue(chainableQuery({ data: null, error: { message: 'fail' } }));
    expect(await listEdgesFromNode('user-1', 'node-1')).toEqual([]);
  });
});
