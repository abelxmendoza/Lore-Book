import { describe, expect, it } from 'vitest';
import {
  classifyMentionKind,
  shouldDeferCharacterPromotion,
} from './entityMentionClassifier';

describe('entityMentionClassifier', () => {
  it('rejects US holidays', () => {
    expect(classifyMentionKind('Memorial Day').kind).toBe('holiday');
    expect(classifyMentionKind('Labor Day').kind).toBe('holiday');
  });

  it('rejects known events', () => {
    expect(classifyMentionKind('Gothicumbia').kind).toBe('event');
  });

  it('rejects MTG fragments', () => {
    expect(classifyMentionKind('Magic').kind).toBe('fragment');
    expect(classifyMentionKind('Gathering').kind).toBe('fragment');
  });

  it('detects MTG from context', () => {
    expect(classifyMentionKind('Magic', 'I played Magic the Gathering last night').kind).toBe('game');
    expect(classifyMentionKind('Gathering', 'talked about magic gathering cards').kind).toBe('game');
  });

  it('requires person evidence for unknown proper nouns', () => {
    expect(classifyMentionKind('Ashley De la Cruz').kind).toBe('unknown');
    expect(classifyMentionKind('Ashley').kind).toBe('unknown');
    expect(classifyMentionKind('Tio Juan').kind).toBe('person');
    expect(classifyMentionKind('Ashley', 'Ashley said she would call').kind).toBe('person');
  });

  it('defers all first mentions from automatic character promotion', () => {
    expect(shouldDeferCharacterPromotion('Ashley', 1)).toBe(true);
    expect(shouldDeferCharacterPromotion('Ashley', 2)).toBe(false);
    expect(shouldDeferCharacterPromotion('Ashley De la Cruz', 1)).toBe(true);
    expect(shouldDeferCharacterPromotion('Ashley De la Cruz', 2)).toBe(false);
  });
});
