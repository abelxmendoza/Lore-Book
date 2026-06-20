import { describe, it, expect } from 'vitest';
import { mapCrystallizedKind, mapEntryIrKind } from './legacyClaimBridge';

describe('narrativeSpine mappers', () => {
  it('maps EntryIR knowledge types to epistemic claim kinds', () => {
    expect(mapEntryIrKind('FACT')).toBe('fact');
    expect(mapEntryIrKind('DECISION')).toBe('decision');
    expect(mapEntryIrKind('BELIEF')).toBe('interpretation');
    expect(mapEntryIrKind('FEELING')).toBe('interpretation');
    expect(mapEntryIrKind('EXPERIENCE')).toBe('interpretation');
  });

  it('maps crystallized knowledge types to fact or meaning', () => {
    expect(mapCrystallizedKind('behavioral_pattern')).toBe('meaning');
    expect(mapCrystallizedKind('lesson')).toBe('meaning');
    expect(mapCrystallizedKind('career')).toBe('fact');
    expect(mapCrystallizedKind('skill')).toBe('fact');
    expect(mapCrystallizedKind('relationship')).toBe('fact');
  });
});
