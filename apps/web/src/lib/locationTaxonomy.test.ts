import { describe, expect, it } from 'vitest';
import { classifyLocation, looksLikeResidentialPlaceName } from './locationTaxonomy';

describe('locationTaxonomy — residential vs venue', () => {
  it('classifies Grandma Roses House as Home, not Venue', () => {
    expect(classifyLocation({ name: 'Grandma Roses House', type: 'place' })).toBe('residence');
    expect(classifyLocation({ name: "Grandma Rose's House", type: null })).toBe('residence');
  });

  it('classifies Blue Room as Venue when type is nightclub', () => {
    expect(classifyLocation({ name: 'Blue Room', type: 'nightclub' })).toBe('venue');
  });

  it('classifies Blue Room with generic place type as other unless name hints venue', () => {
    expect(classifyLocation({ name: 'Blue Room', type: 'place' })).toBe('other');
  });

  it('does not mark house-type names with show context as residence-only bypass', () => {
    expect(looksLikeResidentialPlaceName('House Show at Blue Room')).toBe(false);
  });

  it('classifies canonical house type as residence even with generic stored type', () => {
    expect(classifyLocation({ name: 'Anaheim', type: 'house' })).toBe('residence');
  });

  it('defaults unknown commercial types to other, not venue', () => {
    expect(classifyLocation({ name: 'Random Spot', type: 'place' })).toBe('other');
  });

  it('maps cities correctly', () => {
    expect(classifyLocation({ name: 'Anaheim', type: 'city' })).toBe('city');
  });
});
