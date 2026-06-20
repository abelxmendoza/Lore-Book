import { describe, it, expect } from 'vitest';

import { loreBookParseToComposerMatches } from './loreBookParseToComposerMatches';
import type { LoreBookParseResponse } from '../api/loreBookParse';
import type { CertifiedEntity } from '../types/certifiedEntity';

const INDEX: CertifiedEntity[] = [
  {
    id: 'uuid-oscar',
    name: 'Oscar Martinez',
    type: 'character',
    aliases: [],
    mentionKeys: ['oscar martinez'],
    status: 'confirmed',
  },
];

describe('loreBookParseToComposerMatches', () => {
  it('maps suggest_add to draft character chips', () => {
    const parse: LoreBookParseResponse = {
      operations: [
        {
          kind: 'suggest_add',
          domain: 'characters',
          name: 'Oscar Martinez',
          confidence: 0.9,
          gate: 'suggest',
        },
      ],
      redirects: [],
      suppressed: [],
      warnings: [],
      lexicalSpanCount: 1,
    };

    const matches = loreBookParseToComposerMatches(parse, [], []);
    expect(matches).toHaveLength(1);
    expect(matches[0]?.name).toBe('Oscar Martinez');
    expect(matches[0]?.type).toBe('character');
    expect(matches[0]?.status).toBe('draft');
  });

  it('maps redirect ops to clarification chips with target label', () => {
    const parse: LoreBookParseResponse = {
      operations: [],
      redirects: [
        {
          kind: 'redirect',
          fromDomain: 'characters',
          toDomain: 'locations',
          name: 'Gothicumbia',
          reason: 'cross_book_guard',
          confidence: 0.85,
        },
      ],
      suppressed: [],
      warnings: [],
      lexicalSpanCount: 1,
    };

    const matches = loreBookParseToComposerMatches(parse, [], []);
    expect(matches).toHaveLength(1);
    expect(matches[0]?.actionLabel).toBe('Add as Places');
    expect(matches[0]?.composerChipKind).toBe('needs_clarification');
  });

  it('skips blocked suggest_add operations', () => {
    const parse: LoreBookParseResponse = {
      operations: [
        {
          kind: 'suggest_add',
          domain: 'characters',
          name: 'Find My Friends',
          confidence: 0.5,
          gate: 'block',
        },
      ],
      redirects: [],
      suppressed: [],
      warnings: [],
      lexicalSpanCount: 0,
    };
    expect(loreBookParseToComposerMatches(parse, [], [])).toHaveLength(0);
  });

  it('maps review-gate suggest_add to suggestion status with action label', () => {
    const parse: LoreBookParseResponse = {
      operations: [
        {
          kind: 'suggest_add',
          domain: 'family',
          name: 'Grandma Rose',
          confidence: 0.7,
          gate: 'review',
        },
      ],
      redirects: [],
      suppressed: [],
      warnings: [],
      lexicalSpanCount: 1,
    };
    const matches = loreBookParseToComposerMatches(parse, [], []);
    expect(matches).toHaveLength(0);
  });

  it('maps suggest_merge to merge clarification chip', () => {
    const parse: LoreBookParseResponse = {
      operations: [
        {
          kind: 'suggest_merge',
          domain: 'projects',
          name: 'Lorebook App',
          targetName: 'LoreBook App',
          reason: 'duplicate',
          confidence: 0.88,
        },
      ],
      redirects: [],
      suppressed: [],
      warnings: [],
      lexicalSpanCount: 1,
    };
    const matches = loreBookParseToComposerMatches(parse, [], []);
    expect(matches).toHaveLength(1);
    expect(matches[0]?.actionLabel).toBe('Merge with LoreBook App');
    expect(matches[0]?.composerChipKind).toBe('needs_clarification');
  });

  it('does not duplicate chips already covered by certified index', () => {
    const parse: LoreBookParseResponse = {
      operations: [
        {
          kind: 'suggest_add',
          domain: 'characters',
          name: 'Oscar Martinez',
          confidence: 0.9,
          gate: 'suggest',
        },
      ],
      redirects: [],
      suppressed: [],
      warnings: [],
      lexicalSpanCount: 1,
    };
    const existing = [
      {
        id: 'uuid-oscar',
        name: 'Oscar Martinez',
        type: 'character' as const,
        aliases: [],
        mentionKeys: ['oscar martinez'],
        status: 'confirmed' as const,
        matchedLabel: 'Oscar Martinez',
        matchKind: 'full' as const,
      },
    ];
    expect(loreBookParseToComposerMatches(parse, INDEX, existing)).toHaveLength(0);
  });

  it('maps skill suggest_add to skill draft chips', () => {
    const parse: LoreBookParseResponse = {
      operations: [
        {
          kind: 'suggest_add',
          domain: 'skills',
          name: 'ROS2',
          confidence: 0.85,
          gate: 'suggest',
        },
      ],
      redirects: [],
      suppressed: [],
      warnings: [],
      lexicalSpanCount: 1,
    };
    const matches = loreBookParseToComposerMatches(parse, [], []);
    expect(matches[0]?.type).toBe('skill');
    expect(matches[0]?.id).toContain('draft:lorebook:skill');
  });

  it('ignores suppress operations in parse payload', () => {
    const parse: LoreBookParseResponse = {
      operations: [],
      redirects: [],
      suppressed: [{ kind: 'suppress', name: 'Instagram', reason: 'consumer_app' }],
      warnings: ['consumer_blocked'],
      lexicalSpanCount: 0,
    };
    expect(loreBookParseToComposerMatches(parse, [], [])).toHaveLength(0);
  });
});
