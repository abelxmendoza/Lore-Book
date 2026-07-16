import { describe, expect, it } from 'vitest';
import {
  classifyComposerIntentFast,
  composerIntentToWorkingMemoryIntent,
} from '../../../src/services/chat/composerIntentFastPath';
import { classifyIntentWithSource } from '../../../src/services/chat/workingMemoryAssembler';

describe('composerIntentFastPath → planner', () => {
  it('Who am I? → identity retrieval via deterministic fast path', () => {
    const fast = classifyComposerIntentFast('Who am I?');
    expect(fast).toEqual({
      intent: 'identity_query',
      source: 'deterministic_fast_path',
      subject: 'current_user',
    });
    expect(composerIntentToWorkingMemoryIntent(fast!.intent)).toBe('IDENTITY_QUERY');

    const classified = classifyIntentWithSource('Who am I?');
    expect(classified.intent).toBe('IDENTITY_QUERY');
    expect(classified.intentSource).toBe('deterministic_fast_path');
    expect(classified.subject).toBe('current_user');
  });

  it('Tell me my life story. → narrative synthesis (LIFE_REVIEW) via fast path', () => {
    const classified = classifyIntentWithSource('Tell me my life story.');
    expect(classified.intent).toBe('LIFE_REVIEW');
    expect(classified.intentSource).toBe('deterministic_fast_path');
    expect(classified.subject).toBe('current_user');
  });

  it('What kind of person do you think I am? → personality/identity synthesis via fast path', () => {
    const classified = classifyIntentWithSource('What kind of person do you think I am?');
    expect(classified.intent).toBe('IDENTITY_QUERY');
    expect(classified.intentSource).toBe('deterministic_fast_path');
    expect(classified.subject).toBe('current_user');
  });

  it('ambiguous third-party questions stay on the rule classifier', () => {
    const classified = classifyIntentWithSource('Who is Marcus?');
    expect(classified.intent).toBe('PERSON_QUERY');
    expect(classified.intentSource).toBe('model_or_rule_classifier');
    expect(classified.subject).toBeUndefined();
  });
});
