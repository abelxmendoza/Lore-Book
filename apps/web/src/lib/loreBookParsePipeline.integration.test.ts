/**
 * Web integration: LoreBook parse API response → composer entity chips.
 */
import { describe, it, expect } from 'vitest';

import { loreBookParseToComposerMatches } from './loreBookParseToComposerMatches';
import { sortCertifiedMatches } from './certifiedEntityMatch';
import type { LoreBookParseResponse } from '../api/loreBookParse';

describe('LoreBook parse composer pipeline (integration)', () => {
  it('combines index matches with lorebook redirect chips without duplicates', () => {
    const parse: LoreBookParseResponse = {
      operations: [
        {
          kind: 'suggest_add',
          domain: 'characters',
          name: 'Kelly Kapoor',
          confidence: 0.88,
          gate: 'suggest',
        },
      ],
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
      suppressed: [],
      warnings: [],
      lexicalSpanCount: 3,
    };

    const indexMatches = [
      {
        id: 'uuid-abel',
        name: 'Abel',
        type: 'character' as const,
        aliases: [],
        mentionKeys: ['abel'],
        status: 'confirmed' as const,
        matchedLabel: 'Abel',
        matchKind: 'full' as const,
      },
    ];

    const lorebookMatches = loreBookParseToComposerMatches(parse, [], indexMatches);
    const combined = [...indexMatches, ...lorebookMatches].sort(sortCertifiedMatches);

    expect(combined.some((m) => m.name === 'Abel')).toBe(true);
    expect(combined.some((m) => m.name === 'Kelly Kapoor')).toBe(true);
    // Redirect ops must never surface as "Add as …" composer chips.
    expect(combined.some((m) => m.actionLabel?.startsWith('Add as'))).toBe(false);
    expect(combined.filter((m) => m.name === 'Kelly Kapoor')).toHaveLength(1);
  });

  it('handles empty parse response gracefully', () => {
    const empty: LoreBookParseResponse = {
      operations: [],
      redirects: [],
      suppressed: [],
      warnings: ['empty_text'],
      lexicalSpanCount: 0,
    };
    expect(loreBookParseToComposerMatches(empty, [], [])).toEqual([]);
  });
});
