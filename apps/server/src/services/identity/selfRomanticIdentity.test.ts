import { describe, expect, it } from 'vitest';

import {
  parseSelfRomanticIdentity,
  selfRomanticIdentitySignalRe,
} from './selfRomanticIdentity';

describe('parseSelfRomanticIdentity', () => {
  it('learns explicit gender, orientation, and dating preference', () => {
    const parsed = parseSelfRomanticIdentity("I'm a man. I'm bisexual. I like women.");
    expect(parsed).toMatchObject({
      sex: 'male',
      gender_identity: 'man',
      sexual_orientation: 'bisexual',
      dating_preference: { partner_sexes: ['female'], label: 'women' },
    });
  });

  it('learns lesbian as orientation plus women preference', () => {
    const parsed = parseSelfRomanticIdentity("I'm a lesbian.");
    expect(parsed).toMatchObject({
      sex: 'female',
      sexual_orientation: 'lesbian',
      dating_preference: { partner_sexes: ['female'], label: 'women' },
    });
  });

  it('learns pronouns and implied sex', () => {
    const parsed = parseSelfRomanticIdentity('My pronouns are they/them.');
    expect(parsed).toMatchObject({
      pronouns: 'they/them',
      sex: 'nonbinary',
    });
  });

  it('learns attraction preference without an orientation label', () => {
    const parsed = parseSelfRomanticIdentity('I am attracted to men.');
    expect(parsed?.dating_preference).toEqual({ partner_sexes: ['male'], label: 'men' });
    expect(parsed?.sexual_orientation).toBeUndefined();
  });

  it('does not learn from questions or negation', () => {
    expect(parseSelfRomanticIdentity('Am I gay?')).toBeNull();
    expect(parseSelfRomanticIdentity("I'm not gay.")).toBeNull();
  });

  it('does not learn from third-person or crush talk', () => {
    expect(parseSelfRomanticIdentity('Jamie is gay and I have a crush on them.')).toBeNull();
    expect(parseSelfRomanticIdentity('I thought Taylor was attractive.')).toBeNull();
  });

  it('does not treat hobbies as dating preference', () => {
    expect(parseSelfRomanticIdentity("I'm into photography.")).toBeNull();
    expect(parseSelfRomanticIdentity('I like hiking.')).toBeNull();
  });
});

describe('selfRomanticIdentitySignalRe', () => {
  const re = selfRomanticIdentitySignalRe();

  it('matches first-person identity statements', () => {
    expect(re.test("I'm gay")).toBe(true);
    expect(re.test('I am a woman')).toBe(true);
    expect(re.test('My pronouns are she/her')).toBe(true);
    expect(re.test('I like women')).toBe(true);
  });

  it('does not match unrelated first-person talk', () => {
    expect(re.test('I went to the store')).toBe(false);
    expect(re.test('I like hiking')).toBe(false);
  });
});
