import { describe, it, test, expect } from 'vitest';

import {
  consolidateNamedPlaces,
  extractNamedPlacesFromText,
  formatPossessivePlace,
  pickBestPlaceName,
  placeClusterKey,
} from './namedPlaceExtractor';

describe('namedPlaceExtractor', () => {
  it('extracts possessive home and Costco from user-style messages', () => {
    const text = [
      'Im at Abuelas house building Lorebook on June 3rd 2026.',
      'I went to costco with Abuela and it took 2 and a half hours',
      'hi sitting on the couch and testing to see if you can save my tío Juan to the Character Book.',
    ].join('\n');

    const places = extractNamedPlacesFromText(text);
    const names = places.map(p => p.name);

    expect(names.some(n => /Abuela'?s House/i.test(n))).toBe(true);
    expect(names.some(n => /Costco/i.test(n))).toBe(true);
    expect(places.filter(p => placeClusterKey(p.name).startsWith('possessive:abuela'))).toHaveLength(1);
  });

  it('prefers short canonical names over event nicknames', () => {
    const candidates = [
      "Abuela's Lorebook House",
      "The couch at Abuela's house",
      "Abuela's House",
    ];
    expect(pickBestPlaceName(candidates)).toBe("Abuela's House");
  });

  it('clusters duplicate house mentions', () => {
    const merged = consolidateNamedPlaces([
      {
        name: "Abuela's House",
        type: 'house',
        context: 'at abuelas house',
        anchor: placeClusterKey("Abuela's House", 'house'),
        isNamed: true,
        mentionCount: 1,
      },
      {
        name: "Abuela's Two-Basket House",
        type: 'house',
        context: 'filled up 2 baskets',
        anchor: placeClusterKey("Abuela's Two-Basket House", 'house'),
        isNamed: true,
        mentionCount: 1,
      },
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0].name).toBe("Abuela's House");
    expect(merged[0].mentionCount).toBe(2);
  });

  it('formats possessive names consistently', () => {
    expect(formatPossessivePlace('abuelas', 'house')).toBe("Abuela's House");
    expect(formatPossessivePlace('Abuela', 'home')).toBe("Abuela's House");
  });
});
