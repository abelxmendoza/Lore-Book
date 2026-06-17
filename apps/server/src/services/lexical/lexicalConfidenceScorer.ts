/**
 * Aggregate confidence scoring and ambiguity detection.
 */
import type { LexicalAnalysisResult } from './lexicalTypes';

export function scoreLexicalConfidence(partial: Omit<LexicalAnalysisResult, 'confidence' | 'ambiguityFlags' | 'needsClarification'>): {
  confidence: number;
  ambiguityFlags: string[];
  needsClarification: boolean;
} {
  const scores: number[] = [];
  const ambiguityFlags: string[] = [];

  if (partial.entities.length) {
    scores.push(avg(partial.entities.map((e) => e.confidence)));
  }
  if (partial.skills.length) {
    scores.push(avg(partial.skills.map((s) => s.confidence)));
  }
  if (partial.glossaryMatches.length) {
    scores.push(avg(partial.glossaryMatches.map((g) => g.confidence)));
  }
  if (partial.intents.length) {
    scores.push(avg(partial.intents.map((i) => i.confidence)));
  }

  const lowConfidenceEntities = partial.entities.filter((e) => e.confidence < 0.5);
  if (lowConfidenceEntities.length > 2) {
    ambiguityFlags.push('multiple_low_confidence_entities');
  }

  const identityClaims = partial.entities.filter((e) => e.type === 'IDENTITY_CLAIM');
  const persons = partial.entities.filter((e) => e.type === 'PERSON');
  if (identityClaims.length && persons.length > 1) {
    ambiguityFlags.push('identity_disambiguation_needed');
  }

  const disambiguate = partial.intents.some((i) => i.kind === 'DISAMBIGUATE');
  if (disambiguate) {
    ambiguityFlags.push('same_name_multiple_roles');
  }

  const hobbyPaidUnknown = partial.skills.filter((s) => s.hobby_or_paid === 'unknown');
  if (hobbyPaidUnknown.length > 0 && partial.skills.some((s) => /\bworked\b/i.test(partial.normalizedText))) {
    ambiguityFlags.push('skill_hobby_vs_paid_unclear');
  }

  const conflictingEmotions = partial.emotions.filter((e) => e.valence === 'mixed' || e.valence === 'negative');
  if (conflictingEmotions.length >= 2) {
    ambiguityFlags.push('mixed_emotional_tone');
  }

  if (partial.entities.length === 0 && partial.skills.length === 0 && partial.glossaryMatches.length === 0) {
    ambiguityFlags.push('sparse_signals');
    scores.push(0.25);
  }

  const confidence = scores.length ? clamp(avg(scores)) : 0.3;
  const needsClarification =
    ambiguityFlags.includes('identity_disambiguation_needed') ||
    ambiguityFlags.includes('same_name_multiple_roles') ||
    (ambiguityFlags.length > 0 && confidence < 0.75);

  return { confidence, ambiguityFlags, needsClarification };
}

function avg(nums: number[]): number {
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function clamp(n: number): number {
  return Math.max(0, Math.min(1, Math.round(n * 1000) / 1000));
}
