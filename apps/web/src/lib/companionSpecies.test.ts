import { describe, expect, it } from 'vitest';

import {
  inferCompanionSpecies,
  looksLikeRobotDesignation,
  resolveCompanionSpecies,
  shouldRetryAddAsRobotCompanion,
} from './companionSpecies';

describe('companionSpecies', () => {
  it('infers robot from companion phrasing', () => {
    expect(inferCompanionSpecies('Omega1', 'my robot Omega1 needs a charge')).toBe('robot');
    expect(inferCompanionSpecies('Omega1', 'Omega1 is my android')).toBe('robot');
    expect(inferCompanionSpecies('Omega1', "our robot's name is Omega1")).toBe('robot');
    expect(inferCompanionSpecies('Max', 'my dog Max is the best')).toBe('dog');
  });

  it('does not infer a robot from shipping/project language alone', () => {
    expect(inferCompanionSpecies('Omega1', 'I shipped Omega1 last week at Vanguard Robotics')).toBeUndefined();
    expect(inferCompanionSpecies('Jamie', 'Jamie said she would call')).toBeUndefined();
  });

  it('treats TitleCase+digits as a robot designation without promoting model names', () => {
    expect(looksLikeRobotDesignation('Omega1')).toBe(true);
    expect(looksLikeRobotDesignation('Atlas2')).toBe(true);
    expect(looksLikeRobotDesignation('GPT4')).toBe(false);
    expect(looksLikeRobotDesignation('Jamie')).toBe(false);
  });

  it('retries Add as robot for designations or robot context', () => {
    expect(shouldRetryAddAsRobotCompanion('Omega1')).toBe(true);
    expect(shouldRetryAddAsRobotCompanion('Sparky', 'my robot Sparky')).toBe(true);
    expect(shouldRetryAddAsRobotCompanion('Jamie')).toBe(false);
  });

  it('lets an explicit species win over inferred context', () => {
    expect(
      resolveCompanionSpecies({
        name: 'Omega1',
        species: 'robot',
        context: 'my dog Omega1',
        kind: 'pet',
      }),
    ).toBe('robot');
    expect(resolveCompanionSpecies({ name: 'Max', kind: 'pet' })).toBe('pet');
  });
});
