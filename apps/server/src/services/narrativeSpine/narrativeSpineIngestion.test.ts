import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../logger', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}));

vi.mock('./legacyClaimBridge', () => ({
  bridgeEntryIr: vi.fn(),
  bridgeResolvedEvent: vi.fn(),
  bridgeCrystallizedKnowledge: vi.fn(),
  bridgeEventInterpretation: vi.fn(),
}));

vi.mock('../narrative/history/lifeEventClassificationService', () => ({
  enrichResolvedEventClassification: vi.fn().mockResolvedValue(null),
}));

vi.mock('../cognition/decisionBridgeService', () => ({
  ingestDecisionFromEntryIr: vi.fn(),
}));

vi.mock('../cognition/graphBridgeService', () => ({
  ingestGraphNodeForEvent: vi.fn(),
}));

import { logger } from '../../logger';
import {
  bridgeEntryIr,
  bridgeResolvedEvent,
  bridgeCrystallizedKnowledge,
  bridgeEventInterpretation,
} from './legacyClaimBridge';
import {
  ingestEntryIr,
  ingestResolvedEvent,
  ingestCrystallizedKnowledge,
  ingestEventInterpretation,
} from './narrativeSpineIngestion';

describe('narrativeSpineIngestion', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('bridges entry_ir without blocking callers', async () => {
    vi.mocked(bridgeEntryIr).mockResolvedValue(null);
    ingestEntryIr('user-1', { id: 'ir-1' } as never);
    await Promise.resolve();
    expect(bridgeEntryIr).toHaveBeenCalledWith('user-1', 'ir-1');
  });

  it('routes DECISION entry_ir to decision bridge', async () => {
    const { ingestDecisionFromEntryIr } = await import('../cognition/decisionBridgeService');
    const ir = { id: 'ir-dec', knowledge_type: 'DECISION' } as never;
    ingestEntryIr('user-1', ir);
    await Promise.resolve();
    expect(ingestDecisionFromEntryIr).toHaveBeenCalledWith('user-1', ir);
    expect(bridgeEntryIr).not.toHaveBeenCalled();
  });

  it('bridges resolved events after classification', async () => {
    const { enrichResolvedEventClassification } = await import('../narrative/history/lifeEventClassificationService');
    vi.mocked(enrichResolvedEventClassification).mockResolvedValue(null);
    vi.mocked(bridgeResolvedEvent).mockResolvedValue(null);
    ingestResolvedEvent('user-1', 'event-1');
    await Promise.resolve();
    await Promise.resolve();
    expect(enrichResolvedEventClassification).toHaveBeenCalledWith('user-1', 'event-1');
    expect(bridgeResolvedEvent).toHaveBeenCalledWith('user-1', 'event-1');
  });

  it('bridges crystallized knowledge', async () => {
    vi.mocked(bridgeCrystallizedKnowledge).mockResolvedValue(null);
    ingestCrystallizedKnowledge('user-1', 'ck-1');
    await Promise.resolve();
    expect(bridgeCrystallizedKnowledge).toHaveBeenCalledWith('user-1', 'ck-1');
  });

  it('bridges event interpretations', async () => {
    vi.mocked(bridgeEventInterpretation).mockResolvedValue(null);
    ingestEventInterpretation('user-1', 'interp-1');
    await Promise.resolve();
    expect(bridgeEventInterpretation).toHaveBeenCalledWith('user-1', 'interp-1');
  });

  it('logs bridge failures without throwing', async () => {
    const { enrichResolvedEventClassification } = await import('../narrative/history/lifeEventClassificationService');
    vi.mocked(enrichResolvedEventClassification).mockResolvedValue(null);
    vi.mocked(bridgeResolvedEvent).mockRejectedValue(new Error('db down'));
    ingestResolvedEvent('user-1', 'event-1');
    await vi.waitFor(() => {
      expect(logger.warn).toHaveBeenCalled();
    });
  });
});
