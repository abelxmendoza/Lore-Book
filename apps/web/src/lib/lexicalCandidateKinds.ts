/**
 * Lexical preview candidate kinds — separates entities (visible chips) from
 * self-reference, intents, and rejected tokens (never shown as entity chips).
 */

import { isLexicalNoiseToken } from './lexicalNoiseTokens';
import { isSelfBleedLabel } from './selfChipLabel';

export type CandidateKind =
  | 'entity'
  | 'self_reference'
  | 'intent'
  | 'temporal'
  | 'relationship'
  | 'event'
  | 'rejected';

export type ComposerQueryIntent =
  | 'identity_query'
  | 'life_story_query'
  | 'longitudinal_profile_query'
  | 'personality_synthesis_query'
  | null;

/** Truncated / mid-phrase garbage like "Up My Degr..." */
export function isIncompleteFragment(text: string): boolean {
  const t = text.trim();
  if (!t) return true;
  if (/\.\.\.|…/.test(t)) return true;
  // Capitalized lead + possessive/determiner + short stub ("Up My Degr")
  if (/^[A-Z][\w']*\s+(?:My|Our|Your|The|A|An)\s+[A-Z][\w']{0,4}$/.test(t)) return true;
  // Ends on a suspiciously short token after my/our/your
  if (/\b(?:my|our|your)\s+[A-Za-z]{1,4}$/i.test(t) && !/\b(?:degree|school|job|team|work|home|life|story)\b/i.test(t)) {
    return true;
  }
  return false;
}

export function classifyComposerIntent(text: string): ComposerQueryIntent {
  const t = text.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!t) return null;

  if (
    /\b(?:what kind of person(?: do you think)? i am|who do you think i am|how would you describe (?:me|my personality)|what(?:'s| is) my personality)\b/.test(
      t,
    )
  ) {
    return 'personality_synthesis_query';
  }

  if (
    /\b(?:tell me my life story|my life story|life story|story of (?:my|my own) life|summarize my life|biography|narrate my life)\b/.test(
      t,
    )
  ) {
    return 'life_story_query';
  }

  if (
    /\b(?:what do you know about me|what have you learned about me|everything you know about me|my profile|longitudinal)\b/.test(
      t,
    )
  ) {
    return 'longitudinal_profile_query';
  }

  if (/\b(?:who am i|what am i like|describe me|my identity|what defines me|what matters to me)\b/.test(t)) {
    return 'identity_query';
  }

  return null;
}

/**
 * Classify a surface span for composer rendering.
 * Only `entity` (and optionally relationship/event) may become visible chips.
 */
export function classifyLexicalCandidate(text: string): CandidateKind {
  const t = text.trim();
  if (!t) return 'rejected';
  if (isIncompleteFragment(t)) return 'rejected';
  if (isSelfBleedLabel(t) || isLexicalNoiseToken(t)) {
    if (/^(?:i|me|my|mine|myself|you|your|yours|yourself)$/i.test(t) || isSelfBleedLabel(t)) {
      return 'self_reference';
    }
    // Interrogatives / commands are planner intents, not entities.
    if (/^(?:who|what|when|where|why|how|which|tell|show|explain|describe|list)$/i.test(t)) {
      return 'intent';
    }
    return 'rejected';
  }
  return 'entity';
}

/** True when a span may appear as a normal composer entity chip. */
export function isVisibleEntityCandidate(text: string): boolean {
  return classifyLexicalCandidate(text) === 'entity';
}
