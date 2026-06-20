import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/services/supabaseClient', () => ({
  supabaseAdmin: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: [], error: null }),
    })),
  },
}));

vi.mock('../../../src/services/lorebook/quality/entityQualityGateService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/services/lorebook/quality/entityQualityGateService')>();
  return {
    ...actual,
    buildEntityQualityContext: vi.fn().mockResolvedValue({ userId: 'u1', crossBook: undefined }),
  };
});

vi.mock('../../../src/services/lorebook/parser/loreBookSuggestionEnricher', () => ({
  enrichSuggestionsWithParserAlternatives: vi.fn((_userId, _domain, items) => Promise.resolve(items)),
}));

vi.mock('../../../src/services/suggestionDismissalService', () => ({
  suggestionDismissalService: {
    filterNames: vi.fn((_userId, _domain, items) => Promise.resolve(items)),
  },
}));

import { characterSuggestionService } from '../../../src/services/characterSuggestionService';
import { locationSuggestionService } from '../../../src/services/locationSuggestionService';
import { gateSuggestionCandidate } from '../../../src/services/lorebook/quality/entityQualityGateService';

describe('characterSuggestionService quality gate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('gateSuggestionCandidate rejects bare titles before they become cards', () => {
    expect(gateSuggestionCandidate('Professor', 'characters', 'Professor')).toBeNull();
    expect(gateSuggestionCandidate('Mr', 'characters', 'Mr')).toBeNull();
    expect(gateSuggestionCandidate('Mr. Morten', 'characters', 'Mr. Morten')?.name).toBe('Mr. Morten');
  });

  it('getSuggestions returns no junk character names from empty corpus', async () => {
    const suggestions = await characterSuggestionService.getSuggestions('u1');
    expect(suggestions.every((s) => !/^(mr|professor|and)$/i.test(s.name.trim()))).toBe(true);
  });
});

describe('locationSuggestionService quality gate', () => {
  it('gateSuggestionCandidate rejects bare place nouns', () => {
    expect(gateSuggestionCandidate('house', 'locations', 'house')).toBeNull();
    expect(gateSuggestionCandidate('school', 'locations', 'school')).toBeNull();
    expect(gateSuggestionCandidate("Tio Ralph's house", 'locations', "At Tio Ralph's house")).not.toBeNull();
  });

  it('getSuggestions returns no bare place category cards from empty corpus', async () => {
    const suggestions = await locationSuggestionService.getSuggestions('u1', { skipAi: true });
    expect(suggestions.every((s) => !/^(house|school|store|gym)$/i.test(s.name.trim()))).toBe(true);
  });
});
