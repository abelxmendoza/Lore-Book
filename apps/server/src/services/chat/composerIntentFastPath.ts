/**
 * High-confidence deterministic intent fast path for self/identity questions.
 * Feeds Working Memory / query planner — does not replace ambiguous classification.
 */

export type ComposerQueryIntent =
  | 'identity_query'
  | 'life_story_query'
  | 'longitudinal_profile_query'
  | 'personality_synthesis_query';

export type IntentSource = 'deterministic_fast_path' | 'model_or_rule_classifier';

export type ComposerIntentHit = {
  intent: ComposerQueryIntent;
  source: 'deterministic_fast_path';
  subject: 'current_user';
};

const RULES: Array<{ intent: ComposerQueryIntent; pattern: RegExp }> = [
  {
    intent: 'personality_synthesis_query',
    pattern:
      /\b(?:what kind of person(?: do you think)? i am|who do you think i am|how would you describe (?:me|my personality)|what(?:'s| is) my personality)\b/i,
  },
  {
    intent: 'life_story_query',
    pattern:
      /\b(?:tell me my life story|my life story|life story|story of (?:my|my own) life|summarize my life|biography|narrate my life)\b/i,
  },
  {
    intent: 'longitudinal_profile_query',
    pattern:
      /\b(?:what do you know about me|what have you learned about me|everything you know about me|my profile|longitudinal)\b/i,
  },
  {
    intent: 'identity_query',
    pattern:
      /\b(?:who am i|what am i like|describe me|my identity|what defines me|what matters to me)\b/i,
  },
];

export function classifyComposerIntentFast(text: string): ComposerIntentHit | null {
  const t = text.trim();
  if (!t) return null;
  for (const rule of RULES) {
    if (rule.pattern.test(t)) {
      return { intent: rule.intent, source: 'deterministic_fast_path', subject: 'current_user' };
    }
  }
  return null;
}

/** Map composer intents onto WorkingMemoryAssembler intents. */
export function composerIntentToWorkingMemoryIntent(
  intent: ComposerQueryIntent,
): 'IDENTITY_QUERY' | 'LIFE_REVIEW' | 'ARC_QUERY' {
  switch (intent) {
    case 'life_story_query':
      // Narrative synthesis over the user's longitudinal autobiography.
      return 'LIFE_REVIEW';
    case 'personality_synthesis_query':
    case 'longitudinal_profile_query':
    case 'identity_query':
    default:
      return 'IDENTITY_QUERY';
  }
}
