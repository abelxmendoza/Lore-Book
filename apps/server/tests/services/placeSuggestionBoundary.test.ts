import { describe, it, expect } from 'vitest';

import {
  processPlaceSuggestions,
  processPlaceSuggestionsForOutput,
} from '../../src/services/lexical/places/placeSuggestionService';

function acceptedNames(text: string, knownPlaces?: Set<string>): string[] {
  return processPlaceSuggestionsForOutput(text, { knownPlaces }).map(s => s.text);
}

function rejectedNames(text: string): string[] {
  return processPlaceSuggestions(text)
    .filter(s => s.status === 'rejected')
    .map(s => s.text);
}

function findSuggestion(text: string, namePart: string) {
  return processPlaceSuggestionsForOutput(text).find(s =>
    s.text.toLowerCase().includes(namePart.toLowerCase())
  );
}

describe('place suggestion boundary pipeline', () => {
  it('extracts Tio Ralph\'s house as private residence without orphan possessive', () => {
    const text =
      "Yesterday was my cousin Leslie's Graduation Party at my Tio Ralph's house.";
    const residence = findSuggestion(text, "Tio Ralph");
    expect(residence).toBeDefined();
    expect(residence!.placeType).toMatch(/private_residence|family_home/);
    expect(residence!.ownerDisplayName).toMatch(/Tio Ralph/i);
    expect(residence!.privacySensitive).toBe(true);
    expect(residence!.status).toBe('needs_review');
    expect(acceptedNames(text)).not.toContain("'s House");
    expect(acceptedNames(text).some(n => /house/i.test(n) && n.startsWith("'"))).toBe(false);
  });

  it('extracts Walmart as store', () => {
    const text = 'My Abuela wanted me to take her to Walmart.';
    const walmart = findSuggestion(text, 'Walmart');
    expect(walmart).toBeDefined();
    expect(walmart!.placeType).toBe('store');
  });

  it('extracts CSUF without verb tail', () => {
    const text = "CSUF weren't learning in classes.";
    const csuf = findSuggestion(text, 'CSUF');
    expect(csuf).toBeDefined();
    expect(csuf!.placeType).toMatch(/university|campus|school/);
    expect(acceptedNames(text)).not.toContain("CSUF weren");
    expect(rejectedNames(text).some(n => /weren/i.test(n))).toBe(false);
  });

  it('extracts Bad Dogg Compound as event_space/venue', () => {
    const text = 'There were a lot of people there that day at Bad Dogg Compound.';
    const venue = findSuggestion(text, 'Bad Dogg Compound');
    expect(venue).toBeDefined();
    expect(venue!.placeType).toMatch(/event_space|music_venue|unknown_place/);
  });

  it('rejects Gothicumbia as place unless known in LoreBook', () => {
    const text = "So I didn't go to Gothicumbia last night.";
    expect(acceptedNames(text)).not.toContain('Gothicumbia last night');
    expect(acceptedNames(text)).not.toContain('Gothicumbia');
    const rejected = processPlaceSuggestions(text).find(s => /gothicumbia/i.test(s.text));
    expect(rejected?.status).toBe('rejected');
    expect(rejected?.rejectedAs).toMatch(/EVENT|MUSIC_EVENT/);

    const known = new Set(['Gothicumbia']);
    expect(acceptedNames(text, known)).toContain('Gothicumbia');
  });

  it('splits LA and Oscuri.dad — only LA is a place', () => {
    const text = "It's actually here in LA and Oscuri.dad is her boyfriend.";
    const names = acceptedNames(text);
    expect(names.some(n => n === 'LA' || n === 'Los Angeles')).toBe(true);
    expect(names.some(n => /oscuro|oscouri/i.test(n))).toBe(false);
    expect(names.some(n => /LA and Oscuri/i.test(n))).toBe(false);
  });

  it('rejects Sol in a few weeks as place', () => {
    const text = "I haven't talked to Sol in a few weeks.";
    expect(acceptedNames(text)).not.toContain('Sol in a few weeks');
    expect(acceptedNames(text)).not.toContain('Sol');
  });

  it('rejects Ska Prom with time tail as place', () => {
    const text = 'I briefly saw her at Ska Prom a couple weeks ago.';
    expect(acceptedNames(text)).not.toContain('Ska Prom a couple weeks');
    expect(acceptedNames(text)).not.toContain('Ska Prom');
  });

  it('rejects Rafeh Qazi youtuber span as place', () => {
    const text = 'It was run by Rafeh Qazi a youtuber who I saw.';
    expect(acceptedNames(text)).not.toContain('Rafeh Qazi a youtuber who');
    expect(acceptedNames(text)).not.toContain('Rafeh Qazi');
  });

  it('rejects Clever Programmer Bootcamp as place by default', () => {
    const text = 'Clever Programmer Bootcamp that taught me front end development.';
    expect(acceptedNames(text)).not.toContain('Clever Programmer Bootcamp that taught');
    expect(acceptedNames(text)).not.toContain('Clever Programmer Bootcamp');
  });

  it('rescues Club Onyx when known in LoreBook', () => {
    const text = 'We went to Club Onyx last night.';
    expect(acceptedNames(text)).not.toContain('Club Onyx');
    const known = new Set(['Club Onyx']);
    const metro = processPlaceSuggestionsForOutput(text, { knownPlaces: known }).find(s =>
      /club onyx/i.test(s.text)
    );
    expect(metro).toBeDefined();
    expect(metro!.status).toBe('known');
  });

  it('handles Mom\'s House as privacy-sensitive residence', () => {
    const text = "I'm staying at Mom's House for the weekend.";
    const mom = findSuggestion(text, "Mom's House");
    expect(mom).toBeDefined();
    expect(mom!.placeType).toMatch(/family_home|private_residence/);
    expect(mom!.privacySensitive).toBe(true);
    expect(mom!.ownerDisplayName).toMatch(/Mom/i);
  });
});
