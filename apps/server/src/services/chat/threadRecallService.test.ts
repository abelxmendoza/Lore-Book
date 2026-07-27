import { describe, expect, it } from 'vitest';
import { extractPlaces } from './threadRecallService';

describe('extractPlaces', () => {
  it('does not truncate mid-word at the raw character cap', () => {
    // Regression: the old regex had no terminating lookahead, so a {2,40} char
    // cap cut wherever the 40th character landed — including mid-word.
    const text =
      "Ok here I am testing if memory can be saved. Im at Abuelas house building Lorebook on June 3rd 2026.";
    const places = extractPlaces(text);
    expect(places).toContain('Abuelas house building Lorebook');
    expect(places.some((p) => /\d$/.test(p) || /\b\w{1,2}$/.test(p))).toBe(false);
  });

  it('stops at sentence-ending punctuation instead of running past it', () => {
    const text = 'I was at Abuelas house testing it rn. Hoping it fixes the memory issue.';
    const places = extractPlaces(text);
    expect(places).toContain('Abuelas house testing it rn');
    expect(places.some((p) => p.includes('Hoping'))).toBe(false);
  });

  it('stops before a trailing preposition instead of swallowing the next clause', () => {
    const text = 'I was at Abuelas house laying in bed and testing the app.';
    const places = extractPlaces(text);
    expect(places).toContain('Abuelas house laying');
    expect(places.some((p) => p.includes('bed'))).toBe(false);
  });

  it('still finds a simple, short place name', () => {
    const text = 'I was in Anaheim.';
    expect(extractPlaces(text)).toContain('Anaheim');
  });
});
