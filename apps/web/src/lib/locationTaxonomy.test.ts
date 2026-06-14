import { describe, expect, it } from 'vitest';
import { classifyLocation, looksLikeResidentialPlaceName } from './locationTaxonomy';

describe('locationTaxonomy — residential vs venue', () => {
  it('classifies Abuelas House as Home, not Venue', () => {
    expect(classifyLocation({ name: 'Abuelas House', type: 'place' })).toBe('residence');
    expect(classifyLocation({ name: "Abuela's House", type: null })).toBe('residence');
  });

  it('classifies Club Metro as Venue', () => {
    expect(classifyLocation({ name: 'Club Metro', type: 'nightclub' })).toBe('venue');
    expect(classifyLocation({ name: 'Club Metro', type: 'place' })).toBe('venue');
  });

  it('does not mark house-type names with show context as residence-only bypass', () => {
    expect(looksLikeResidentialPlaceName('House Show at Club Metro')).toBe(false);
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
