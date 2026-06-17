/**
 * Factuality resolution — fact / opinion / hypothetical / desire / uncertain / question.
 */
import type { LexicalAnalysisResult } from '../lexical/lexicalTypes';
import type { Factuality } from './meaningResolutionTypes';
import { padForScan } from '../lexical/lexicalNormalizer';

const HYPOTHETICAL = [
  'if i worked', 'if i were', 'if i was', 'wish i was', 'wish i were',
  'hypothetically', 'imagine if', 'pretend', 'in an alternate',
];
const DESIRE = [
  'want to work', 'want to be', 'want to move', 'hope to', 'would like to',
  'dream of', 'aspire to', 'looking to become',
];
const UNCERTAIN = [
  'might', 'maybe', 'perhaps', 'possibly', 'could be', 'not sure', 'probably',
];
const OPINION = [
  'i think', 'i believe', 'i feel like', 'in my opinion', 'imo', 'is awesome',
  'is amazing', 'is terrible', 'is the future',
];

export function resolveFactuality(
  text: string,
  lexical: LexicalAnalysisResult
): { factuality: Factuality; certaintyLevel: number } {
  const padded = padForScan(text);
  const trimmed = text.trim();

  if (trimmed.endsWith('?') || /\b(should i|what if|how do i)\b/i.test(trimmed)) {
    return { factuality: 'question', certaintyLevel: Math.min(lexical.confidence, 0.4) };
  }

  for (const cue of HYPOTHETICAL) {
    if (padded.includes(cue)) {
      return { factuality: 'hypothetical', certaintyLevel: 0.2 };
    }
  }

  for (const cue of DESIRE) {
    if (padded.includes(cue)) {
      return { factuality: 'desire', certaintyLevel: 0.35 };
    }
  }

  for (const cue of UNCERTAIN) {
    if (padded.includes(cue)) {
      return { factuality: 'uncertain', certaintyLevel: 0.45 };
    }
  }

  for (const cue of OPINION) {
    if (padded.includes(cue)) {
      return { factuality: 'opinion', certaintyLevel: 0.55 };
    }
  }

  return { factuality: 'fact', certaintyLevel: lexical.confidence || 0.65 };
}

export function allowsHardMemoryCandidate(factuality: Factuality, confidence: number): boolean {
  return factuality === 'fact' && confidence >= 0.55;
}

export function allowsPreferenceCandidate(factuality: Factuality): boolean {
  return factuality === 'desire' || factuality === 'opinion' || factuality === 'uncertain';
}
