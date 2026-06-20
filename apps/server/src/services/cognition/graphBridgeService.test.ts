import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../logger', () => ({
  logger: { warn: vi.fn(), info: vi.fn() },
}));

const mockFrom = vi.fn();

vi.mock('../supabaseClient', () => ({
  supabaseAdmin: { from: (...args: unknown[]) => mockFrom(...args) },
}));

vi.mock('./graphNodeRepository', () => ({
  upsertGraphNodeBySource: vi.fn(),
}));

vi.mock('./assertionEvidenceRepository', () => ({
  writeAssertionEvidence: vi.fn(),
}));

import { chainableQuery } from '../../../tests/fixtures/cognitionSupabaseMock';
import { writeAssertionEvidence } from './assertionEvidenceRepository';
import { upsertGraphNodeBySource } from './graphNodeRepository';
import { bridgeCharacterToGraphNode, bridgeResolvedEventToGraphNode } from './graphBridgeService';

describe('graphBridgeService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('no-ops when character is missing', async () => {
    mockFrom.mockReturnValue(
      chainableQuery({ data: null, error: null }),
    );

    await bridgeCharacterToGraphNode('user-1', 'char-missing');
    expect(upsertGraphNodeBySource).not.toHaveBeenCalled();
  });

  it('bridges character to person graph node with evidence', async () => {
    mockFrom.mockReturnValue(
      chainableQuery({
        data: { id: 'char-1', name: 'Abuela', importance_score: 0.9, metadata: { kin: true } },
        error: null,
      }),
    );
    vi.mocked(upsertGraphNodeBySource).mockResolvedValue({ id: 'node-1' } as never);

    await bridgeCharacterToGraphNode('user-1', 'char-1');

    expect(upsertGraphNodeBySource).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({
        nodeKind: 'person',
        displayName: 'Abuela',
        sourceTable: 'characters',
        sourceId: 'char-1',
      }),
    );
    expect(writeAssertionEvidence).toHaveBeenCalled();
  });

  it('no-ops when resolved event is missing', async () => {
    mockFrom.mockReturnValue(chainableQuery({ data: null, error: null }));
    await bridgeResolvedEventToGraphNode('user-1', 'evt-missing');
    expect(upsertGraphNodeBySource).not.toHaveBeenCalled();
  });

  it('bridges resolved event with significance from metadata', async () => {
    mockFrom.mockReturnValue(
      chainableQuery({
        data: {
          id: 'evt-1',
          title: 'Graduation',
          summary: 'College graduation',
          start_time: '2020-06-01T00:00:00Z',
          end_time: null,
          confidence: 0.7,
          metadata: { significance: 0.95, life_event_category: 'education' },
          type: 'milestone',
        },
        error: null,
      }),
    );
    vi.mocked(upsertGraphNodeBySource).mockResolvedValue({ id: 'node-evt' } as never);

    await bridgeResolvedEventToGraphNode('user-1', 'evt-1');

    expect(upsertGraphNodeBySource).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({
        nodeKind: 'event',
        displayName: 'Graduation',
        epistemicState: 'VERIFIED',
        meta: expect.objectContaining({ life_event_category: 'education' }),
      }),
    );
  });
});
