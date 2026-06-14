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

  it('accepts real person names', () => {
    expect(classifyMentionKind('Ashley De la Cruz').kind).toBe('person');
    expect(classifyMentionKind('Ashley').kind).toBe('person');
  });

  it('defers single-token first mentions', () => {
    expect(shouldDeferCharacterPromotion('Ashley', 1)).toBe(true);
    expect(shouldDeferCharacterPromotion('Ashley', 2)).toBe(false);
    expect(shouldDeferCharacterPromotion('Ashley De la Cruz', 1)).toBe(false);
  });
});
