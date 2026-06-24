import { describe, expect, it } from 'vitest';

import {
  processPlaceSuggestions,
  processPlaceSuggestionsForOutput,
} from '../../../../src/services/lexical/places';

function allSuggestions(text: string, knownPlaces?: string[]) {
  return processPlaceSuggestions(text, {
    knownPlaces: knownPlaces ? new Set(knownPlaces) : undefined,
  });
}

function visibleSuggestions(text: string, knownPlaces?: string[]) {
  return processPlaceSuggestionsForOutput(text, {
    knownPlaces: knownPlaces ? new Set(knownPlaces) : undefined,
  });
}

function findByText(text: string, name: string) {
  return allSuggestions(text).find((s) => s.text.toLowerCase() === name.toLowerCase());
}

describe('place wrong-domain guard v2', () => {
  it('routes Amazon work and Ring product spans away from Places', () => {
    const text = 'I am currently onboarding to work at Amazon on their Ring doorbell product.';

    expect(visibleSuggestions(text)).toEqual([]);
    expect(findByText(text, 'Amazon')).toMatchObject({ status: 'rejected', rejectedAs: 'ORGANIZATION' });
    expect(findByText(text, 'Ring doorbell product')).toMatchObject({
      status: 'rejected',
      rejectedAs: 'PRODUCT_OBJECT',
    });
  });

  it('rejects event and activity category spans', () => {
    const text = 'I like martial arts, ska, raving, and going to shows.';

    expect(visibleSuggestions(text)).toEqual([]);
    expect(findByText(text, 'shows')).toMatchObject({ status: 'rejected', rejectedAs: 'EVENT_ACTIVITY' });
  });

  it('keeps home as attached context and LoreBook as project context', () => {
    const text = 'I was at home coding Lorebook all weekend.';

    expect(visibleSuggestions(text)).toEqual([]);
    expect(findByText(text, 'home')).toMatchObject({
      status: 'attached_context',
      placeSubtype: 'relative_location_context',
    });
    expect(findByText(text, 'Lorebook')).toMatchObject({ status: 'rejected', rejectedAs: 'PROJECT_TASK' });
  });

  it('rejects show-in-pit spans and keeps pit as venue subarea context only', () => {
    const text = 'I saw her in the ska scene media at another show in the pit.';

    expect(visibleSuggestions(text)).toEqual([]);
    expect(findByText(text, 'another show in the pit')).toMatchObject({
      status: 'rejected',
      rejectedAs: 'EVENT_ACTIVITY',
    });
    expect(findByText(text, 'pit')).toMatchObject({
      status: 'attached_context',
      placeSubtype: 'venue_subarea_context',
    });
  });

  it('normalizes Moms House and trims Abuela person tail', () => {
    const text = 'I drove to my Moms House with my Abuela.';
    const places = visibleSuggestions(text);

    expect(places).toHaveLength(1);
    expect(places[0]).toMatchObject({
      text: "Mom's House",
      placeSubtype: 'private_residence',
      ownerDisplayName: 'Mom',
    });
    expect(places[0].text).not.toContain('Abuela');
  });

  it('rejects vehicle and object possessive spans', () => {
    const text = 'I forgot my phone in my moms car.';

    expect(visibleSuggestions(text)).toEqual([]);
    expect(findByText(text, 'my moms car')).toMatchObject({ status: 'rejected', rejectedAs: 'PRODUCT_OBJECT' });
  });

  it('splits LA from a person alias and does not create a combined span', () => {
    const text = "It's actually here in LA and Oscuri.dad is her boyfriend.";
    const places = visibleSuggestions(text);

    expect(places.map((p) => p.text)).toEqual(['LA']);
    expect(places[0]).toMatchObject({ placeSubtype: 'city_or_region' });
    expect(allSuggestions(text).some((s) => /LA and Oscuri\.dad/i.test(s.text))).toBe(false);
  });

  it('keeps DTLA, Club Nova, and Downey as separate places', () => {
    const text = 'I met them later in DTLA. Club Nova was in Downey that night.';
    const places = visibleSuggestions(text);

    expect(places).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ text: 'DTLA', placeSubtype: 'district' }),
        expect.objectContaining({ text: 'Club Nova', placeSubtype: 'nightclub' }),
        expect.objectContaining({ text: 'Downey', placeSubtype: 'city' }),
      ]),
    );
    expect(places.some((p) => p.text === 'DTLA. Club Nova')).toBe(false);
    expect(places.find((p) => p.text === 'Club Nova')?.mergeCandidates ?? []).toEqual([]);
  });

  it('rejects code/task phrases as place suggestions', () => {
    const text =
      'yes remember that. Also you barely responded about Ashley so we should change that in the code later so we can expand responses.';

    expect(visibleSuggestions(text)).toEqual([]);
    expect(findByText(text, 'code later')).toMatchObject({ status: 'rejected', rejectedAs: 'PROJECT_TASK' });
  });

  it('rejects wristband object spans', () => {
    const text = "I didn't have the special red in and out wristband.";

    expect(visibleSuggestions(text)).toEqual([]);
    expect(findByText(text, 'in and out wristband')).toMatchObject({
      status: 'rejected',
      rejectedAs: 'PRODUCT_OBJECT',
    });
  });

  it('rejects media/publicity concept spans', () => {
    const text = "I didn't want to end up in the media so this girl would see me.";

    expect(visibleSuggestions(text)).toEqual([]);
    expect(findByText(text, 'media')).toMatchObject({ status: 'rejected', rejectedAs: 'MEDIA_CONCEPT' });
  });

  it('trims sentence bleed from Bad Dogg Compound and links existing places', () => {
    const text = 'Bad Dogg Compound. It was a big show.';
    const places = visibleSuggestions(text, ['Bad Dogg Compound']);

    expect(places).toHaveLength(1);
    expect(places[0]).toMatchObject({
      text: 'Bad Dogg Compound',
      placeSubtype: 'event_space',
      status: 'known',
    });
    expect(places[0].text).not.toBe('Bad Dogg Compound. It');
  });
});
