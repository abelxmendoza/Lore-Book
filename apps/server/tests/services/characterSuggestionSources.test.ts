import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFrom = vi.fn();

vi.mock('../../src/services/supabaseClient', () => ({
  supabaseAdmin: {
    from: (...args: unknown[]) => mockFrom(...args),
  },
}));

vi.mock('../../src/services/lorebook/quality/entityQualityGateService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/services/lorebook/quality/entityQualityGateService')>();
  return {
    ...actual,
    buildEntityQualityContext: vi.fn().mockResolvedValue({ userId: 'u1', crossBook: undefined }),
  };
});

vi.mock('../../src/services/lorebook/parser/loreBookSuggestionEnricher', () => ({
  enrichSuggestionsWithParserAlternatives: vi.fn((_userId, _domain, items) => Promise.resolve(items)),
}));

vi.mock('../../src/services/suggestionDismissalService', () => ({
  suggestionDismissalService: {
    filterNames: vi.fn((_userId, _domain, items) => Promise.resolve(items)),
  },
}));

import { characterSuggestionService } from '../../src/services/characterSuggestionService';

function chain(limitResult: { data: unknown[]; error: null }) {
  const chainObj: Record<string, unknown> = {};
  const methods = ['select', 'eq', 'in', 'gte', 'order', 'limit'];
  for (const method of methods) {
    chainObj[method] = vi.fn().mockReturnValue(chainObj);
  }
  chainObj.limit = vi.fn().mockResolvedValue(limitResult);
  return chainObj;
}

describe('characterSuggestionService source filtering', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not suggest omega entities already linked to the Character Book', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'characters') {
        return chain({
          data: [
            {
              id: 'char-tio',
              name: 'Tío Rafa',
              alias: ['Tio Rafa'],
              metadata: { omega_entity_id: 'omega-tio' },
              status: 'active',
            },
          ],
          error: null,
        });
      }
      if (table === 'omega_entities') {
        return chain({
          data: [
            {
              id: 'omega-tio',
              primary_name: 'Tio Rafa',
              mention_count: 4,
              mention_status: 'mentioned_only',
              metadata: {},
            },
          ],
          error: null,
        });
      }
      if (table === 'character_authority_map') {
        return chain({
          data: [{ source_id: 'omega-tio', source_table: 'omega_entities' }],
          error: null,
        });
      }
      return chain({ data: [], error: null });
    });

    const suggestions = await characterSuggestionService.getSuggestions('u1');
    expect(suggestions.some((s) => s.name === 'Tio Rafa')).toBe(false);
  });

  it('skips stale identity-index mentions that already match an active book entry', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'characters') {
        return chain({
          data: [{ id: 'char-tio', name: 'Tío Rafa', alias: [], metadata: {}, status: 'active' }],
          error: null,
        });
      }
      if (table === 'character_identity_index') {
        return chain({
          data: [{ mention: 'Tio Rafa', character_id: 'orphan-id' }],
          error: null,
        });
      }
      return chain({ data: [], error: null });
    });

    const suggestions = await characterSuggestionService.getSuggestions('u1');
    expect(suggestions.some((s) => s.name === 'Tio Rafa')).toBe(false);
  });
});
