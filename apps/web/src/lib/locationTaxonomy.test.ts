import { describe, expect, it } from 'vitest';
import {
  classifyLocation,
  computeChildren,
  computeDirectPlaceChildren,
  isTopLevelPlace,
  looksLikeResidentialPlaceName,
} from './locationTaxonomy';
import type { LocationProfile } from '../components/locations/LocationProfileCard';

function loc(partial: Partial<LocationProfile> & Pick<LocationProfile, 'id' | 'name'>): LocationProfile {
  return {
    visitCount: 0,
    relatedPeople: [],
    tagCounts: [],
    chapters: [],
    moods: [],
    entries: [],
    sources: [],
    ...partial,
  };
}

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

describe('locationTaxonomy — nesting', () => {
  it('hides parent_location_id children from top-level book cards', () => {
    const parent = loc({ id: 'p1', name: 'San Diego' });
    const child = loc({ id: 'c1', name: 'Gaslamp', parent_location_id: 'p1' });
    expect(isTopLevelPlace(parent)).toBe(true);
    expect(isTopLevelPlace(child)).toBe(false);
  });

  it('computeDirectPlaceChildren finds explicit parent links', () => {
    const parent = loc({ id: 'p1', name: 'San Diego' });
    const child = loc({ id: 'c1', name: 'Gaslamp', parent_location_id: 'p1', visitCount: 3 });
    const all = [parent, child];
    expect(computeDirectPlaceChildren(parent, all).map((l) => l.id)).toEqual(['c1']);
  });

  it('computeChildren merges geographic and parent_location_id nesting', () => {
    const parent = loc({ id: 'p1', name: 'California', type: 'state' });
    const byParent = loc({ id: 'c1', name: 'Anaheim', parent_location_id: 'p1', visitCount: 2 });
    const byGeo = loc({ id: 'c2', name: 'San Diego', region: 'California', visitCount: 5 });
    const all = [parent, byParent, byGeo];
    expect(computeChildren(parent, all).map((l) => l.id)).toEqual(['c2', 'c1']);
  });
});
