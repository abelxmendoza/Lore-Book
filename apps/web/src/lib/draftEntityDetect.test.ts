import { describe, it, expect } from 'vitest';
import { detectDraftEntitiesInText } from './draftEntityDetect';
import type { CertifiedEntity } from '../types/certifiedEntity';

const INDEX: CertifiedEntity[] = [
  {
    id: 'uuid-abel',
    name: 'Abel',
    type: 'character',
    aliases: [],
    mentionKeys: ['abel'],
    status: 'confirmed',
  },
];

describe('detectDraftEntitiesInText', () => {
  it('detects new character names not in the index', () => {
    const drafts = detectDraftEntitiesInText('I met Marcus at the park', INDEX, []);
    expect(drafts.some((d) => d.name === 'Marcus' && d.type === 'character')).toBe(true);
    expect(drafts.every((d) => d.status === 'draft')).toBe(true);
  });

  it('does not duplicate names already in the index or existing matches', () => {
    const drafts = detectDraftEntitiesInText('Abel and Marcus', INDEX, []);
    expect(drafts.map((d) => d.name)).toEqual(['Marcus']);
  });

  it('detects location mentions from prepositions', () => {
    const drafts = detectDraftEntitiesInText('We went to Riverside Park today', INDEX, []);
    expect(drafts.some((d) => d.type === 'location')).toBe(true);
  });

  it('ignores common words and junk tokens', () => {
    const drafts = detectDraftEntitiesInText('Tell me about the thing', INDEX, []);
    expect(drafts).toHaveLength(0);
  });

  it('parses friendship + Anaheim + unresolved school without creating School entity', () => {
    const text =
      'Abel Mendoza is my friend we grew up together in Anaheim and he went to the same school as me';
    const drafts = detectDraftEntitiesInText(text, INDEX, []);
    expect(drafts.some((d) => d.name === 'Abel Mendoza' && d.type === 'character')).toBe(true);
    expect(drafts.some((d) => d.name === 'Anaheim' && d.type === 'location')).toBe(true);
    expect(drafts.some((d) => d.name === 'School' && d.type === 'location')).toBe(false);
    expect(drafts.some((d) => d.composerChipKind === 'needs_clarification')).toBe(true);
    expect(drafts.some((d) => d.composerChipKind === 'relationship')).toBe(true);
    expect(drafts.some((d) => d.composerChipKind === 'shared_history')).toBe(true);
  });

  it('does not treat sentence-leading verbs as part of a name', () => {
    const drafts = detectDraftEntitiesInText('Tell Abel about work', INDEX, []);
    expect(drafts.map((d) => d.name)).toEqual([]);
  });

  it('does not split a typed full name into a separate surname chip', () => {
    const drafts = detectDraftEntitiesInText('Abel Mendoza', INDEX, []);
    expect(drafts.map((d) => d.name)).toEqual(['Abel Mendoza']);
    expect(drafts.some((d) => d.name === 'Mendoza')).toBe(false);
  });

  it('still detects a lone surname when not part of a multi-word name', () => {
    const drafts = detectDraftEntitiesInText('I met Mendoza yesterday', INDEX, []);
    expect(drafts.some((d) => d.name === 'Mendoza')).toBe(true);
  });
});
