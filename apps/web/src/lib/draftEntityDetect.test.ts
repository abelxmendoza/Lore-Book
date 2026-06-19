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

  it('does not treat sentence-leading verbs as part of a name', () => {
    const drafts = detectDraftEntitiesInText('Tell Abel about work', INDEX, []);
    expect(drafts.map((d) => d.name)).toEqual([]);
  });
});
