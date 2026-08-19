/**
 * Factuality resolution — fact / opinion / hypothetical / desire / uncertain / question.
 */
import { padForScan } from '../lexical/lexicalNormalizer';
import type { LexicalAnalysisResult } from '../lexical/lexicalTypes';

import type { Factuality } from './meaningResolutionTypes';

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

const TRAILING_RECALL_CHECK =
  /(?:^|[\n.!?]\s*)(?:this is (?:a )?repeated story[,.]?\s*)?(?:do you remember|have i told you (?:this|that) before|i (?:already )?told you (?:this|that) before)\??\s*$/i;

const INTERROGATIVE_START =
  /^(?:what|who|when|where|why|how|which|whose|whom|am|is|are|was|were|do|does|did|have|has|had|can|could|would|should|will|may|might)\b/i;

/**
 * Detect a turn whose job is to ask for information rather than contribute a
 * new autobiographical fact. Punctuation is optional because mobile/voice
 * input commonly omits the trailing question mark.
 */
export function isPureInterrogative(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (/[.!?]\s*i\s+(?:am|was|have|had|started|stopped|met|went|did|felt|worked|lived|made|built|released|got|left|joined|quit)\b/i.test(trimmed)) {
    return false;
  }
  if (TRAILING_RECALL_CHECK.test(trimmed) && hasSubstantiveStatementBeforeRecallQuestion(trimmed)) {
    return false;
  }
  if (trimmed.endsWith('?')) return true;
  return INTERROGATIVE_START.test(trimmed);
}

/**
 * A biographical deposit does not become "just a question" because the user
 * ends it with a memory check. The suffix asks for retrieval; the preceding
 * first-person statements still need ordinary memory processing.
 */
export function hasSubstantiveStatementBeforeRecallQuestion(text: string): boolean {
  const statement = text.trim().replace(TRAILING_RECALL_CHECK, '').trim();
  if (statement.length < 40) return false;
  if (!/\b(i|i'm|i've|my|me|we|our)\b/i.test(statement)) return false;
  return /[.!?\n]|\b(?:am|was|were|have|had|made|bought|went|worked|lived|met|created|posted|started|became)\b/i
    .test(statement);
}

export function resolveFactuality(
  text: string,
  lexical: LexicalAnalysisResult
): { factuality: Factuality; certaintyLevel: number } {
  const padded = padForScan(text);
  const trimmed = text.trim();

  if (isPureInterrogative(trimmed)) {
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
