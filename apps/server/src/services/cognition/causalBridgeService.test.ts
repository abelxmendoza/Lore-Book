import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../logger', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

vi.mock('../narrativeSpine/legacyClaimBridge', () => ({
  bridgeResolvedEvent: vi.fn(),
}));

vi.mock('../narrativeSpine/narrativeClaimRepository', () => ({
  upsertEdge: vi.fn(),
}));

import { bridgeResolvedEvent } from '../narrativeSpine/legacyClaimBridge';
import { upsertEdge } from '../narrativeSpine/narrativeClaimRepository';
import { bridgeCausalLink, ingestCausalLink } from './causalBridgeService';

describe('causalBridgeService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('bridges causal link when both event claims exist', async () => {
    vi.mocked(bridgeResolvedEvent)
      .mockResolvedValueOnce({ id: 'claim-cause' } as never)
      .mockResolvedValueOnce({ id: 'claim-effect' } as never);
    vi.mocked(upsertEdge).mockResolvedValue({ id: 'edge-1' } as never);

    const ok = await bridgeCausalLink('user-1', {
      causeEventId: 'evt-cause',
      effectEventId: 'evt-effect',
      causalType: 'causes',
      confidence: 0.82,
      causalLinkId: 'link-1',
    });

    expect(ok).toBe(true);
    expect(upsertEdge).toHaveBeenCalledWith(
      'user-1',
      'claim-cause',
      'claim-effect',
      'caused',
      0.82,
      expect.objectContaining({ causal_type: 'causes', causal_link_id: 'link-1' }),
    );
  });

  it('returns false when cause claim cannot be resolved', async () => {
    vi.mocked(bridgeResolvedEvent)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'claim-effect' } as never);

    const ok = await bridgeCausalLink('user-1', {
      causeEventId: 'missing',
      effectEventId: 'evt-effect',
      causalType: 'triggers',
      confidence: 0.5,
    });

    expect(ok).toBe(false);
    expect(upsertEdge).not.toHaveBeenCalled();
  });

  it('maps unknown causal types to led_to', async () => {
    vi.mocked(bridgeResolvedEvent)
      .mockResolvedValueOnce({ id: 'c1' } as never)
      .mockResolvedValueOnce({ id: 'c2' } as never);
    vi.mocked(upsertEdge).mockResolvedValue({ id: 'e1' } as never);

    await bridgeCausalLink('user-1', {
      causeEventId: 'a',
      effectEventId: 'b',
      causalType: 'unknown_future_type',
      confidence: 0.6,
    });

    expect(upsertEdge).toHaveBeenCalledWith('user-1', 'c1', 'c2', 'led_to', 0.6, expect.any(Object));
  });

  it('ingestCausalLink swallows bridge errors without throwing', async () => {
    vi.mocked(bridgeResolvedEvent).mockRejectedValue(new Error('db down'));
    expect(() =>
      ingestCausalLink('user-1', {
        causeEventId: 'a',
        effectEventId: 'b',
        causalType: 'causes',
        confidence: 0.5,
      }),
    ).not.toThrow();
    await vi.waitFor(() => expect(bridgeResolvedEvent).toHaveBeenCalled());
  });
});
