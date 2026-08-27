import { describe, expect, it } from 'vitest';
import {
  classifyMentionKind,
  shouldDeferCharacterPromotion,
} from './entityMentionClassifier';

describe('entityMentionClassifier', () => {
  it('rejects software tools and calendar dates', () => {
    expect(classifyMentionKind('Claude Code').kind).not.toBe('person');
    expect(classifyMentionKind('Codex').kind).not.toBe('person');
    expect(classifyMentionKind('Cursor').kind).not.toBe('person');
    expect(classifyMentionKind('June 3rd 2026').kind).not.toBe('person');
    expect(classifyMentionKind('therapist').kind).not.toBe('person');
    expect(classifyMentionKind('Cousin in').kind).toBe('fragment');
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

  it('detects Cyberpunk 2077 as a game without blocking future nickname evidence', () => {
    expect(classifyMentionKind('Cyberpunk 2077').kind).toBe('game');
    expect(classifyMentionKind('Cyberpunk', 'I was talking about the video game called Cyberpunk 2077').kind).toBe('game');
    expect(classifyMentionKind('Cyberpunk', 'Cyberpunk is his nickname on stage').kind).not.toBe('game');
  });

  it('requires person evidence for unknown proper nouns', () => {
    expect(classifyMentionKind('Alex Morgan').kind).toBe('unknown');
    expect(classifyMentionKind('Alex').kind).toBe('unknown');
    expect(classifyMentionKind('Tio Juan').kind).toBe('person');
    expect(classifyMentionKind('Alex', 'Alex said she would call').kind).toBe('person');
  });

  it('defers single-token first mentions but promotes kinship and multi-token names', () => {
    expect(shouldDeferCharacterPromotion('Alex', 1)).toBe(true);
    expect(shouldDeferCharacterPromotion('Alex', 2)).toBe(false);
    expect(shouldDeferCharacterPromotion('Alex Morgan', 1)).toBe(false);
    expect(shouldDeferCharacterPromotion('Tío Rafa', 1)).toBe(false);
    expect(shouldDeferCharacterPromotion('Abuela', 1)).toBe(false);
  });

  it('classifies pet-context mentions as pet, not person or unknown', () => {
    expect(classifyMentionKind('Max', 'my dog Max is the best').kind).toBe('pet');
    expect(classifyMentionKind('Luna', 'our cat Luna knocked over the plant').kind).toBe('pet');
    expect(classifyMentionKind('Max', 'my dog Max is the best').kind).not.toBe('person');
  });

  it('classifies robot companion mentions as pet, not person', () => {
    expect(classifyMentionKind('Omega1', 'my robot Omega1 needs a charge').kind).toBe('pet');
    expect(classifyMentionKind('Omega1', "our robot's name is Omega1").kind).toBe('pet');
  });
});
