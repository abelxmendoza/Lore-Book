import { describe, it, expect } from 'vitest';
import { classifyEntity } from './entityClassifier';

describe('classifyEntity — solo performer vs band', () => {
  it('classifies a solo public figure named with bare "performed" language as PERSON, not ORGANIZATION', () => {
    const c = classifyEntity('Kali Uchis', 'Kali Uchis performed last night and it was amazing');
    expect(c.type).toBe('PERSON');
  });

  it('classifies "opening for <Name>" and "set by <Name>" as PERSON when no group language is present', () => {
    expect(classifyEntity('Kali Uchis', 'we were opening for Kali Uchis at the venue').type).toBe('PERSON');
    expect(classifyEntity('Kali Uchis', 'the set by Kali Uchis was incredible').type).toBe('PERSON');
  });

  it('still classifies explicit band language as ORGANIZATION (unchanged)', () => {
    expect(classifyEntity('Ex Lover', 'Ex Lover the band sounded so good on the way here').type).toBe('ORGANIZATION');
    expect(
      classifyEntity('Prayers', 'Mr. Chino is a DJ for Prayers aka Cholo Goth').type,
    ).toBe('ORGANIZATION');
    expect(
      classifyEntity('Ex Lover', 'I saw Daisy at the Ex Lover and Voltra band shows with Mr. Chino').type,
    ).toBe('ORGANIZATION');
  });

  it('keeps a weak performer signal as ORGANIZATION when the context also carries group language', () => {
    const c = classifyEntity('Voltra', 'Voltra performed last night, they killed it as a band');
    expect(c.type).toBe('ORGANIZATION');
  });
});

describe('classifyEntity — employment organizations', () => {
  it('routes an interview target to organizations instead of people', () => {
    expect(classifyEntity('Rivian', 'I have a phone interview for Rivian tomorrow').type).toBe('ORGANIZATION');
  });
});
