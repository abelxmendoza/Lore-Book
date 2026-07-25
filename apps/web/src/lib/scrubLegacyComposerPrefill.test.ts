import { describe, it, expect } from 'vitest';
import {
  isLegacyCharacterChatPrefill,
  scrubLegacyComposerPrefill,
} from './scrubLegacyComposerPrefill';

const LEGACY = `What teams, companies, or groups is Jerry part of? 

If anything in their profile is wrong, say it plainly (e.g. "actually her name is Maya" or "they are my coworker, not my friend").`;

describe('scrubLegacyComposerPrefill', () => {
  it('detects the retired Jerry/Maya groups prefill', () => {
    expect(isLegacyCharacterChatPrefill(LEGACY)).toBe(true);
  });

  it('clears the whole retired prefill to an empty composer', () => {
    expect(scrubLegacyComposerPrefill(LEGACY)).toBe('');
  });

  it('keeps real user typing that is not the legacy boilerplate', () => {
    const real = 'Jerry is in Tia Grace Household as a friend.';
    expect(isLegacyCharacterChatPrefill(real)).toBe(false);
    expect(scrubLegacyComposerPrefill(real)).toBe(real);
  });
});
