import { describe, expect, it } from 'vitest';

import { processPlaceSuggestions, processPlaceSuggestionsForOutput } from './placeSuggestionService';

describe('placeSuggestionService', () => {
  it('keeps workplace/org/role/person/social spans out of Places', () => {
    const text = [
      'I was working at Ring as a Technician on the Failure Analysis and Prototypes Team.',
      'Ring is a sub company of Amazon and my manager Kavi worked with Dorian, Rhys, Xola, Jules, Kelan, and Hark.',
      'Ring with',
      'At Ink Fest and Ska Prom, pit she still said no because of her presence.',
      'This other promoter named Ruben was there.',
    ].join('\n');

    expect(processPlaceSuggestionsForOutput(text)).toEqual([]);

    const debug = processPlaceSuggestions(text);
    const rejected = new Map(debug.map((item) => [item.displayName, item.rejectedAs]));

    expect(rejected.get('Ring')).toBe('ORGANIZATION');
    expect(rejected.get('pit')).toBe('VENUE_SUBAREA_CONTEXT');
  });

  it('does not capture lowercase prose after prepositions as place candidates', () => {
    // Real chat message that produced "her right in the eyes" and
    // "shock but she let me" as music-venue suggestions.
    const text =
      'I went to the club last night after Anime Expo there was an afters at Catch One the club. ' +
      'I looked at her right in the eyes and was in her face. ' +
      'I was worried she would pull away in shock but she let me.';

    const names = processPlaceSuggestionsForOutput(text).map((s) => s.text.toLowerCase());
    expect(names.some((n) => n.includes('her right in the eyes'))).toBe(false);
    expect(names.some((n) => n.includes('shock but she let me'))).toBe(false);
    // The actual venue still comes through.
    expect(names.some((n) => n.includes('catch one'))).toBe(true);
  });

  it('trims trailing time phrases like "weeks back" from venue spans', () => {
    const text =
      'I went to go talk to this other girl I had danced with at another ska show at Bad Dogg Compound weeks back. I never got that girls name until that day.';

    const names = processPlaceSuggestionsForOutput(text).map((s) => s.text);
    expect(names).toContain('Bad Dogg Compound');
    expect(names.some((n) => /weeks back/i.test(n))).toBe(false);
  });
});
