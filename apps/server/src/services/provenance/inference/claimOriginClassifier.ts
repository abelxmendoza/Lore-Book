import type { ProvenanceOrigin, ProvenanceSourceType } from './provenanceInferenceTypes';

const EXPLICIT_PATTERNS = [
  /\bI\s+(?:am|was|'m)\s+/i,
  /\bmy\s+(?:best\s+friend|boyfriend|girlfriend|wife|husband|partner|brother|sister|mom|dad|mother|father)\s+is\b/i,
  /\b(?:is|was)\s+my\s+(?:best\s+friend|boyfriend|girlfriend|wife|husband|partner)\b/i,
  /\bI\s+(?:like|love|hate|prefer|don't|do not)\b/i,
  /\bI\s+(?:work|worked)\s+(?:at|for)\b/i,
  /\bI\s+(?:live|lived)\s+(?:at|in|near)\b/i,
];

const IMPLICIT_PATTERNS = [
  /\bwe\s+(?:went|go|used to go)\s+to\b/i,
  /\b(?:together|with)\s+(?:at|in)\s+/i,
  /\b(?:schoolmate|classmate|coworker|colleague)\b/i,
];

const CORRECTION_PATTERNS = [
  /\b(?:actually|correction|I mean|no wait)\b/i,
  /\b(?:his|her|their)\s+name\s+is\b/i,
  /\b(?:not|isn't|wasn't)\s+\w+/i,
];

export function classifySourceType(
  authorRole: 'user' | 'assistant' | 'system',
  explicitSourceType?: ProvenanceSourceType,
): ProvenanceSourceType {
  if (explicitSourceType) return explicitSourceType;
  if (authorRole === 'assistant') return 'assistant_response';
  if (authorRole === 'system') return 'system_inference';
  return 'user_message';
}

export function isExplicitUserStatement(text: string): boolean {
  return EXPLICIT_PATTERNS.some((re) => re.test(text));
}

export function isImplicitUserStatement(text: string): boolean {
  return IMPLICIT_PATTERNS.some((re) => re.test(text));
}

export function isCorrectionPattern(text: string): boolean {
  return CORRECTION_PATTERNS.some((re) => re.test(text));
}

export function classifyOrigin(
  text: string,
  authorRole: 'user' | 'assistant' | 'system',
  opts: {
    sourceType?: ProvenanceSourceType;
    userConfirmed?: boolean;
    isInference?: boolean;
  } = {},
): ProvenanceOrigin {
  if (opts.sourceType === 'manual_edit') {
    return opts.userConfirmed ? 'user_confirmed' : 'user_corrected';
  }
  if (opts.sourceType === 'user_correction' || isCorrectionPattern(text)) {
    return 'user_corrected';
  }
  if (opts.userConfirmed) return 'user_confirmed';
  if (authorRole === 'assistant') return 'assistant_generated';
  if (authorRole === 'system' || opts.isInference) return 'system_inferred';
  if (isExplicitUserStatement(text)) return 'explicit_user_statement';
  if (isImplicitUserStatement(text)) return 'implicit_user_statement';
  return 'system_inferred';
}
