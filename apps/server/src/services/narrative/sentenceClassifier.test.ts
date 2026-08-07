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

  it('classifies resolved choices as DECISION and lets them become Moments', () => {
    expect(classifySentence('I have to distance myself from the scene.').kind).toBe('DECISION');
    expect(classifySentence('I decided to move out.').kind).toBe('DECISION');
    expect(classifySentence("I'm done with the whole scene.").kind).toBe('DECISION');
    expect(mayBecomeMoment('DECISION')).toBe(true);
  });

  it('classifies realizations/hindsight as REFLECTION and lets them become Moments', () => {
    expect(classifySentence('I realized I need space.').kind).toBe('REFLECTION');
    expect(classifySentence('Looking back, I should have respected myself.').kind).toBe('REFLECTION');
    expect(mayBecomeMoment('REFLECTION')).toBe(true);
  });

  it('still prefers GOAL/OPINION over DECISION/REFLECTION when the aspirational cue fires first', () => {
    // Aspiration, not a made choice — must stay GOAL, not become DECISION.
    expect(classifySentence('I want to distance myself eventually.').kind).toBe('GOAL');
    // A belief, not a realization — must stay OPINION, not become REFLECTION.
    expect(classifySentence('I think she was right about that.').kind).toBe('OPINION');
  });

  it('still prefers a concrete action verb over DECISION when both are present', () => {
    // "quit" directly follows "I" — matches PERSONAL_EVENT before the DECISION check ever runs.
    expect(classifySentence('I quit the band.').kind).toBe('EVENT');
  });
});
