import { describe, expect, it } from 'vitest';

import { evaluateEntityPromotion } from './entityPromotionPolicy';
import { significantComposerCandidatesToMatches } from './significantComposerCandidates';

describe('entityPromotionPolicy', () => {
  it('keeps generic things out and promotes personal objects carefully', () => {
    expect(
      evaluateEntityPromotion({
        name: 'thing',
        domain: 'thing',
        mentionCount: 8,
        documentCount: 3,
        isGeneric: true,
      }).stage
    ).toBe('ignore');

    const result = evaluateEntityPromotion({
      name: 'old laptop',
      domain: 'thing',
      mentionCount: 2,
      documentCount: 1,
      hasPossessiveCue: true,
      hasConfirmedEntityConnection: true,
      confidence: 0.8,
    });

    expect(['growing', 'suggest']).toContain(result.stage);
    expect(result.reasons).toContain('owned or personal object cue');
  });
});

describe('significantComposerCandidatesToMatches', () => {
  it('surfaces pets, projects, and growing things from composer text', () => {
    const matches = significantComposerCandidatesToMatches(
      'My dog Milo watched me building Lorekeeper on my old laptop. The old laptop keeps freezing.',
      [],
      []
    );

    expect(matches).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'Milo', type: 'character', loreKind: 'pet' }),
        expect.objectContaining({ name: 'Lorekeeper', type: 'project', loreKind: 'project' }),
        expect.objectContaining({ name: 'Old Laptop', type: 'thing', loreKind: 'thing', composerChipKind: 'growing_entity' }),
      ])
    );
  });
});
