import { describe, it, expect } from 'vitest';

import {
  hasQuestSignal,
  hasProgressSignal,
  hasSkillSignal,
  hasProjectSignal,
  hasInterestSignal,
  hasLifeChangeSignal,
  hasAnyExtractionSignal,
} from './extractionSignals';

describe('extractionSignals — pre-LLM fan-out gates', () => {
  // The core fix: plain narration / questions / greetings must trip NO gate, so
  // the per-message extractor cluster (6 LLM calls) is skipped entirely.
  const inertMessages = [
    'had coffee with Maria',
    'she works at a hospital downtown',
    'what time is it',
    'hey, how are you',
    'it was raining all day yesterday',
    'my brother called me',
  ];

  it('skips the entire cluster for messages with no relevant signal', () => {
    for (const msg of inertMessages) {
      expect(hasAnyExtractionSignal(msg), `should be inert: "${msg}"`).toBe(false);
    }
  });

  it('detects quest / goal intent', () => {
    expect(hasQuestSignal('I want to run a marathon next year')).toBe(true);
    expect(hasQuestSignal('my goal is to save $10k')).toBe(true);
    expect(hasQuestSignal('I had a sandwich')).toBe(false);
  });

  it('detects progress updates', () => {
    expect(hasProgressSignal("I'm 50% done with the course")).toBe(true);
    expect(hasProgressSignal('finally finished the first draft')).toBe(true);
    expect(hasProgressSignal('we went to the park')).toBe(false);
  });

  it('detects skill practice', () => {
    expect(hasSkillSignal("I'm learning Spanish")).toBe(true);
    expect(hasSkillSignal('been practicing guitar every day')).toBe(true);
    expect(hasSkillSignal('she is tall')).toBe(false);
  });

  it('detects project work', () => {
    expect(hasProjectSignal('working on a side project this weekend')).toBe(true);
    expect(hasProjectSignal('we shipped the new feature')).toBe(true);
    expect(hasProjectSignal('the weather is nice')).toBe(false);
  });

  it('detects interests', () => {
    expect(hasInterestSignal('I love hiking')).toBe(true);
    expect(hasInterestSignal("I'm really into photography lately")).toBe(true);
    expect(hasInterestSignal('I parked the car')).toBe(false);
  });

  it('detects life changes', () => {
    expect(hasLifeChangeSignal('I quit my job today')).toBe(true);
    expect(hasLifeChangeSignal('we just moved to Austin')).toBe(true);
    expect(hasLifeChangeSignal('I ate breakfast')).toBe(false);
  });

  it('handles curly apostrophes and casing', () => {
    expect(hasInterestSignal('I’M REALLY INTO climbing')).toBe(true);
    expect(hasQuestSignal('I’ll finish the book')).toBe(true);
  });
});
