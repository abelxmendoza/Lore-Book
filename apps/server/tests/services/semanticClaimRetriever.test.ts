import { describe, expect, it, vi } from 'vitest';

import {
  retrieveSemanticClaimCandidates,
  SEMANTIC_RECALL_THRESHOLD,
} from '../../src/services/chat/semanticClaimRetriever';

describe('retrieveSemanticClaimCandidates', () => {
  it('returns ranked semantic candidates above the retrieval threshold', async () => {
    const embed = vi.fn().mockResolvedValue([0.1, 0.2]);
    const match = vi.fn().mockResolvedValue([
      {
        id: 'claim-low',
        entity_id: 'entity-1',
        text: 'Below threshold',
        confidence: 0.9,
        similarity: SEMANTIC_RECALL_THRESHOLD - 0.01,
      },
      {
        id: 'claim-high',
        entity_id: 'entity-2',
        text: 'The project is a long-running personal memory system.',
        confidence: 0.86,
        similarity: 0.91,
      },
    ]);

    const rows = await retrieveSemanticClaimCandidates(
      'What am I building toward?',
      'user-1',
      { enabled: true, embed, match },
    );

    expect(embed).toHaveBeenCalledWith('What am I building toward?');
    expect(match).toHaveBeenCalledWith(
      [0.1, 0.2],
      'user-1',
      SEMANTIC_RECALL_THRESHOLD,
      5,
    );
    expect(rows.map((row) => row.id)).toEqual(['claim-high']);
  });

  it('fails closed when embedding or RPC retrieval is unavailable', async () => {
    const rows = await retrieveSemanticClaimCandidates(
      'Tell me about the project',
      'user-1',
      {
        enabled: true,
        embed: vi.fn().mockRejectedValue(new Error('offline')),
      },
    );

    expect(rows).toEqual([]);
  });
});
