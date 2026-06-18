import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/services/provenance', () => ({
  correctionAuthority: {
    recordSystemMutation: vi.fn().mockResolvedValue(undefined),
  },
}));

import { correctionAuthority } from '../../src/services/provenance';
import { recordEntityConsolidation } from '../../src/services/consolidationProtocol';

describe('consolidationProtocol', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('writes ENTITY_MERGE to cognition_mutations via CorrectionAuthority', async () => {
    await recordEntityConsolidation({
      userId: 'user-1',
      action: 'ENTITY_MERGE',
      sourceArtifactType: 'character',
      sourceArtifactId: 'src-1',
      targetArtifactId: 'tgt-1',
      beforeState: { name: 'Juan' },
      afterState: { merged_into: 'tgt-1' },
      rationale: 'duplicate',
    });

    expect(correctionAuthority.recordSystemMutation).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        mutationType: 'ENTITY_MERGE',
        artifactType: 'character',
        artifactId: 'src-1',
      })
    );
  });
});
