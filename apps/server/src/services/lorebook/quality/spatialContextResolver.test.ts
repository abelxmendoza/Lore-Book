import { describe, it, expect } from 'vitest';

import { classifySpatialReference, isSpatialPlace } from './spatialContextResolver';

const PERSONS = ['Shyla', 'Renna', 'Ink', 'Ashley', 'Ruben'];

describe('classifySpatialReference — boundary rules', () => {
  it('Rule 2: "front of Shyla" → spatial relationship to a person, not a place', () => {
    const r = classifySpatialReference('front of Shyla', { knownPersonNames: PERSONS });
    expect(r.referenceType).toBe('spatial_relationship');
    expect(r.target).toBe('Shyla');
    expect(r.isPlace).toBe(false);
  });

  it('relative position to an unknown target is still not a place', () => {
    const r = classifySpatialReference('in front of the speakers');
    expect(r.referenceType).toBe('relative_position');
    expect(r.isPlace).toBe(false);
  });

  it('Rule 6: shows/fests/proms are events, not places', () => {
    for (const name of ['Ink Fest Show', 'Gemini Show', 'Ink Fest', "Ink's Other Show", 'Ska Prom']) {
      const r = classifySpatialReference(name);
      expect(r.referenceType).toBe('event');
      expect(r.isPlace).toBe(false);
    }
  });

  it("Rule 7: \"Ink's Ska Prom\" → event with organizer Ink", () => {
    const r = classifySpatialReference("Ink's Ska Prom");
    expect(r.referenceType).toBe('event');
    expect(r.organizer).toBe('Ink');
    expect(r.eventName).toBe('Ska Prom');
    expect(r.isPlace).toBe(false);
  });

  it("Rule 4/8: \"Renna's Pit\" → venue area, not a person-owned place", () => {
    const r = classifySpatialReference("Renna's Pit", { knownPersonNames: PERSONS });
    expect(r.referenceType).toBe('venue_area');
    expect(r.isPlace).toBe(false);
  });

  it('bare venue areas (pit, stage, dance floor) are venue areas', () => {
    for (const name of ['pit', 'the stage', 'dance floor', 'backstage']) {
      expect(classifySpatialReference(name).referenceType).toBe('venue_area');
    }
  });

  it('Rule 5/11: "Security Kickout Venue" + generic refs → unresolved location', () => {
    expect(classifySpatialReference('Security Kickout Venue').referenceType).toBe('unresolved_location');
    expect(classifySpatialReference('that venue').referenceType).toBe('unresolved_location');
    expect(classifySpatialReference('the place').referenceType).toBe('unresolved_location');
  });

  it('Rule 9: "my age" / "same age" → demographic, never a place', () => {
    expect(classifySpatialReference('my age').referenceType).toBe('demographic');
    expect(classifySpatialReference('same age').referenceType).toBe('demographic');
    expect(isSpatialPlace('my age')).toBe(false);
  });

  it('keeps real, identifiable places as places', () => {
    // Use generic names for test (personal places kept out of git per privacy rules)
    for (const name of ['The Compound', 'Metro Club', 'Riverside Pool Hall']) {
      const r = classifySpatialReference(name);
      expect(r.referenceType).toBe('place');
      expect(r.isPlace).toBe(true);
    }
  });
});
