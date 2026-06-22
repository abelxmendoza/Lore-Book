import { describe, it, expect } from 'vitest';
import {
  resolveEntityContextFromComposer,
  resolveFocusedCharacter,
} from '../../../src/services/characters/characterChatTargetResolver';

describe('characterChatTargetResolver', () => {
  it('prefers explicit CHARACTER entity context', () => {
    expect(
      resolveFocusedCharacter({ type: 'CHARACTER', id: 'c1' }, undefined, [
        { id: 'c2', name: 'Other', type: 'character' },
      ]),
    ).toEqual({ characterId: 'c1', source: 'entity_context' });
  });

  it('uses lone composer character chip', () => {
    expect(
      resolveFocusedCharacter(undefined, undefined, [{ id: 'c9', name: 'Maya', type: 'character' }]),
    ).toEqual({ characterId: 'c9', characterName: 'Maya', source: 'composer' });
  });

  it('promotes composer character to entity context when missing', () => {
    expect(
      resolveEntityContextFromComposer(undefined, [{ id: 'c9', name: 'Maya', type: 'character' }]),
    ).toEqual({ type: 'CHARACTER', id: 'c9' });
  });
});
