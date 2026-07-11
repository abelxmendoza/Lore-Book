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
      'Im at Grandma Roses house building LifeLedger on June 3rd 2026.',
      'I went to costco with Grandma Rose and it took 2 and a half hours',
      'hi sitting on the couch and testing to see if you can save my tío Rafa to the Character Book.',
    ].join('\n');

    const places = extractNamedPlacesFromText(text);
    const names = places.map(p => p.name);

    expect(names.some(n => /Grandma Rose'?s House/i.test(n))).toBe(true);
    expect(names.some(n => /Costco/i.test(n))).toBe(true);
    expect(places.some(p => placeClusterKey(p.name).startsWith('possessive:'))).toBe(true);
  });

  it('prefers short canonical names over event nicknames', () => {
    const candidates = [
      "Grandma Rose's LifeLedger House",
      "The couch at Grandma Rose's house",
      "Grandma Rose's House",
    ];
    expect(pickBestPlaceName(candidates)).toBe("Grandma Rose's House");
  });

  it('clusters duplicate house mentions', () => {
    const merged = consolidateNamedPlaces([
      {
        name: "Grandma Rose's House",
        type: 'house',
        context: 'at abuelas house',
        anchor: placeClusterKey("Grandma Rose's House", 'house'),
        isNamed: true,
        mentionCount: 1,
      },
      {
        name: "Grandma Rose's Two-Basket House",
        type: 'house',
        context: 'filled up 2 baskets',
        anchor: placeClusterKey("Grandma Rose's Two-Basket House", 'house'),
        isNamed: true,
        mentionCount: 1,
      },
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0].name).toBe("Grandma Rose's House");
    expect(merged[0].mentionCount).toBe(2);
  });

  it('formats possessive names consistently', () => {
    expect(formatPossessivePlace('abuelas', 'house')).toBe("Abuela's House");
    expect(formatPossessivePlace('Grandma Rose', 'home')).toMatch(/Grandma Rose's House/i);
  });
});
