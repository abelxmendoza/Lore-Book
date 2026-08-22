import { describe, expect, it } from 'vitest';
import { isContextualTimingOnlyMention } from './contextualActorMention';

describe('isContextualTimingOnlyMention', () => {
  it('treats a performer named only in a timing phrase as contextual', () => {
    expect(
      isContextualTimingOnlyMention('Jordan Skasby', [
        'This was after the Jordan Skasby set. Maya pushed my arm away.',
      ]),
    ).toBe(true);
  });

  it('keeps a person who also participates in the focal interaction', () => {
    expect(
      isContextualTimingOnlyMention('Jordan Skasby', [
        'After the Jordan Skasby set I talked with Jordan Skasby about the lineup.',
      ]),
    ).toBe(false);
  });
});
