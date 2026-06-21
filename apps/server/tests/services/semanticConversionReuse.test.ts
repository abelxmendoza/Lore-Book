import { describe, it, expect, vi, beforeEach } from 'vitest';

const { extractEntities, resolveEntities, createPerceptionEntry } = vi.hoisted(() => ({
  extractEntities: vi.fn(),
  resolveEntities: vi.fn(),
  createPerceptionEntry: vi.fn(),
}));

vi.mock('../../src/services/omegaMemoryService', () => ({
  omegaMemoryService: { extractEntities, resolveEntities },
}));
vi.mock('../../src/services/perceptionService', () => ({
  perceptionService: { createPerceptionEntry },
}));
vi.mock('../../src/services/memoryService', () => ({
  memoryService: { saveEntry: vi.fn() },
}));
vi.mock('../../src/services/supabaseClient', () => ({ supabaseAdmin: {} }));
vi.mock('../../logger', () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

import { semanticConversionService } from '../../src/services/conversationCentered/semanticConversion';

const baseUnit = {
  id: 'u1',
  type: 'PERCEPTION' as const,
  content: 'I sense distance from Maria lately.',
  utterance_id: 'utt1',
  metadata: {},
};

const baseCtx = {
  userId: 'user-1',
  messageId: 'msg-1',
  sessionId: 'thread-1',
  utteranceId: 'utt1',
};

describe('semanticConversion perception reuse (Phase B single-pass)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createPerceptionEntry.mockResolvedValue({ id: 'perc-1' });
  });

  it('reuses message-level resolvedEntities without re-extracting per unit', async () => {
    const result = await semanticConversionService.convertUnitsToMemoryArtifacts(
      [baseUnit as any],
      {
        ...baseCtx,
        resolvedEntities: [{ id: 'p1', type: 'PERSON', name: 'Maria' }],
      } as any
    );

    expect(extractEntities).not.toHaveBeenCalled();
    expect(resolveEntities).not.toHaveBeenCalled();
    expect(result.perceptionEntries).toEqual(['perc-1']);
    expect(createPerceptionEntry).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ subject_person_id: 'p1' })
    );
  });

  it('treats an empty resolvedEntities set as "no person" without re-extracting', async () => {
    await semanticConversionService.convertUnitsToMemoryArtifacts([baseUnit as any], {
      ...baseCtx,
      resolvedEntities: [],
    } as any);

    expect(extractEntities).not.toHaveBeenCalled();
    expect(createPerceptionEntry).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ subject_person_id: undefined })
    );
  });

  it('falls back to per-unit extraction when no message-level set is threaded in', async () => {
    extractEntities.mockResolvedValue([{ name: 'Maria', type: 'PERSON' }]);
    resolveEntities.mockResolvedValue([{ id: 'p1', type: 'PERSON', primary_name: 'Maria' }]);

    await semanticConversionService.convertUnitsToMemoryArtifacts([baseUnit as any], {
      ...baseCtx,
      // resolvedEntities intentionally omitted (undefined)
    } as any);

    expect(extractEntities).toHaveBeenCalledTimes(1);
    expect(createPerceptionEntry).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ subject_person_id: 'p1' })
    );
  });
});
