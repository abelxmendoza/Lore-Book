import { describe, it, expect } from 'vitest';
import { expandEntityCandidates } from './multiEntitySplitter';
import type { EntityType } from '../../types/omegaMemory';

const PERSON = 'PERSON' as EntityType;

describe('expandEntityCandidates — bornConfirmed (recall-active) signal', () => {
  it('marks a named person with an in-context predicate as born recall-active', () => {
    const text = 'My friend Bill Skasby came over last night.';
    const out = expandEntityCandidates(text, [{ name: 'Bill Skasby', type: PERSON }]);
    expect(out.find((e) => e.name === 'Bill Skasby')?.bornConfirmed).toBe(true);
  });

  it('leaves a bare name-drop as a suggestion-queue candidate (not recall-active)', () => {
    const text = 'The flyer listed Bill Skasby alongside three other acts.';
    const out = expandEntityCandidates(text, [{ name: 'Bill Skasby', type: PERSON }]);
    expect(out.find((e) => e.name === 'Bill Skasby')?.bornConfirmed).toBeFalsy();
  });

  it('does not confirm concept/place look-alikes even if typed PERSON', () => {
    const text = 'Computer Science is hard. The Discovery Cube was fun.';
    const out = expandEntityCandidates(text, [
      { name: 'Computer Science', type: PERSON },
      { name: 'Discovery Cube', type: PERSON },
    ]);
    for (const e of out) expect(e.bornConfirmed).toBeFalsy();
  });

  it('confirms honorific+name kinship mentions', () => {
    const text = 'We visited Tío Rafa for dinner.';
    const out = expandEntityCandidates(text, [{ name: 'Tío Rafa', type: PERSON }]);
    expect(out.find((e) => e.name.includes('Rafa'))?.bornConfirmed).toBe(true);
  });
});
