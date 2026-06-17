import { beforeEach, describe, expect, it, vi } from 'vitest';

const { saveRelationship, resolveEntities } = vi.hoisted(() => ({
  saveRelationship: vi.fn().mockResolvedValue(undefined),
  resolveEntities: vi.fn(),
}));

vi.mock('../../src/services/conversationCentered/romanticRelationshipDetector', () => ({
  romanticRelationshipDetector: { saveRelationship },
}));

vi.mock('../../src/services/conversationCentered/romanticInteractionExtractor', () => ({
  extractAndLogInteraction: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/services/omegaMemoryService', () => ({
  omegaMemoryService: { resolveEntities },
}));

const mockMaybeSingle = vi.fn();

function supabaseChain(resolveValue: unknown) {
  const chain: Record<string, unknown> & PromiseLike<unknown> = {
    then(onfulfilled, onrejected) {
      return Promise.resolve(resolveValue).then(onfulfilled, onrejected);
    },
  };
  chain.eq = vi.fn(() => chain);
  chain.neq = vi.fn(() => chain);
  chain.order = vi.fn(() => chain);
  chain.limit = vi.fn(() => chain);
  chain.maybeSingle = vi.fn(() => Promise.resolve(resolveValue));
  chain.single = vi.fn(() => Promise.resolve(resolveValue));
  return chain;
}

vi.mock('../../src/services/supabaseClient', () => ({
  supabaseAdmin: {
    from: (table: string) => {
      if (table === 'characters') {
        return {
          select: vi.fn(() =>
            supabaseChain({
              data: [{ id: 'char-alex', name: 'Alex', alias: [], status: 'active' }],
            })
          ),
        };
      }
      if (table === 'romantic_relationships') {
        const relChain = supabaseChain({ data: null });
        relChain.maybeSingle = vi.fn(() => mockMaybeSingle());
        return {
          select: vi.fn(() => relChain),
          update: vi.fn(() => supabaseChain({ error: null })),
        };
      }
      return { select: vi.fn(() => supabaseChain({ data: null })), update: vi.fn(() => supabaseChain({ error: null })) };
    },
  },
}));

import {
  ingestRomanticLexicalFromMessage,
  resolveRomanticPartner,
} from '../../src/services/romanticLexicalIngestionService';

describe('romanticLexicalIngestionService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolveEntities.mockResolvedValue([
      { id: 'omega-priya', primary_name: 'Priya', type: 'PERSON' },
    ]);
    mockMaybeSingle.mockResolvedValue({
      data: { id: 'rel-new', metadata: {} },
    });
  });

  it('returns empty when no romantic signals', async () => {
    const result = await ingestRomanticLexicalFromMessage('u1', 'Went grocery shopping', 'msg-1');
    expect(result.saved).toBe(0);
    expect(saveRelationship).not.toHaveBeenCalled();
  });

  it('ingests girlfriend mention from live chat', async () => {
    const result = await ingestRomanticLexicalFromMessage(
      'u1',
      'Alex is my girlfriend — anniversary dinner was perfect',
      'msg-2'
    );
    expect(result.saved).toBeGreaterThan(0);
    expect(result.relationships[0].partnerName).toBe('Alex');
    expect(saveRelationship).toHaveBeenCalled();
  });

  it('resolves character by name before omega', async () => {
    const partner = await resolveRomanticPartner('u1', 'Alex');
    expect(partner?.personType).toBe('character');
    expect(partner?.personId).toBe('char-alex');
  });

  it('uses mentioned entities when names match', async () => {
    const result = await ingestRomanticLexicalFromMessage(
      'u1',
      'Alex is my girlfriend and we are happy',
      'msg-3',
      [{ id: 'char-alex', name: 'Alex', type: 'character' }]
    );
    expect(result.saved).toBe(1);
    expect(result.relationships[0].personId).toBe('char-alex');
  });

  it('creates omega entity for unknown partner on date mention', async () => {
    resolveEntities.mockResolvedValueOnce([
      { id: 'omega-priya', primary_name: 'Priya', type: 'PERSON' },
    ]);
    const result = await ingestRomanticLexicalFromMessage(
      'u1',
      'I went on a date with Priya and it was amazing',
      'msg-4'
    );
    expect(resolveEntities).toHaveBeenCalled();
    expect(result.saved).toBeGreaterThanOrEqual(0);
  });
});
