import { describe, expect, it } from 'vitest';

import { extractCoworkerNames } from '../../../../src/services/inference/work/coworkerInferenceService';

describe('coordinated coworker extraction', () => {
  it('keeps every name when the coordinated list ends with Ordell', () => {
    const people = extractCoworkerNames('I work with Chris, Jesse, and Ordell in the lab.');
    expect(people.map((person) => person.name)).toEqual(['Chris', 'Jesse', 'Ordell']);
  });

  it('preserves the existing two-person form', () => {
    const people = extractCoworkerNames('I worked with Gary and Jeff.');
    expect(people.map((person) => person.name)).toEqual(['Gary', 'Jeff']);
  });
});
