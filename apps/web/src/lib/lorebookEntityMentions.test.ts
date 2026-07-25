import { describe, expect, it } from 'vitest';

import { findActiveLorebookMention, replaceLorebookMention } from './lorebookEntityMentions';

describe('LoreBook Generator @ mentions', () => {
  it('finds the text typed after an @ marker', () => {
    expect(findActiveLorebookMention('my story with @Mar')).toEqual({
      start: 14,
      end: 18,
      search: 'Mar',
    });
  });

  it('replaces the active search without changing the rest of the prompt', () => {
    const mention = findActiveLorebookMention('my story with @Mar')!;
    expect(replaceLorebookMention('my story with @Mar', mention, 'Marcus')).toEqual({
      value: 'my story with @Marcus',
      caret: 21,
    });
  });
});
