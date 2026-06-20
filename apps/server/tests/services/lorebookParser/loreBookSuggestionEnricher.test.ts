import { describe, it, expect } from 'vitest';

import {
  alternativesFromParseResult,
} from '../../../src/services/lorebook/parser/loreBookSuggestionEnricher';
import type { LoreBookParseResult } from '../../../src/services/lorebook/parser/loreBookParserTypes';

describe('loreBookSuggestionEnricher', () => {
  it('extracts redirect alternatives from parse result', () => {
    const parseResult: LoreBookParseResult = {
      userId: 'user-1',
      text: 'We visited Gothicumbia last summer.',
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
          confidence: 0.9,
        },
      ],
      warnings: [],
    };

    const alts = alternativesFromParseResult('Gothicumbia', 'characters', parseResult);
    expect(alts).toHaveLength(1);
    expect(alts[0]?.domain).toBe('locations');
    expect(alts[0]?.label).toBe('Places');
  });

  it('merges suggest_add from another domain as alternative', () => {
    const parseResult: LoreBookParseResult = {
      userId: 'user-1',
      text: 'Started learning React hooks.',
      lexicalSpans: [],
      operations: [
        {
          kind: 'suggest_add',
          domain: 'skills',
          name: 'React Hooks',
          evidence: { quote: 'learning React hooks' },
          confidence: 0.8,
          sourceSpans: [],
          gate: 'suggest',
        },
      ],
      suppressed: [],
      redirects: [],
      warnings: [],
    };

    const alts = alternativesFromParseResult('React Hooks', 'projects', parseResult);
    expect(alts.some((a) => a.domain === 'skills')).toBe(true);
  });
});
