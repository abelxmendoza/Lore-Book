import { describe, it, expect } from 'vitest';

import { extractThirdPartyRomances } from './thirdPartyRomanceExtractor';

describe('extractThirdPartyRomances', () => {
  it('recovers the real Daisy ↔ Juan case from "her boyfriend Juan"', () => {
    const text =
      "Well I didn't try with Daisy aka Hell Fairy because I knew she was taken and her boyfriend Juan aka Oscuri.dad was there too";
    const found = extractThirdPartyRomances(text);
    expect(found.length).toBeGreaterThan(0);
    const r = found[0];
    expect(r.partnerName).toBe('Juan');
    // anchor is the nearest prior named person (Daisy / Hell Fairy)
    expect(['Daisy', 'Hell Fairy', 'Daisy aka Hell Fairy']).toContain(r.anchorName);
    expect(r.partnerRole).toBe('boyfriend');
    expect(r.anchorRole).toBe('girlfriend');
  });

  it('handles the possessive form "X\'s girlfriend Y"', () => {
    const found = extractThirdPartyRomances('Marcus introduced me to Sarah, his girlfriend.');
    // "his girlfriend" with no trailing name → no partner captured here
    expect(found.length).toBe(0);

    const found2 = extractThirdPartyRomances("Mara's boyfriend Diego came to the party");
    expect(found2[0]).toMatchObject({ anchorName: 'Mara', partnerName: 'Diego', partnerRole: 'boyfriend' });
  });

  it('captures the partner role direction (his wife Ana → Ana is the wife)', () => {
    const [r] = extractThirdPartyRomances('I met Leo and his wife Ana at the show');
    expect(r).toMatchObject({ partnerName: 'Ana', partnerRole: 'girlfriend', anchorRole: 'boyfriend' });
    expect(r.anchorName).toBe('Leo');
  });

  it('does not invent relationships from plain text', () => {
    expect(extractThirdPartyRomances('We went to a goth show and it was sick')).toEqual([]);
    expect(extractThirdPartyRomances('')).toEqual([]);
  });

  it('dedupes repeated mentions of the same pair', () => {
    const found = extractThirdPartyRomances("Mara's boyfriend Diego. Later, Mara's boyfriend Diego left.");
    expect(found).toHaveLength(1);
  });
});
