import { describe, it, expect } from 'vitest';
import {
  matchesFoundationRecallQuery,
  matchesEntityQuery,
  FAMILY_KIN_TERM_RE,
  detectSyncRecallIntent,
} from './recallIntentPatterns';

describe('recallIntentPatterns — real chat phrasings that previously fell through', () => {
  it('routes "what you know about my Mom?" to foundation recall (dropped "do", "mom" not "mother")', () => {
    expect(FAMILY_KIN_TERM_RE.test('what you know about my Mom?')).toBe(true);
    expect(matchesFoundationRecallQuery('what you know about my Mom?')).toBe(true);
    expect(detectSyncRecallIntent('what you know about my Mom?')).toBe('family');
  });

  it('routes "what do you know about my cousin Jerry or Abuela?" via the entity name embedded after the kinship qualifier', () => {
    const msg = 'what do you know about my cousin Jerry or Abuela?';
    expect(matchesEntityQuery(msg)).toBe(true);
    expect(matchesFoundationRecallQuery(msg)).toBe(true);
  });

  it('still matches other missing kin terms: dad, aunt, uncle, abuela, abuelo, tia, tio, sibling', () => {
    for (const term of ['dad', 'aunt', 'uncle', 'abuela', 'abuelo', 'tia', 'tio', 'sibling']) {
      const msg = `what do you know about my ${term}?`;
      expect(FAMILY_KIN_TERM_RE.test(msg)).toBe(true);
    }
  });

  it('still matches the original "tell me about my X" phrasing (no regression)', () => {
    expect(FAMILY_KIN_TERM_RE.test('tell me about my mother')).toBe(true);
    expect(FAMILY_KIN_TERM_RE.test('tell me about my cousin')).toBe(true);
  });

  it('still requires "do" or "you" — does not match unrelated sentences containing "my mom"', () => {
    expect(FAMILY_KIN_TERM_RE.test('my mom called me today')).toBe(false);
  });

  it('still matches bare-name entity queries unaffected by the kinship-qualifier strip', () => {
    expect(matchesEntityQuery('what do you know about Jerry?')).toBe(true);
    expect(matchesEntityQuery('who is Jerry')).toBe(true);
    expect(matchesEntityQuery('tell me about Sarah Connor')).toBe(true);
  });

  it('still excludes self/roster queries via the negative lookahead', () => {
    expect(matchesEntityQuery('what do you know about me')).toBe(false);
    expect(matchesEntityQuery('what do you know about myself')).toBe(false);
    expect(matchesEntityQuery('tell me about the characters')).toBe(false);
  });
});
