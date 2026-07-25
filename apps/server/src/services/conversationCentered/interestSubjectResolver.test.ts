import { describe, it, expect } from 'vitest';
import {
  characterAttributedInInterestText,
  characterSharedInterestWithUser,
  isFirstPersonInterestText,
  attributionReasonLabel,
} from './interestSubjectResolver';

describe('interestSubjectResolver', () => {
  it('detects first-person hobby language', () => {
    expect(isFirstPersonInterestText("I'm an avid duolingoer and make it a habit")).toBe(true);
    expect(isFirstPersonInterestText('I also watch anime on occasion')).toBe(true);
    expect(isFirstPersonInterestText('I wish to work in robotics, especially with drone technology')).toBe(true);
    expect(isFirstPersonInterestText('Mom loves knitting')).toBe(false);
  });

  it('detects third-person attribution to a named character', () => {
    expect(characterAttributedInInterestText('Mom', 'Mom loves knitting')).toBe(true);
    expect(characterAttributedInInterestText('Mom', "Mom's hobby is gardening")).toBe(true);
    expect(characterAttributedInInterestText('Mom', "I'm into martial arts")).toBe(false);
    expect(characterAttributedInInterestText('Jerry', 'Jerry is into music')).toBe(true);
  });

  it('detects shared interests that pertain to both people', () => {
    expect(characterSharedInterestWithUser('Mom', 'Mom and I both love gardening')).toBe(true);
    expect(characterSharedInterestWithUser('Jamie', 'Jamie and I watch anime together')).toBe(true);
    expect(characterSharedInterestWithUser('Mom', "I'm into Duolingo")).toBe(false);
    expect(characterSharedInterestWithUser('Mom', 'Mom loves knitting')).toBe(false);
  });

  it('labels attribution reasons for the UI', () => {
    expect(attributionReasonLabel('first_person_self')).toMatch(/yourself/i);
    expect(attributionReasonLabel('explicit_attribution')).toMatch(/them/i);
    expect(attributionReasonLabel('shared_with_user')).toMatch(/Shared/i);
    expect(attributionReasonLabel('co_mention_pollution_repair')).toMatch(/wrongly/i);
  });
});
