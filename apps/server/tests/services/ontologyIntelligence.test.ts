import { describe, expect, it } from 'vitest';

import { classifyGroup, groupDuplicateScore } from '../../src/services/ontology/groupIntelligence';
import {
  classifyPlace,
  placeDuplicateScore,
  canonicalVenueName,
  reviewPlaceDuplicateCompatibility,
} from '../../src/services/ontology/placeIntelligence';

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

  it('does not merge event-at-venue as a venue duplicate', () => {
    const review = reviewPlaceDuplicateCompatibility('Neon Lounge', 'Neon Lounge Anniversary');
    expect(review.canMerge).toBe(false);
    expect(review.relationship).toBe('hosted_event_at');
    expect(review.reason).toBe('hosted_event');
    expect(placeDuplicateScore('Neon Lounge', 'Neon Lounge Anniversary')).toBe(0);
    expect(placeDuplicateScore('Moms House', "Mom's House")).toBeGreaterThan(0.4);
  });

  it('does not merge city with child residential or room locations', () => {
    const home = reviewPlaceDuplicateCompatibility('Anaheim', 'Anaheim Family Home');
    expect(home.canMerge).toBe(false);
    expect(home.relationship).toBe('located_in');
    expect(home.reason).toBe('contained_location');

    const kitchen = reviewPlaceDuplicateCompatibility('Anaheim', 'Family Kitchen in Anaheim');
    expect(kitchen.canMerge).toBe(false);
    expect(kitchen.relationship).toBe('located_in');
    expect(kitchen.reason).toBe('contained_location');
  });

  it('does not merge venue with hosted event', () => {
    const review = reviewPlaceDuplicateCompatibility('Skyline Lounge', 'The Skyline Lounge anniversary where the band played');
    expect(review.canMerge).toBe(false);
    expect(review.relationship).toBe('hosted_event_at');
    expect(review.reason).toBe('hosted_event');
  });

  it('only treats room variants as possible aliases with overlapping provenance', () => {
    const withoutProvenance = reviewPlaceDuplicateCompatibility('Family Kitchen', 'Family Kitchen in Anaheim');
    expect(withoutProvenance.canMerge).toBe(false);
    expect(withoutProvenance.reason).toBe('room_or_area');

    const withProvenance = reviewPlaceDuplicateCompatibility('Family Kitchen', 'Family Kitchen in Anaheim', {
      leftProvenance: ['Anaheim Family Home'],
      rightProvenance: ['Anaheim Family Home'],
    });
    expect(withProvenance.canMerge).toBe(true);
    expect(withProvenance.requiresReview).toBe(true);
    expect(withProvenance.relationship).toBe('possible_alias');
  });

  it('does not let token overlap alone create merges', () => {
    const review = reviewPlaceDuplicateCompatibility('Anaheim', 'Anaheim Family Home');
    expect(review.evidence.some((item) => /token_overlap/.test(item))).toBe(true);
    expect(review.canMerge).toBe(false);
    expect(placeDuplicateScore('Anaheim', 'Anaheim Family Home')).toBe(0);
  });
});
