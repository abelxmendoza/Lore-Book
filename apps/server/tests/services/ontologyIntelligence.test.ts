import { describe, expect, it } from 'vitest';

import { classifyGroup, groupDuplicateScore } from '../../src/services/ontology/groupIntelligence';
import { classifyPlace, placeDuplicateScore, canonicalVenueName } from '../../src/services/ontology/placeIntelligence';

describe('groupIntelligence', () => {
  it('classifies founder companies', () => {
    expect(classifyGroup('Amazon').category).toBe('COMPANY');
    expect(classifyGroup('Kforce').category).toBe('COMPANY');
    expect(classifyGroup('Kforce').subcategory).toBe('STAFFING');
  });

  it('classifies institution bootcamp', () => {
    expect(classifyGroup('Clever Programmer Bootcamp').category).toBe('INSTITUTION');
  });

  it('classifies Los Goths as community', () => {
    expect(classifyGroup('Los Goths').category).toBe('COMMUNITY');
  });

  it('separates family from household', () => {
    expect(classifyGroup('My Family').category).toBe('FAMILY');
    expect(classifyGroup('My Family').isFamily).toBe(true);
    expect(classifyGroup('Tía Grace Household').category).toBe('HOUSEHOLD');
    expect(classifyGroup('Tía Grace Household').isHousehold).toBe(true);
    expect(classifyGroup('Anaheim Family Home').category).toBe('HOUSEHOLD');
    expect(classifyGroup('Abuela Household').category).toBe('HOUSEHOLD');
  });

  it('does not classify family home as FAMILY', () => {
    const c = classifyGroup('Anaheim Family Home');
    expect(c.category).toBe('HOUSEHOLD');
    expect(c.isFamily).toBe(false);
  });

  it('scores duplicate groups', () => {
    expect(groupDuplicateScore('Los Goths', 'los goths')).toBe(1);
    expect(groupDuplicateScore('Amazon', 'Kforce')).toBeLessThan(0.5);
  });
});

describe('placeIntelligence', () => {
  it('classifies rooms and households', () => {
    expect(classifyPlace('Family Kitchen').isRoom).toBe(true);
    expect(classifyPlace('Anaheim Family Home').category).toBe('HOUSEHOLD');
  });

  it('flags events masquerading as places', () => {
    expect(classifyPlace('Neon Lounge Anniversary').isEvent).toBe(true);
    expect(classifyPlace('Goth Show by Metro').isEvent).toBe(true);
    expect(canonicalVenueName('Neon Lounge Anniversary')).toMatch(/neon lounge/i);
  });

  it('splits possessive locations', () => {
    const c = classifyPlace("Abuela's House");
    expect(c.possessive?.ownerName).toBe('Abuela');
    expect(c.category).toBe('HOUSEHOLD');
  });

  it('scores venue duplicates', () => {
    expect(placeDuplicateScore('Neon Lounge', 'Neon Lounge Anniversary')).toBeGreaterThan(0.65);
    expect(placeDuplicateScore('Moms House', "Mom's House")).toBeGreaterThan(0.4);
  });
});
