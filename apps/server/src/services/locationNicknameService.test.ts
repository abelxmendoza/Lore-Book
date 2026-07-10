import { describe, expect, it } from 'vitest';

import { isFigurativeHouseReference, validatePossessiveNickname } from './locationNicknameService';

describe('validatePossessiveNickname', () => {
  const axMessage =
    'I went to the club last night after Anime Expo there was an afters at Catch One. ' +
    'The house was full of popular egirls with clout. ' +
    'That situation with Genni taught me to respect boundaries no matter what. ' +
    "I even got to stop by and eat food at my tia's for a bit yesterday.";

  it('rejects possessive labels the source text never states', () => {
    // Genni is mentioned in the message, but nothing says the house is hers.
    expect(validatePossessiveNickname("Genni's House", axMessage)).toBeNull();
    expect(validatePossessiveNickname("The Genni's House", axMessage)).toBeNull();
  });

  it("keeps possessives the text actually uses ('my tia's')", () => {
    expect(validatePossessiveNickname("Tia's Place", axMessage)).toBe("Tia's Place");
  });

  it('handles curly apostrophes in either the label or the source', () => {
    expect(validatePossessiveNickname('Tia’s Place', axMessage)).toBe('Tia’s Place');
    expect(validatePossessiveNickname("Genni's Spot", 'we hung out at Genni’s spot')).toBe("Genni's Spot");
  });

  it('passes non-possessive labels through untouched', () => {
    expect(validatePossessiveNickname('The Afters House', axMessage)).toBe('The Afters House');
    expect(validatePossessiveNickname('Neighborhood Bar', 'no possessives here')).toBe('Neighborhood Bar');
  });
});

describe('isFigurativeHouseReference', () => {
  it('treats crowd/energy "house" talk as figurative, not a residence', () => {
    // "the house" here meant the venue (LA Convention Center afters), and
    // produced a bogus "Egirl House" suggestion.
    expect(
      isFigurativeHouseReference('the house was full of popular egirls with clout', 'house'),
    ).toBe(true);
    expect(isFigurativeHouseReference('the band brought the house down', 'house')).toBe(true);
    expect(isFigurativeHouseReference('DJ Mr. Chino in the house tonight', 'house')).toBe(true);
  });

  it('keeps literal house mentions', () => {
    expect(isFigurativeHouseReference('we hung out at her house after school', 'house')).toBe(false);
    expect(isFigurativeHouseReference("eat food at my tia's for a bit", 'house')).toBe(false);
  });

  it('only applies to house-typed detections', () => {
    expect(isFigurativeHouseReference('the house was packed', 'restaurant')).toBe(false);
  });
});
