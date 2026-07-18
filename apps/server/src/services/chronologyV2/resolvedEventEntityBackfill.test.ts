import { describe, expect, it } from 'vitest';

import { matchEntityIdsInText, planEntityBackfill, type NamedEntityRef } from './resolvedEventEntityBackfill';

const quinn: NamedEntityRef = { id: 'char-quinn', names: ['Quinn Barrow', 'Quinn'] };
const nell: NamedEntityRef = { id: 'char-nell', names: ['Grandma Nell'] };
const pier: NamedEntityRef = { id: 'loc-pier', names: ['Saltwind Pier', 'the pier'] };

describe('matchEntityIdsInText', () => {
  it('matches canonical names case-insensitively at word boundaries', () => {
    expect(matchEntityIdsInText('Lunch with quinn barrow downtown', [quinn, nell])).toEqual([
      'char-quinn',
    ]);
  });

  it('matches aliases', () => {
    expect(matchEntityIdsInText('Walked along the pier at sunset', [pier])).toEqual(['loc-pier']);
  });

  it('does not match inside larger words', () => {
    const ref: NamedEntityRef = { id: 'char-ann', names: ['Ann'] };
    expect(matchEntityIdsInText('Planning the annual review', [ref])).toEqual([]);
  });

  it('ignores names shorter than three characters', () => {
    const ref: NamedEntityRef = { id: 'char-jo', names: ['Jo'] };
    expect(matchEntityIdsInText('Jo came by today', [ref])).toEqual([]);
  });

  it('handles names containing regex metacharacters', () => {
    const ref: NamedEntityRef = { id: 'loc-nells', names: ["Nell's Porch (back)"] };
    expect(matchEntityIdsInText("Coffee on Nell's Porch (back) this morning", [ref])).toEqual([
      'loc-nells',
    ]);
  });

  it('returns each id once even when several names hit', () => {
    expect(matchEntityIdsInText('Quinn and Quinn Barrow', [quinn])).toEqual(['char-quinn']);
  });
});

describe('planEntityBackfill', () => {
  it('is additive: already-present ids are not re-added', () => {
    const plan = planEntityBackfill(
      { title: 'Dinner with Quinn at Saltwind Pier', summary: '', people: ['char-quinn'], locations: [] },
      [quinn],
      [pier],
    );
    expect(plan).toEqual({ peopleToAdd: [], locationsToAdd: ['loc-pier'] });
  });

  it('returns null when nothing new matches', () => {
    expect(
      planEntityBackfill({ title: 'Quiet day', summary: 'Read a book', people: [], locations: [] }, [quinn], [pier]),
    ).toBeNull();
  });

  it('scans title and summary together', () => {
    const plan = planEntityBackfill(
      { title: 'Family visit', summary: 'Grandma Nell told stories all evening', people: [], locations: [] },
      [quinn, nell],
      [],
    );
    expect(plan).toEqual({ peopleToAdd: ['char-nell'], locationsToAdd: [] });
  });
});
