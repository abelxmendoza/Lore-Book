/**
 * UNIT — affect (felt-emotion) stance detector + merge bridge.
 */
import { describe, expect, it } from 'vitest';

import {
  affectEmotionDrafts,
  detectAffectStances,
  hasAffectCue,
  mergeAffectEmotions,
} from '../../src/services/ontology/affectStance';

const one = (text: string) => detectAffectStances(text)[0];

describe('affectStance — positive detection', () => {
  const cases = [
    { text: 'I feel so grateful today', emotion: 'gratitude', surface: 'grateful' },
    { text: "I'm really anxious about the meeting", emotion: 'anxiety', surface: 'anxious' },
    { text: 'I felt exhausted after the week', emotion: 'exhaustion', surface: 'exhausted' },
    { text: 'Feeling really frustrated with the commute', emotion: 'frustration', surface: 'frustrated' },
  ];
  it.each(cases)('detects $emotion from "$text"', ({ text, emotion, surface }) => {
    const s = one(text);
    expect(s?.emotion).toBe(emotion);
    expect(s?.surface).toBe(surface);
    expect(s?.attributedToSelf).toBe(true);
    expect(s?.intensity).toBeGreaterThan(0.5);
  });
});

describe('affectStance — pollution guards', () => {
  it.each([
    "I'd feel better if I slept",
    'I used to feel anxious all the time',
    "I don't feel happy",
    'I feel like going home',
    'I feel that he was wrong',
    'It feels like rain outside.',
    'Had coffee and wrote in my journal.',
  ])('drops: "%s"', (text) => {
    expect(detectAffectStances(text)).toEqual([]);
  });

  it('third-party affect is detected but excluded from emotion drafts', () => {
    expect(detectAffectStances('She felt anxious about the deadline')[0]?.attributedToSelf).toBe(false);
    expect(affectEmotionDrafts('She felt anxious about the deadline')).toEqual([]);
  });
});

describe('affectStance — emotion drafts + cue gate', () => {
  it('maps self feelings to emotion drafts', () => {
    const drafts = affectEmotionDrafts('I feel really drained after work');
    expect(drafts).toContainEqual(
      expect.objectContaining({ emotion: 'exhaustion', source: 'lexical' })
    );
  });

  it('dedupes multiple cues for the same canonical emotion in one text', () => {
    const drafts = affectEmotionDrafts('I feel anxious and nervous about tomorrow');
    expect(drafts.filter((d) => d.emotion === 'anxiety')).toHaveLength(1);
  });

  it('hasAffectCue gates on self-attributed feelings', () => {
    expect(hasAffectCue('I feel angry about how that went')).toBe(true);
    expect(hasAffectCue('We shipped the feature on time.')).toBe(false);
  });
});

describe('mergeAffectEmotions', () => {
  it('keeps lexical-only emotions when LLM returns nothing (fallback path)', () => {
    const lexical = affectEmotionDrafts('I feel grateful for my family');
    const merged = mergeAffectEmotions(lexical, []);
    expect(merged).toHaveLength(1);
    expect(merged[0].emotion).toBe('gratitude');
    expect(merged[0].metadata.source).toBe('lexical');
  });

  it('boosts intensity when lexical and LLM agree', () => {
    const lexical = affectEmotionDrafts('I feel anxious about the presentation');
    const merged = mergeAffectEmotions(lexical, [{ emotion: 'anxiety', intensity: 0.6 }]);
    expect(merged).toHaveLength(1);
    expect(merged[0].metadata.lexicalConfirmed).toBe(true);
    expect(merged[0].intensity).toBeGreaterThan(0.6);
  });

  it('passes through unmatched LLM emotions', () => {
    const merged = mergeAffectEmotions([], [{ emotion: 'nostalgia', intensity: 0.5 }]);
    expect(merged).toHaveLength(1);
    expect(merged[0].metadata.source).toBe('llm');
  });
});
