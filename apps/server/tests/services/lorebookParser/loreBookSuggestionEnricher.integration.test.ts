import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
  alternativesFromParseResult,
  enrichSuggestionsWithParserAlternatives,
} from '../../../src/services/lorebook/parser/loreBookSuggestionEnricher';
import type { LoreBookParseResult } from '../../../src/services/lorebook/parser/loreBookParserTypes';

const mockParse = vi.hoisted(() => vi.fn());
const mockCanon = vi.hoisted(() => vi.fn());
const mockCrossBook = vi.hoisted(() => vi.fn());

vi.mock('../../../src/services/lorebook/parser/loreBookParseEngine', () => ({
  parseLoreBookText: (...args: unknown[]) => mockParse(...args),
}));

vi.mock('../../../src/services/lorebook/parser/canonIndexBuilder', () => ({
  buildCanonIndexForUser: (...args: unknown[]) => mockCanon(...args),
}));

vi.mock('../../../src/services/suggestionCrossBookService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/services/suggestionCrossBookService')>();
  return {
    ...actual,
    buildCrossBookIndexForUser: (...args: unknown[]) => mockCrossBook(...args),
  };
});

describe('loreBookSuggestionEnricher — enrichSuggestionsWithParserAlternatives', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCanon.mockResolvedValue(undefined);
    mockCrossBook.mockResolvedValue(undefined);
  });

  it('merges parser redirects with legacy alternatives on suggestion items', async () => {
    mockParse.mockReturnValue({
      userId: 'user-1',
      text: 'Gothicumbia festival',
      lexicalSpans: [],
      operations: [],
      suppressed: [],
      redirects: [
        {
          kind: 'redirect',
          fromDomain: 'characters',
          toDomain: 'locations',
          name: 'Gothicumbia',
          reason: 'cross_book_guard',
          confidence: 0.92,
        },
      ],
      warnings: [],
    } satisfies LoreBookParseResult);

    const enriched = await enrichSuggestionsWithParserAlternatives(
      'user-1',
      'characters',
      [{ id: 's1', name: 'Gothicumbia', context: 'festival town' }],
      (s) => s.name,
      (s) => s.context
    );

    expect(enriched).toHaveLength(1);
    expect(enriched[0]?.alternative_categories.some((a) => a.domain === 'locations')).toBe(true);
    expect(enriched[0]?.parser_enriched).toBe(true);
    expect(mockParse).toHaveBeenCalledTimes(1);
  });

  it('parses each unique scan text once per request (performance cache)', async () => {
    mockParse.mockReturnValue({
      userId: 'user-1',
      text: 'React',
      lexicalSpans: [],
      operations: [],
      suppressed: [],
      redirects: [],
      warnings: [],
    } satisfies LoreBookParseResult);

    const items = [
      { id: 's1', name: 'React', context: 'learning react' },
      { id: 's2', name: 'React', context: 'learning react' },
      { id: 's3', name: 'Vue', context: 'side project' },
    ];

    const enriched = await enrichSuggestionsWithParserAlternatives(
      'user-1',
      'skills',
      items,
      (s) => s.name,
      (s) => s.context
    );

    expect(enriched).toHaveLength(3);
    expect(mockParse).toHaveBeenCalledTimes(2);
  });

  it('continues with legacy alternatives when parse fails', async () => {
    mockParse.mockImplementation(() => {
      throw new Error('parse timeout');
    });

    const enriched = await enrichSuggestionsWithParserAlternatives(
      'user-1',
      'skills',
      [{ id: 's1', name: 'React', context: 'learning react' }],
      (s) => s.name,
      (s) => s.context
    );

    expect(enriched).toHaveLength(1);
    expect(Array.isArray(enriched[0]?.alternative_categories)).toBe(true);
    expect(enriched[0]?.parser_enriched).toBe(false);
  });

  it('does not include current domain in alternatives', () => {
    const parseResult: LoreBookParseResult = {
      userId: 'user-1',
      text: 'Oscar Martinez',
      lexicalSpans: [],
      operations: [
        {
          kind: 'suggest_add',
          domain: 'characters',
          name: 'Oscar Martinez',
          evidence: { quote: 'Oscar Martinez' },
          confidence: 0.9,
          sourceSpans: [],
          gate: 'suggest',
        },
      ],
      suppressed: [],
      redirects: [],
      warnings: [],
    };

    const alts = alternativesFromParseResult('Oscar Martinez', 'characters', parseResult);
    expect(alts.every((a) => a.domain !== 'characters')).toBe(true);
  });

  it('dedupes alternatives keeping highest confidence per domain', () => {
    const parseResult: LoreBookParseResult = {
      userId: 'user-1',
      text: 'Gothicumbia',
      lexicalSpans: [],
      operations: [],
      suppressed: [],
      redirects: [
        {
          kind: 'redirect',
          fromDomain: 'characters',
          toDomain: 'locations',
          name: 'Gothicumbia',
          reason: 'a',
          confidence: 0.7,
        },
        {
          kind: 'redirect',
          fromDomain: 'characters',
          toDomain: 'locations',
          name: 'Gothicumbia',
          reason: 'b',
          confidence: 0.95,
        },
      ],
      warnings: [],
    };

    const alts = alternativesFromParseResult('Gothicumbia', 'characters', parseResult);
    expect(alts.filter((a) => a.domain === 'locations')).toHaveLength(1);
    expect(alts[0]?.confidence).toBe(0.95);
  });
});
