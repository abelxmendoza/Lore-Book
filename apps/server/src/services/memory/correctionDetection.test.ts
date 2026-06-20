import { describe, it, expect } from 'vitest';

import { detectCorrectionIntent } from './correctionDetection';

describe('detectCorrectionIntent — recognizes corrections', () => {
  const corrections = [
    'Actually, her name is Maya, not Maria',
    'No, it\'s spelled differently',
    'Correction: the meeting was on Tuesday',
    "That's wrong — I started at Vanguard in 2024",
    'I meant my brother, not my cousin',
    'Not San Diego, it\'s San Francisco',
    'Her name is actually Kelly',
    'It should be 2023, not 2022',
    'Scratch that, that never happened',
    'Let me correct that',
  ];

  it.each(corrections)('flags: "%s"', (text) => {
    const result = detectCorrectionIntent(text);
    expect(result.isCorrection).toBe(true);
    expect(result.confidence).toBeGreaterThan(0.6);
    expect(result.matchedPattern).toBeTruthy();
  });
});

describe('detectCorrectionIntent — leaves ordinary conversation alone', () => {
  const ordinary = [
    'I went to San Diego last summer with Maya',
    'Can you tell me what you know about my projects?',
    'My favorite food is sushi',
    'We had a great time at the show',
    'What is the weather like today?',
    'I actually really enjoyed that trip', // "actually" without correction structure
    '',
    '   ',
  ];

  it.each(ordinary)('does not flag: "%s"', (text) => {
    expect(detectCorrectionIntent(text).isCorrection).toBe(false);
  });
});

describe('detectCorrectionIntent — robustness', () => {
  it('handles null/undefined/non-string input', () => {
    expect(detectCorrectionIntent(null).isCorrection).toBe(false);
    expect(detectCorrectionIntent(undefined).isCorrection).toBe(false);
    expect(detectCorrectionIntent(123 as unknown as string).isCorrection).toBe(false);
  });

  it('ignores very long pasted content (cheap heuristic only)', () => {
    const long = 'actually it is ' + 'x'.repeat(700);
    expect(detectCorrectionIntent(long).isCorrection).toBe(false);
  });

  it('returns the strongest matching pattern when several apply', () => {
    const result = detectCorrectionIntent("Correction: actually that's wrong, it's Maya");
    expect(result.isCorrection).toBe(true);
    expect(result.confidence).toBeGreaterThanOrEqual(0.86);
  });
});
