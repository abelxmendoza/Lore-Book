import { describe, it, expect } from 'vitest';
import type { CertifiedEntityMatch } from './certifiedEntityMatch';
import { findEntityHighlightRanges, mergeNonOverlappingRanges } from './entityHighlightRanges';

const abel: CertifiedEntityMatch = {
  id: 'uuid-abel',
  name: 'Abel',
  type: 'character',
  aliases: [],
  mentionKeys: ['abel'],
  status: 'confirmed',
  matchedLabel: 'Abel',
  matchKind: 'full',
};

const kellyPrefix: CertifiedEntityMatch = {
  id: 'sug:character:kelly',
  name: 'Kelly',
  type: 'character',
  aliases: [],
  mentionKeys: ['kelly'],
  status: 'suggestion',
  matchedLabel: 'Kelly',
  matchKind: 'prefix',
};

describe('findEntityHighlightRanges', () => {
  it('highlights confirmed full-name mentions', () => {
    const ranges = findEntityHighlightRanges('Tell Abel about work', [abel]);
    expect(ranges).toHaveLength(1);
    expect(ranges[0].start).toBe(5);
    expect(ranges[0].end).toBe(9);
    expect(ranges[0].match.name).toBe('Abel');
  });

  it('highlights prefix autocomplete on the last token', () => {
    const ranges = findEntityHighlightRanges('I saw Kel', [kellyPrefix]);
    expect(ranges).toHaveLength(1);
    expect(ranges[0].start).toBe(6);
    expect(ranges[0].end).toBe(9);
  });

  it('merges overlapping spans', () => {
    const merged = mergeNonOverlappingRanges([
      { start: 0, end: 4, match: abel },
      { start: 2, end: 6, match: kellyPrefix },
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0].start).toBe(0);
  });

  it('prefers confirmed entities over overlapping draft spans', () => {
    const draftTellAbel: CertifiedEntityMatch = {
      id: 'draft:character:tell abel',
      name: 'Tell Abel',
      type: 'character',
      aliases: [],
      mentionKeys: ['tell abel'],
      status: 'draft',
      matchedLabel: 'Tell Abel',
      matchKind: 'full',
    };
    const ranges = findEntityHighlightRanges('Tell Abel and Kel', [draftTellAbel, abel, kellyPrefix]);
    expect(ranges.some((r) => r.match.id === 'uuid-abel')).toBe(true);
    expect(ranges.some((r) => r.match.id === 'draft:character:tell abel')).toBe(false);
  });
});
