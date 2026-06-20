import { describe, it, expect } from 'vitest';
import { collapseOverlappingPersonComposerMatches } from './personComposerMatchCollapse';
import type { CertifiedEntityMatch } from './certifiedEntityMatch';

function character(id: string, name: string, extra: Partial<CertifiedEntityMatch> = {}): CertifiedEntityMatch {
  return {
    id,
    name,
    type: 'character',
    aliases: [],
    mentionKeys: [name.toLowerCase()],
    status: 'confirmed',
    matchedLabel: name,
    matchKind: 'full',
    ...extra,
  };
}

describe('collapseOverlappingPersonComposerMatches', () => {
  it('drops surname-only chip when full name is in the same text', () => {
    const full = character('abel', 'Abel Mendoza');
    const surname = character('draft:mendoza', 'Mendoza', { status: 'draft', id: 'draft:character:mendoza' });
    const result = collapseOverlappingPersonComposerMatches('Abel Mendoza', [full, surname]);
    expect(result.map((m) => m.name)).toEqual(['Abel Mendoza']);
  });

  it('keeps surname-only chip when typed alone', () => {
    const surname = character('draft:mendoza', 'Mendoza', { status: 'draft', id: 'draft:character:mendoza' });
    const result = collapseOverlappingPersonComposerMatches('Mendoza called', [surname]);
    expect(result.map((m) => m.name)).toEqual(['Mendoza']);
  });

  it('keeps honorific display title when longer than matched label', () => {
    const full = character('tio', 'Tio Ralph', {
      name: 'Tio Ralph',
      matchedLabel: 'Ralph',
    });
    const partial = character('draft:ralph', 'Ralph', { status: 'draft', id: 'draft:character:ralph' });
    const result = collapseOverlappingPersonComposerMatches('I saw Tio Ralph today', [full, partial]);
    expect(result.map((m) => m.name)).toEqual(['Tio Ralph']);
  });
});
