/**
 * UNIT — preference (like/dislike) stance detector.
 *
 * Precision-first: the suite is dominated by the cases that MUST NOT fire
 * (negation, irrealis, revocation, third-party attribution, empty targets),
 * because over-firing pollutes the preference graph.
 */
import { describe, expect, it } from 'vitest';

import {
  detectPreferenceStances,
  type PreferenceStance,
} from '../../src/services/ontology/preferenceStance';

const one = (text: string): PreferenceStance | undefined => detectPreferenceStances(text)[0];

describe('preferenceStance — positive detection', () => {
  const likes: Array<{ text: string; target: string }> = [
    { text: 'I love sushi', target: 'sushi' },
    { text: "I'm obsessed with synthwave", target: 'synthwave' },
    { text: "I'm really into bouldering these days", target: 'bouldering' },
    { text: 'I really enjoy long runs', target: 'long runs' },
    { text: 'We adore that little coffee shop', target: 'little coffee shop' },
    { text: "I'm a huge fan of horror films", target: 'horror films' },
  ];
  it.each(likes)('LIKE: "$text" → target "$target"', ({ text, target }) => {
    const s = one(text);
    expect(s?.polarity).toBe('LIKE');
    expect(s?.target).toBe(target);
    expect(s?.attributedToSelf).toBe(true);
    expect(s?.negated).toBe(false);
    expect(s?.confidence).toBeGreaterThan(0.5);
  });
});

describe('preferenceStance — negative detection', () => {
  const dislikes: Array<{ text: string; target: string }> = [
    { text: "I can't stand my manager", target: 'manager' },
    { text: 'I hate cilantro', target: 'cilantro' },
    { text: "I'm not a fan of jazz", target: 'jazz' },
    { text: "I'm sick of the commute", target: 'commute' },
    { text: 'I despise small talk', target: 'small talk' },
  ];
  it.each(dislikes)('DISLIKE: "$text" → target "$target"', ({ text, target }) => {
    const s = one(text);
    expect(s?.polarity).toBe('DISLIKE');
    expect(s?.target).toBe(target);
    expect(s?.attributedToSelf).toBe(true);
  });
});

describe('preferenceStance — negation flips polarity', () => {
  it('"I don\'t like olives" → DISLIKE (negated)', () => {
    const s = one("I don't like olives");
    expect(s?.polarity).toBe('DISLIKE');
    expect(s?.negated).toBe(true);
    expect(s?.target).toBe('olives');
    expect(s?.confidence).toBeLessThan(0.6); // negated → discounted
  });

  it('"I don\'t really enjoy parties" → DISLIKE', () => {
    const s = one("I don't really enjoy parties");
    expect(s?.polarity).toBe('DISLIKE');
    expect(s?.negated).toBe(true);
    expect(s?.target).toBe('parties');
  });

  it('litotes "I don\'t hate the gym" is too weak → dropped', () => {
    expect(detectPreferenceStances("I don't hate the gym")).toEqual([]);
  });
});

describe('preferenceStance — irrealis / hypothetical is NOT a stance', () => {
  it.each([
    "I'd love to visit Japan",
    'I would love sushi someday',
    'I might like it',
    'I want to like running',
    'If I liked coffee I would drink it',
  ])('drops: "%s"', (text) => {
    expect(detectPreferenceStances(text)).toEqual([]);
  });
});

describe('preferenceStance — revocation is NOT a current stance', () => {
  it.each([
    'I used to love smoking',
    "I don't love it anymore",
    'I no longer enjoy clubbing',
  ])('drops: "%s"', (text) => {
    expect(detectPreferenceStances(text)).toEqual([]);
  });
});

describe('preferenceStance — attribution scope', () => {
  it('"She loves sushi" is attributed to a third party, not self', () => {
    const s = one('She loves sushi');
    expect(s?.polarity).toBe('LIKE');
    expect(s?.attributedToSelf).toBe(false);
  });

  it('mixed subjects resolve per clause', () => {
    const stances = detectPreferenceStances('She loves sushi and I love ramen');
    const self = stances.find((x) => x.target === 'ramen');
    const other = stances.find((x) => x.target === 'sushi');
    expect(self?.attributedToSelf).toBe(true);
    expect(other?.attributedToSelf).toBe(false);
  });
});

describe('preferenceStance — multi-target sentences', () => {
  it('"I love ramen but I can\'t stand sushi" → LIKE ramen + DISLIKE sushi', () => {
    const stances = detectPreferenceStances("I love ramen but I can't stand sushi");
    expect(stances.find((s) => s.target === 'ramen')?.polarity).toBe('LIKE');
    expect(stances.find((s) => s.target === 'sushi')?.polarity).toBe('DISLIKE');
  });
});

describe('preferenceStance — pollution guards / error cases', () => {
  it.each([
    '', '   \n  ',
    'The weather was nice and I had a sandwich.',
    'It feels like rain and looks like snow.', // "like" similes must not fire
    'I like that',                              // pronoun target → drop
    'We walked into the room',                  // "into" motion, not preference
    'I got into a fight',                       // "into" motion, not preference
  ])('no stance for: "%s"', (text) => {
    expect(detectPreferenceStances(text)).toEqual([]);
  });
});
