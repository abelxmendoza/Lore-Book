import { describe, expect, it } from 'vitest';

import { classifySentence, mayBecomeMoment } from './sentenceClassifier';

describe('sentenceClassifier', () => {
  it('classifies profile / state / emotion as non-events', () => {
    expect(classifySentence("I'm a software developer.").kind).toBe('PROFILE');
    expect(classifySentence('I am unemployed.').kind).toBe('STATE');
    expect(classifySentence('I miss Jamie.').kind).toBe('EMOTION');
    expect(classifySentence('Can build apps').kind).toBe('FACT');
    expect(mayBecomeMoment('PROFILE')).toBe(false);
    expect(mayBecomeMoment('STATE')).toBe(false);
  });

  it('classifies concrete happenings as EVENT', () => {
    expect(classifySentence('I met Kelly today at Vanguard Robotics.').kind).toBe('EVENT');
    expect(classifySentence('Jamie blocked me on Instagram.').kind).toBe('EVENT');
    expect(classifySentence('I started onboarding at MemoVault.').kind).toBe('EVENT');
    expect(mayBecomeMoment('EVENT')).toBe(true);
  });

  it('ignores greetings and chat tests', () => {
    expect(classifySentence('Hi I am Marcus').kind).toBe('IGNORE');
    expect(classifySentence('testing the chat improvements').kind).toBe('IGNORE');
  });

  it('treats goals as non-events', () => {
    expect(classifySentence('I want to see an underground artist someday.').kind).toBe('GOAL');
  });
});
