import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), debug: vi.fn(), info: vi.fn() },
}));

vi.mock('../../config', () => ({
  config: { openai: { apiKey: 'test' } },
}));

vi.mock('../cognition/causalBridgeService', () => ({
  ingestCausalLink: vi.fn(),
}));

const mockFrom = vi.fn();

vi.mock('../supabaseClient', () => ({
  supabaseAdmin: { from: (...args: unknown[]) => mockFrom(...args) },
}));

import { chainableQuery } from '../../../tests/fixtures/cognitionSupabaseMock';
import { ingestCausalLink } from '../cognition/causalBridgeService';
import { EventCausalDetector } from './eventCausalDetector';

describe('EventCausalDetector cognition hook', () => {
  const detector = new EventCausalDetector();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('saveCausalLink calls ingestCausalLink after inserting a new link', async () => {
    let linkCalls = 0;
    mockFrom.mockImplementation((table: string) => {
      if (table !== 'event_causal_links') return chainableQuery({ data: null, error: null });
      linkCalls += 1;
      if (linkCalls === 1) {
        return chainableQuery({ data: null, error: { code: 'PGRST116', message: 'not found' } });
      }
      return chainableQuery({ data: { id: 'link-new' }, error: null });
    });

    await detector.saveCausalLink('user-1', {
      causeEventId: 'evt-a',
      effectEventId: 'evt-b',
      causalType: 'causes',
      confidence: 0.75,
      evidenceSourceIds: ['src-1'],
      evidence: 'Because of the layoff',
    });

    expect(ingestCausalLink).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({
        causeEventId: 'evt-a',
        effectEventId: 'evt-b',
        causalLinkId: 'link-new',
      }),
    );
  });

  it('saveCausalLink calls ingestCausalLink when updating existing link', async () => {
    mockFrom.mockImplementation((table: string) => {
      const b = chainableQuery({ data: null, error: null });
      if (table !== 'event_causal_links') return b;
      b.single = vi.fn(() =>
        chainableQuery({
          data: {
            id: 'link-existing',
            confidence: 0.6,
            evidence_source_ids: [],
            evidence_count: 1,
            metadata: {},
          },
          error: null,
        }),
      ) as never;
      b.update = vi.fn(() => chainableQuery({ data: null, error: null })) as never;
      return b;
    });

    await detector.saveCausalLink('user-1', {
      causeEventId: 'evt-a',
      effectEventId: 'evt-b',
      causalType: 'triggers',
      confidence: 0.9,
      evidenceSourceIds: ['src-2'],
    });

    expect(ingestCausalLink).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ causalLinkId: 'link-existing', confidence: 0.9 }),
    );
  });
});
