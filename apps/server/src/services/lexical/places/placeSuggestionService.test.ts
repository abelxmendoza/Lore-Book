import { describe, expect, it } from 'vitest';

import { processPlaceSuggestions, processPlaceSuggestionsForOutput } from './placeSuggestionService';

describe('placeSuggestionService', () => {
  it('keeps workplace/org/role/person/social spans out of Places', () => {
    const text = [
      'I was working at Ring as a Technician on the Failure Analysis and Prototypes Team.',
      'Ring is a sub company of Amazon and my manager Kaustubh worked with Dan, Ryan, Xingpeng, Jimmy, Khalil, and Hassan.',
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
});
