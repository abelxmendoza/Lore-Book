import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../logger', () => ({
  logger: { warn: vi.fn(), info: vi.fn() },
}));

const mockFrom = vi.fn();

vi.mock('../supabaseClient', () => ({
  supabaseAdmin: { from: (...args: unknown[]) => mockFrom(...args) },
}));

vi.mock('../narrativeSpine/legacyClaimBridge', () => ({
  bridgeEntryIr: vi.fn(),
}));

vi.mock('../narrativeSpine/narrativeClaimRepository', () => ({
  findClaimBySource: vi.fn(),
  upsertClaimBySource: vi.fn(),
  upsertEdge: vi.fn(),
}));

vi.mock('./graphNodeRepository', () => ({
  upsertGraphNodeBySource: vi.fn(),
}));

vi.mock('./assertionEvidenceRepository', () => ({
  writeAssertionEvidence: vi.fn(),
}));

import { bridgeEntryIr } from '../narrativeSpine/legacyClaimBridge';
import {
  findClaimBySource,
  upsertClaimBySource,
  upsertEdge,
} from '../narrativeSpine/narrativeClaimRepository';
import { chainableQuery } from '../../../tests/fixtures/cognitionSupabaseMock';
import { writeAssertionEvidence } from './assertionEvidenceRepository';
import { upsertGraphNodeBySource } from './graphNodeRepository';
import { bridgeDecisionFromEntryIr } from './decisionBridgeService';

const decisionIr = {
  id: 'ir-dec-1',
  knowledge_type: 'DECISION' as const,
  content: 'I decided to leave Amazon and focus on LoreBook full time.',
  confidence: 0.88,
  timestamp: '2024-03-01T12:00:00Z',
  source_utterance_id: 'utt-1',
  themes: [{ theme: 'career', confidence: 0.8 }],
  emotions: [{ emotion: 'excited', confidence: 0.7 }],
};

describe('decisionBridgeService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns null for non-DECISION entry_ir', async () => {
    const result = await bridgeDecisionFromEntryIr('user-1', {
      ...decisionIr,
      knowledge_type: 'FACT',
    } as never);
    expect(result).toBeNull();
  });

  it('creates decision, claim, graph node, and evidence on happy path', async () => {
    let decisionsCalls = 0;
    mockFrom.mockImplementation((table: string) => {
      if (table === 'decisions') {
        decisionsCalls += 1;
        if (decisionsCalls === 1) {
          return chainableQuery({ data: null, error: null });
        }
        return chainableQuery({ data: { id: 'dec-new' }, error: null });
      }
      if (table === 'decision_rationales') {
        return chainableQuery({ data: null, error: null });
      }
      return chainableQuery({ data: null, error: null });
    });

    vi.mocked(upsertClaimBySource).mockResolvedValue({ id: 'claim-dec' } as never);
    vi.mocked(findClaimBySource).mockResolvedValue({ id: 'evidence-utt' } as never);
    vi.mocked(upsertGraphNodeBySource).mockResolvedValue({ id: 'node-dec' } as never);

    const decisionId = await bridgeDecisionFromEntryIr('user-1', decisionIr as never);

    expect(decisionId).toBe('dec-new');
    expect(upsertClaimBySource).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ claimKind: 'decision', epistemicState: 'VERIFIED' }),
    );
    expect(upsertEdge).toHaveBeenCalled();
    expect(writeAssertionEvidence).toHaveBeenCalled();
  });

  it('reuses existing decision linked by source_entry_ir_id', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'decisions') {
        return chainableQuery({ data: { id: 'dec-existing' }, error: null });
      }
      return chainableQuery({ data: null, error: null });
    });
    vi.mocked(upsertClaimBySource).mockResolvedValue({ id: 'claim-dec' } as never);

    const decisionId = await bridgeDecisionFromEntryIr('user-1', decisionIr as never);

    expect(decisionId).toBe('dec-existing');
  });

  it('falls back to bridgeEntryIr when utterance evidence claim is missing', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'decisions') {
        return chainableQuery({ data: { id: 'dec-existing' }, error: null });
      }
      return chainableQuery({ data: null, error: null });
    });
    vi.mocked(upsertClaimBySource).mockResolvedValue({ id: 'claim-dec' } as never);
    vi.mocked(findClaimBySource).mockResolvedValue(null);

    await bridgeDecisionFromEntryIr('user-1', decisionIr as never);

    expect(bridgeEntryIr).toHaveBeenCalledWith('user-1', 'ir-dec-1');
  });

  it('returns null when decision insert fails', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'decisions') {
        return chainableQuery({ data: null, error: null });
      }
      return chainableQuery({ data: null, error: { message: 'insert failed' } });
    });

    const result = await bridgeDecisionFromEntryIr('user-1', decisionIr as never);
    expect(result).toBeNull();
  });
});
