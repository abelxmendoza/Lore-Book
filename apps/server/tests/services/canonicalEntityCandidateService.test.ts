import { describe, expect, it } from 'vitest';

import { mergeCanonicalEntityCandidates } from '../../src/services/conversationCentered/canonicalEntityCandidateService';

describe('canonical entity candidate precedence', () => {
  it('replaces a short speculative person with the canonical Character Book identity', () => {
    const merged = mergeCanonicalEntityCandidates(
      [{ name: 'Angel', type: 'PERSON' }],
      [{
        id: 'character-1', name: 'Ángel Negr0', type: 'character', confidence: 1,
        provenance: 'character_book',
      }],
    );

    expect(merged).toEqual([{ name: 'Ángel Negr0', type: 'PERSON', bornConfirmed: true }]);
  });

  it('rejects pronouns regardless of the extractor entity type', () => {
    const merged = mergeCanonicalEntityCandidates([
      { name: 'They', type: 'ORG' },
      { name: 'She', type: 'PERSON' },
      { name: 'Vanguard Robotics', type: 'ORG' },
    ], []);

    expect(merged).toEqual([{ name: 'Vanguard Robotics', type: 'ORG' }]);
  });
});
