import { describe, expect, it } from 'vitest';

import { detectCharacterPronouns } from './characterPronounDetector';

describe('detectCharacterPronouns', () => {
  it('reads an explicit slash-form on the named person', () => {
    const hit = detectCharacterPronouns("Jamie's pronouns are they/them.", { name: 'Jamie' });
    expect(hit).toMatchObject({ pronouns: 'they/them', source: 'explicit' });
  });

  it('reads focused "her pronouns are she/her"', () => {
    const hit = detectCharacterPronouns('Her pronouns are she/her.', {
      name: 'Jamie',
      focused: true,
    });
    expect(hit).toMatchObject({ pronouns: 'she/her', source: 'explicit' });
  });

  it('infers she/her from a bound gendered role', () => {
    const hit = detectCharacterPronouns('Jamie is my girlfriend from work.', { name: 'Jamie' });
    expect(hit).toMatchObject({ pronouns: 'she/her', source: 'role_noun' });
  });

  it('infers he/him from a bound gendered role', () => {
    const hit = detectCharacterPronouns('Marcus is my uncle.', { name: 'Marcus' });
    expect(hit).toMatchObject({ pronouns: 'he/him', source: 'role_noun' });
  });

  it('infers she/her from name + she in the same sentence', () => {
    const hit = detectCharacterPronouns('Jamie said she was exhausted after the shift.', {
      name: 'Jamie',
    });
    expect(hit?.pronouns).toBe('she/her');
    expect(hit?.source).toBe('bound_pronoun');
  });

  it('binds anaphora in the next sentence', () => {
    const hit = detectCharacterPronouns('Jamie came over. She brought coffee.', { name: 'Jamie' });
    expect(hit?.pronouns).toBe('she/her');
  });

  it('uses the About-name prefix as focus so a lone she binds', () => {
    const hit = detectCharacterPronouns('About Jamie: She works at the coffee shop on Main Street.', {
      name: 'Jamie',
    });
    expect(hit?.pronouns).toBe('she/her');
  });

  it('does not steal her from a relative of someone else', () => {
    const hit = detectCharacterPronouns("I met her sister Jamie at the depot.", { name: 'Jamie' });
    expect(hit).toBeNull();
  });

  it('does not assign Jamie the sister’s pronouns', () => {
    const hit = detectCharacterPronouns("Jamie's sister said she was moving.", { name: 'Jamie' });
    expect(hit).toBeNull();
  });

  it('does not infer they/them from a two-person they', () => {
    const hit = detectCharacterPronouns('Jamie and Marcus went out. They got dinner.', {
      name: 'Jamie',
    });
    expect(hit).toBeNull();
  });

  it('does not infer from a question', () => {
    const hit = detectCharacterPronouns('Is Jamie a woman?', { name: 'Jamie' });
    expect(hit).toBeNull();
  });

  it('does not infer from a negation', () => {
    const hit = detectCharacterPronouns('Jamie is not my girlfriend.', { name: 'Jamie' });
    expect(hit).toBeNull();
  });

  it('returns null when he and she both bind', () => {
    const hit = detectCharacterPronouns('Jamie said she was tired and then he left.', {
      name: 'Jamie',
    });
    expect(hit).toBeNull();
  });

  it('matches a first-name alias for a titled card', () => {
    const hit = detectCharacterPronouns('Maria said she would call later.', {
      name: 'Tía Maria',
      aliases: ['Maria'],
    });
    expect(hit?.pronouns).toBe('she/her');
  });

  it('does not bind a pronoun about a different named person', () => {
    const hit = detectCharacterPronouns('Marcus said he would drive. Jamie stayed home.', {
      name: 'Jamie',
    });
    expect(hit).toBeNull();
  });
});
