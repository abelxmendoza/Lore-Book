import { describe, expect, it } from 'vitest';

import {
  extractChainVenueMentions,
  formatChainVenueTitle,
  parseChainVenueTitle,
  sameChainDifferentSite,
} from './chainVenueDisambiguator';

describe('chainVenueDisambiguator', () => {
  it('titles a chain gym from an intersection', () => {
    const mentions = extractChainVenueMentions(
      'there is the Vanguard gym on Harbor and Main',
    );
    expect(mentions.map((m) => m.displayName)).toEqual(['Vanguard Gym — Harbor & Main']);
  });

  it('keeps four EOS gyms distinct from one chat message', () => {
    const text = [
      'theres the EOS gym on Katella and Euclid',
      'the other is off state college and not sure the other street',
      'then theres one thats also on State College too but its off of I believe its Chapman',
      'the other one is also in Fullerton and is next to Barnes and nobles.',
    ].join('\n');

    expect(extractChainVenueMentions(text).map((m) => m.displayName)).toEqual([
      'EOS Gym — Katella & Euclid',
      'EOS Gym — State College',
      'EOS Gym — State College & Chapman',
      'EOS Gym — Fullerton (Barnes & Noble)',
    ]);
  });

  it('does not alias-merge the same chain at different sites', () => {
    expect(
      sameChainDifferentSite('EOS Gym — Katella & Euclid', 'EOS Gym — State College & Chapman'),
    ).toBe(true);
    expect(sameChainDifferentSite('EOS Fitness gym 1', 'EOS Fitness gym 2')).toBe(true);
    expect(sameChainDifferentSite('EOS Gym — Katella & Euclid', 'EOS Gym — Katella & Euclid')).toBe(
      false,
    );
  });

  it('parses em-dash titles and numeric uniqueness suffixes', () => {
    expect(parseChainVenueTitle('EOS Gym — Harbor & Main')).toMatchObject({
      brand: 'eos gym',
      qualifier: 'harbor & main',
      numberedSuffix: null,
    });
    expect(parseChainVenueTitle('EOS Fitness gym 3')).toMatchObject({
      brand: 'eos fitness',
      numberedSuffix: 3,
    });
    expect(formatChainVenueTitle('vanguard fitness gym', 'maple')).toBe('Vanguard Fitness — Maple');
  });
});
