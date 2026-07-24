/**
 * Monetization classification — not "could theoretically be paid".
 */

import type { SkillMonetizationV2 } from './skillCognitionTypes';

export function classifySkillMonetization(input: {
  evidenceText?: string;
  entityType?: string;
  proposed?: string;
}): { monetization: SkillMonetizationV2; reasons: string[] } {
  const text = input.evidenceText ?? '';
  const reasons: string[] = [];

  if (/\b(?:salary|paycheck|hired|full[- ]time|contractor|freelance\s+client|paid\s+(?:me|work|gig))\b/i.test(text)) {
    reasons.push('currently_paid_language');
    return { monetization: 'currently_paid', reasons };
  }
  if (/\b(?:used\s+to\s+(?:get\s+)?paid|former(?:ly)?\s+paid|previous\s+job)\b/i.test(text)) {
    reasons.push('previously_paid_language');
    return { monetization: 'previously_paid', reasons };
  }
  if (/\b(?:sold|clients?|commission|marketplace|shipped\s+product)\b/i.test(text)) {
    reasons.push('market_validated');
    return { monetization: 'directly_market_validated', reasons };
  }
  if (/\b(?:interview|job\s+search|resume|career|portfolio|professional)\b/i.test(text)) {
    reasons.push('career_relevant');
    return { monetization: 'career_relevant', reasons };
  }

  // Explicit hobby / play / social leisure
  if (
    /\b(?:hobby|for\s+fun|clubbing|fandom|anime|cosplay|k-?pop)\b/i.test(text)
    || input.entityType === 'HOBBY'
    || input.entityType === 'ACTIVITY'
    || input.entityType === 'INTEREST'
  ) {
    reasons.push('hobby_or_leisure');
    return { monetization: 'hobby_only', reasons };
  }

  if (
    input.entityType === 'RESPONSIBILITY'
    || input.entityType === 'PROCESS'
    || input.entityType === 'PROJECT'
  ) {
    reasons.push('not_applicable_entity');
    return { monetization: 'not_applicable', reasons };
  }

  // Do NOT map LLM "potentially_paid" defaults to anything assertive
  if (input.proposed === 'potentially_paid' || input.proposed === 'paid') {
    reasons.push('proposed_ignored_without_evidence');
    return { monetization: 'unknown', reasons };
  }

  reasons.push('unknown_default');
  return { monetization: 'unknown', reasons };
}
