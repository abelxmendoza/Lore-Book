/**
 * Stance single-source-of-truth invariants.
 *
 * STANCE_* glossary entries are the one place preference/epistemic/affect cue
 * vocabulary is declared. The stance extractors derive their lexicons from
 * `stancePhraseSpecs`, `stanceVerbSpecs`, and `affectEmotionLexicon()`.
 */
import { describe, expect, it } from 'vitest';

import {
  affectEmotionLexicon,
  stancePhraseSpecs,
  stanceVerbSpecs,
} from '../../src/services/ontology/glossary';
import { detectPreferenceStances } from '../../src/services/ontology/preferenceStance';
import { detectEpistemicStances } from '../../src/services/ontology/epistemicStance';
import { detectAffectStances } from '../../src/services/ontology/affectStance';

describe('stance glossary SSOT', () => {
  it('stancePhraseSpecs covers preference like/dislike phrases', () => {
    const phrases = stancePhraseSpecs('STANCE_PREFERENCE').map((p) => p.phrase);
    expect(phrases).toContain("can't stand");
    expect(phrases).toContain('obsessed with');
    expect(phrases).toContain('not a fan of');
  });

  it('stanceVerbSpecs expands verb conjugations for preference', () => {
    const verbs = stanceVerbSpecs('STANCE_PREFERENCE');
    expect(verbs.love?.kind).toBe('LIKE');
    expect(verbs.loves?.kind).toBe('LIKE');
    expect(verbs.hate?.kind).toBe('DISLIKE');
  });

  it('stancePhraseSpecs covers epistemic belief/doubt/realization phrases', () => {
    const phrases = stancePhraseSpecs('STANCE_EPISTEMIC').map((p) => p.phrase);
    expect(phrases).toContain('i believe that');
    expect(phrases).toContain('i wonder if');
    expect(phrases).toContain('it dawned on me that');
  });

  it('affectEmotionLexicon maps surfaces to canonical labels', () => {
    const lex = affectEmotionLexicon();
    expect(lex.anxious?.canonical).toBe('anxiety');
    expect(lex.happy?.canonical).toBe('joy');
    expect(lex.overwhelmed?.canonical).toBe('anxiety');
  });

  it('preferenceStance still detects glossary-derived cues end-to-end', () => {
    const stances = detectPreferenceStances("I'm obsessed with bjj and can't stand crowds.");
    expect(stances.some((s) => s.polarity === 'LIKE' && s.target.includes('bjj'))).toBe(true);
    expect(stances.some((s) => s.polarity === 'DISLIKE' && s.target.includes('crowd'))).toBe(true);
  });

  it('epistemicStance still detects glossary-derived cues end-to-end', () => {
    const stances = detectEpistemicStances('I believe that hard work pays off.');
    expect(stances.some((s) => s.kind === 'BELIEVE' && s.proposition.includes('hard work'))).toBe(true);
  });

  it('affectStance still detects glossary-derived cues end-to-end', () => {
    const stances = detectAffectStances("I'm anxious about the interview.");
    expect(stances.some((s) => s.emotion === 'anxiety' && s.attributedToSelf)).toBe(true);
  });
});
