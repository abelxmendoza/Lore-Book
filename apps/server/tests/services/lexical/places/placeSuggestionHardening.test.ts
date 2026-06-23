import { describe, expect, it } from 'vitest';

import {
  evaluatePlaceMergeCompatibility,
  guardPlaceCandidate,
  processPlaceSuggestionsForOutput,
} from '../../../../src/services/lexical/places';

function visiblePlaces(text: string, knownPlaces?: string[]) {
  return processPlaceSuggestionsForOutput(text, {
    knownPlaces: knownPlaces ? new Set(knownPlaces) : undefined,
  });
}

describe('place suggestion hardening', () => {
  it('rejects the current bad suggestion fixtures from Places output', () => {
    const fixtures = [
      'march',
      'I was at home coding Lorebook all weekend',
      'some Venture Capital Firm is interested in my github repo and app',
      'I haven’t talked to Sol in a few weeks now',
      'she touched my belly from the pit',
      'her. she',
      'I forgot my phone in my moms car',
    ];

    for (const text of fixtures) {
      expect(visiblePlaces(text), text).toEqual([]);
    }
  });

  it('normalizes Abuela residence spans and links known residences', () => {
    const [place] = visiblePlaces("Im here at Abuela's house", ["Abuela's House"]);

    expect(place).toMatchObject({
      text: "Abuela's House",
      placeSubtype: 'private_residence',
      status: 'known',
      ownerDisplayName: 'Abuela',
      privacySensitive: true,
      requiresReview: true,
    });
  });

  it('trims sentence bleed from known venue spans', () => {
    const places = visiblePlaces(
      'There were a lot of people there that day at Bad Dogg Compound. It was a big show',
      ['Bad Dogg Compound'],
    );

    expect(places).toHaveLength(1);
    expect(places[0]).toMatchObject({
      text: 'Bad Dogg Compound',
      placeSubtype: 'event_space',
      status: 'known',
    });
    expect(places[0].displayName).not.toBe('Bad Dogg Compound. It');
  });

  it('trims person tails from unapostrophized family residence spans', () => {
    const [place] = visiblePlaces('I drove to my Moms House with my Abuela');

    expect(place).toMatchObject({
      text: "Mom's House",
      placeSubtype: 'private_residence',
      ownerDisplayName: 'Mom',
      privacySensitive: true,
      requiresReview: true,
    });
    expect(place.text).not.toContain('with');
  });

  it('keeps LA as city_or_region and does not merge it with private residences', () => {
    const places = visiblePlaces("It’s actually here in LA and Oscuri.dad is her boyfriend", [
      "Abuela's House",
    ]);

    expect(places).toHaveLength(1);
    expect(places[0]).toMatchObject({
      text: 'LA',
      placeSubtype: 'city_or_region',
      status: 'new',
    });
    expect(places[0].mergeCandidates ?? []).toEqual([]);
    expect(evaluatePlaceMergeCompatibility('city_or_region', 'private_residence')).toMatchObject({
      compatible: false,
    });
  });

  it('does not suggest afters sentence bleed and keeps RaveLa review-only', () => {
    const places = visiblePlaces('i met her at the afters. I was going to RaveLa');

    expect(places.map((p) => p.text)).not.toContain('afters. I');
    expect(places).toHaveLength(1);
    expect(places[0]).toMatchObject({
      text: 'RaveLa',
      requiresReview: true,
    });
  });

  it('classifies requested named place subtypes', () => {
    expect(visiblePlaces('I went to Whittier Christian Middle School')[0]).toMatchObject({
      text: 'Whittier Christian Middle School',
      placeSubtype: 'middle_school',
    });

    expect(visiblePlaces('I went to CSUF')[0]).toMatchObject({
      text: 'CSUF',
      placeSubtype: 'campus',
    });

    expect(visiblePlaces('We drove to Moreno Valley')[0]).toMatchObject({
      text: 'Moreno Valley',
      placeSubtype: 'city',
    });
  });

  it('records debug rejection reasons for representative non-places', () => {
    expect(guardPlaceCandidate("mom's car", 'I forgot my phone in my moms car')).toMatchObject({
      allowed: false,
      rejectedAs: 'OBJECT',
    });
    expect(guardPlaceCandidate('my github repo', 'interested in my github repo and app')).toMatchObject({
      allowed: false,
      rejectedAs: 'PROJECT_ASSET',
    });
    expect(guardPlaceCandidate('a few weeks now', 'in a few weeks now')).toMatchObject({
      allowed: false,
      rejectedAs: 'TIME_PERIOD',
    });
  });
});
