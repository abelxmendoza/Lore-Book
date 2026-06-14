import { describe, it, expect } from 'vitest';
import { inferPlaceTagsFromText, inferPlaceSignificanceFromText, getSubTypeFiltersForCategory } from './placeTypes';

describe('place tag inference', () => {
  it('infers scene tags from goth club context', () => {
    const tags = inferPlaceTagsFromText('Catch One is a goth club with live music and dancing late night');
    expect(tags).toContain('Goth Scene');
    expect(tags).toContain('Live Music');
    expect(tags).toContain('Dancing');
  });

  it('infers university tags', () => {
    const tags = inferPlaceTagsFromText('CSUF computer science research lab for alumni');
    expect(tags).toContain('Computer Science');
    expect(tags).toContain('Research');
    expect(tags).toContain('Alumni');
  });

  it('infers personal significance', () => {
    const sigs = inferPlaceSignificanceFromText('my favorite spot where we had our first date');
    expect(sigs).toContain('favorite_spot');
    expect(sigs).toContain('first_date_location');
  });
});

describe('getSubTypeFiltersForCategory', () => {
  it('returns counts for nightlife subtypes', () => {
    const filters = getSubTypeFiltersForCategory(
      [
        { type: 'nightclub', name: 'Catch One' },
        { type: 'goth_club', name: 'Dark Room' },
        { type: 'gym', name: 'Iron Temple' },
      ],
      'nightlife',
    );
    expect(filters.some(f => f.type === 'nightclub' && f.count === 1)).toBe(true);
    expect(filters.some(f => f.type === 'goth_club')).toBe(true);
    expect(filters.some(f => f.type === 'gym')).toBe(false);
  });
});
