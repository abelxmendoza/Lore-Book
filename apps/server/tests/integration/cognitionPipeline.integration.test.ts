/**
 * Integration — cognition ingestion hooks fire the correct bridges without blocking callers.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/logger', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

vi.mock('../../src/services/narrativeSpine/legacyClaimBridge', () => ({
  bridgeEntryIr: vi.fn().mockResolvedValue({ id: 'claim-1' }),
  bridgeResolvedEvent: vi.fn().mockResolvedValue({ id: 'claim-event' }),
  bridgeCrystallizedKnowledge: vi.fn().mockResolvedValue({ id: 'claim-ck' }),
  bridgeEventInterpretation: vi.fn().mockResolvedValue({ id: 'claim-int' }),
}));

vi.mock('../../src/services/narrative/history/lifeEventClassificationService', () => ({
  enrichResolvedEventClassification: vi.fn().mockResolvedValue(null),
}));

vi.mock('../../src/services/cognition/decisionBridgeService', () => ({
  ingestDecisionFromEntryIr: vi.fn(),
}));

vi.mock('../../src/services/cognition/graphBridgeService', () => ({
  ingestGraphNodeForEvent: vi.fn(),
}));

import {
  bridgeEntryIr,
  bridgeResolvedEvent,
  bridgeCrystallizedKnowledge,
  bridgeEventInterpretation,
} from '../../src/services/narrativeSpine/legacyClaimBridge';
import { enrichResolvedEventClassification } from '../../src/services/narrative/history/lifeEventClassificationService';
import {
  ingestEntryIr,
  ingestResolvedEvent,
  ingestCrystallizedKnowledge,
  ingestEventInterpretation,
} from '../../src/services/narrativeSpine/narrativeSpineIngestion';
import { ingestDecisionFromEntryIr } from '../../src/services/cognition/decisionBridgeService';
import { ingestGraphNodeForEvent } from '../../src/services/cognition/graphBridgeService';

describe('cognition pipeline integration (ingestion hooks)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('FACT entry_ir uses generic bridge, DECISION uses decision bridge', async () => {
    ingestEntryIr('user-1', { id: 'ir-fact', knowledge_type: 'FACT' } as never);
    ingestEntryIr('user-1', { id: 'ir-dec', knowledge_type: 'DECISION' } as never);
    await Promise.resolve();
    await Promise.resolve();

    expect(bridgeEntryIr).toHaveBeenCalledWith('user-1', 'ir-fact');
    expect(ingestDecisionFromEntryIr).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ id: 'ir-dec' }),
    );
    expect(bridgeEntryIr).not.toHaveBeenCalledWith('user-1', 'ir-dec');
  });

  it('resolved event pipeline: classify → claim → graph node', async () => {
    ingestResolvedEvent('user-1', 'evt-1');
    await vi.waitFor(() => {
      expect(enrichResolvedEventClassification).toHaveBeenCalledWith('user-1', 'evt-1');
      expect(bridgeResolvedEvent).toHaveBeenCalledWith('user-1', 'evt-1');
      expect(ingestGraphNodeForEvent).toHaveBeenCalledWith('user-1', 'evt-1');
    });
  });

  it('crystallized knowledge and interpretations still bridge independently', async () => {
    ingestCrystallizedKnowledge('user-1', 'ck-1');
    ingestEventInterpretation('user-1', 'int-1');
    await Promise.resolve();

    expect(bridgeCrystallizedKnowledge).toHaveBeenCalledWith('user-1', 'ck-1');
    expect(bridgeEventInterpretation).toHaveBeenCalledWith('user-1', 'int-1');
  });
});
