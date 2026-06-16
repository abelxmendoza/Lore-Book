import { describe, expect, it } from 'vitest';

import { classifyEntity, toStorageType, isCharacterEligible } from '../../src/services/entities/entityClassifier';

const t = (name: string, ctx?: string) => classifyEntity(name, ctx).type;

describe('EntityClassifier — the Graduation Party regressions', () => {
  it('"High Noon" → PRODUCT (not Character)', () => {
    expect(t('High Noon')).toBe('FOOD_DRINK');
    expect(t('High Noons')).toBe('FOOD_DRINK');
    expect(isCharacterEligible(classifyEntity('High Noon').type)).toBe(false);
  });
  it('"Amazon Ring" → PRODUCT (not Character)', () => {
    expect(t('Amazon Ring')).toBe('PRODUCT');
  });
  it('"Find My" → APP (not Person)', () => {
    expect(t('Find My')).toBe('APP');
  });
  it('"Moreno Valley" → PLACE (not Character)', () => {
    expect(t('Moreno Valley')).toBe('PLACE');
  });
  it('"Mom\'s House" → HOUSEHOLD → place storage (not Person)', () => {
    expect(t("Mom's House")).toBe('HOUSEHOLD');
    expect(toStorageType('HOUSEHOLD')).toBe('place');
    expect(isCharacterEligible('HOUSEHOLD')).toBe(false);
  });
  it('"Ralph Family" → GROUP', () => {
    expect(t('Ralph Family')).toBe('FAMILY');
  });
  it('"Graduation Party" → EVENT', () => {
    expect(t('Graduation Party')).toBe('EVENT');
  });
});

describe('EntityClassifier — PERSON requires evidence (the core rule)', () => {
  it('honorific/kinship → PERSON', () => {
    expect(t('Tio Ralph')).toBe('PERSON');
    expect(t('Abuela')).toBe('PERSON');
    expect(t('Dr Martinez')).toBe('PERSON');
    expect(t('Mother')).toBe('PERSON');
    expect(t('Stepdad')).toBe('PERSON');
  });
  it('person-context predicate → PERSON', () => {
    expect(t('Leslie', 'Leslie said she would bring the cake')).toBe('PERSON');
    expect(t('Marcus', 'my cousin Marcus came over')).toBe('PERSON');
  });
  it('bare unknown proper noun → UNCLASSIFIED (never auto-Person/Character)', () => {
    expect(t('Leslie')).toBe('UNKNOWN');
    expect(t('Zephyrine')).toBe('UNKNOWN');
    expect(isCharacterEligible(classifyEntity('Leslie').type)).toBe(false);
  });
});

describe('EntityClassifier — places, venues, companies', () => {
  it('venue suffix → LOCATION', () => {
    expect(t("Joe's Gym")).toBe('LOCATION');
    expect(t('Riverside Mall')).toBe('LOCATION');
  });
  it('locative context → LOCATION', () => {
    expect(t('Blackledge', 'we met at Blackledge for lunch')).toBe('LOCATION');
  });
  it('company lexicon → COMPANY', () => {
    expect(t('Amazon')).toBe('ORGANIZATION');
    expect(t('Google')).toBe('ORGANIZATION');
  });
  it('band/org lexicon → ORGANIZATION', () => {
    expect(t('Prayers')).toBe('ORGANIZATION');
    expect(t('Ex Lover')).toBe('ORGANIZATION');
  });
  it('specific venue → LOCATION', () => {
    expect(t('Club Metro')).toBe('LOCATION');
  });
});

describe('EntityClassifier — ship blocker sprint (real-world labels)', () => {
  it('products, apps, places from user list', () => {
    expect(t('Amazon Ring')).toBe('PRODUCT');
    expect(t('Find My')).toBe('APP');
    expect(t('High Noons')).toBe('FOOD_DRINK');
    expect(t('Moreno Valley')).toBe('PLACE');
    expect(t("Mom's House")).toBe('HOUSEHOLD');
  });
  it('kinship → PERSON', () => {
    expect(t('Tío Juan')).toBe('PERSON');
    expect(t('Step Mom')).toBe('PERSON');
    expect(t('Step Dad')).toBe('PERSON');
    expect(t('Brother')).toBe('PERSON');
    expect(t('Sister')).toBe('PERSON');
  });
  it('bare nicknames without context → UNKNOWN (never Person)', () => {
    for (const name of ['Hell Fairy', 'Daisy', 'Baby Bats', 'Juan (Oscuri.dad)']) {
      expect(t(name)).toBe('UNKNOWN');
      expect(isCharacterEligible(classifyEntity(name).type)).toBe(false);
    }
  });
});

describe('EntityClassifier — storage mapping + character eligibility', () => {
  it('only PERSON is character-eligible', () => {
    for (const c of ['FAMILY', 'PLACE', 'LOCATION', 'HOUSEHOLD', 'GROUP', 'ORGANIZATION', 'COMPANY', 'PRODUCT', 'BRAND', 'APP', 'EVENT', 'SKILL', 'PET', 'VEHICLE', 'MEDIA', 'FOOD_DRINK', 'UNKNOWN', 'UNCLASSIFIED'] as const) {
      expect(isCharacterEligible(c)).toBe(false);
    }
    expect(isCharacterEligible('PERSON')).toBe(true);
  });
  it('maps to legacy storage types', () => {
    expect(toStorageType('PRODUCT')).toBe('platform');
    expect(toStorageType('APP')).toBe('platform');
    expect(toStorageType('PLACE')).toBe('place');
    expect(toStorageType('COMPANY')).toBe('organization');
    expect(toStorageType('FOOD_DRINK')).toBe('platform');
    expect(toStorageType('UNKNOWN')).toBe('unclassified');
  });
});
