import { describe, expect, it } from 'vitest';

import {
  canonicalQuestIntentKey,
  isQuestCandidateTextAllowed,
  questTitlesSemanticallyMatch,
  resolveQuestEvidence,
} from './questCandidateBoundary';

describe('quest candidate boundary', () => {
  it('routes person and lore capture prompts away from quests', () => {
    const text = 'I want to talk about Taylor the recruiter. Help me capture who they are and how we know each other.';
    expect(isQuestCandidateTextAllowed(text, 'Capture Taylor in LoreBook')).toBe(false);
  });

  it('clusters a boundary intention with its explanatory variant', () => {
    expect(questTitlesSemanticallyMatch(
      'Stay away from the music scene',
      'Stay away from the music scene for self-respect',
    )).toBe(true);
    expect(questTitlesSemanticallyMatch(
      'Maintain distance from the music scene',
      'Stay away from the music scene',
    )).toBe(true);
    expect(canonicalQuestIntentKey('Maintain distance from the music scene'))
      .toBe('avoid music scene');
  });

  it('does not merge unrelated outcomes', () => {
    expect(questTitlesSemanticallyMatch('Pay off debt', 'Build a robotics career')).toBe(false);
  });

  it('accepts only an exact quote from a known user source', () => {
    const sources = [{ id: 'message-1', content: 'I plan to pay off my debt this year.', date: '2026-08-01' }];
    expect(resolveQuestEvidence('I plan to pay off my debt this year.', sources)).toEqual({
      text: 'I plan to pay off my debt this year.',
      sourceMessageId: 'message-1',
      observedAt: '2026-08-01',
    });
    expect(resolveQuestEvidence('I will become wealthy.', sources)).toBeNull();
  });
});
