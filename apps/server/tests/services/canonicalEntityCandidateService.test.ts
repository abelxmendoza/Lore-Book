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

  it('repairs sentence bleed and rejects non-person collectives', () => {
    const merged = mergeCanonicalEntityCandidates([
      { name: 'Yuli. She', type: 'PERSON' },
      { name: 'Computer Science majors', type: 'PERSON' },
      { name: 'Goth Clubs', type: 'PERSON' },
    ], []);

    expect(merged).toEqual([{ name: 'Yuli', type: 'PERSON' }]);
  });

  it('resolves a discourse-prefixed first name to the canonical Character Book person', () => {
    const merged = mergeCanonicalEntityCandidates(
      [{ name: 'Yeah Johnny', type: 'PERSON' }],
      [{
        id: 'character-johnny', name: 'Johnny Esparza', type: 'character', confidence: 1,
        provenance: 'character_book',
      }],
    );
    expect(merged).toEqual([{ name: 'Johnny Esparza', type: 'PERSON', bornConfirmed: true }]);
  });

  it('uses the active Character Book focus as the canonical identity and rejects UI-word noise', () => {
    const focus = {
      id: 'character-marcus',
      name: 'Marcus Vale',
      type: 'character' as const,
      aliases: ['M. Vale'],
    };
    const merged = mergeCanonicalEntityCandidates(
      [
        { name: 'M. Vale', type: 'PERSON' },
        { name: 'Help', type: 'PERSON' },
        { name: 'His', type: 'PERSON' },
        { name: "That's", type: 'PERSON' },
      ],
      [{
        id: focus.id,
        name: focus.name,
        type: focus.type,
        confidence: 1,
        provenance: 'character_book',
      }],
      { authoritativeFocus: focus },
    );

    expect(merged).toEqual([{ name: 'Marcus Vale', type: 'PERSON', bornConfirmed: true }]);
  });
});
