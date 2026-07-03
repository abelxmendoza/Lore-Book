/**
 * Work Status Resolver — detects current vs past/former work status from indicators.
 * Used for current occupation role snapshot.
 */
import type { StatusSignal } from '../../status/inference/statusInferenceTypes';

export interface WorkStatusResult {
  status: 'current' | 'former' | 'pending' | 'uncertain';
  confidence: number;
  evidence: string[];
  transition?: string;
}

const CURRENT_INDICATORS = [
  /\b(?:now working|currently working|currently at|working at|best job|my new (?:manager|job|role)|looking forward to work tomorrow)\b/i,
  /\bI['’]m (?:a|an|the) (?:QA|quality|technician|engineer|manager)\b/i,
];

const PAST_INDICATORS = [
  /\b(?:worked at|used to work|former|left|ended|quit|previous (?:job|role))\b/i,
];

export function resolveWorkStatus(text: string): WorkStatusResult {
  const evidence: string[] = [];
  let isCurrent = false;
  let isPast = false;

  for (const re of CURRENT_INDICATORS) {
    const match = text.match(re);
    if (match) {
      isCurrent = true;
      evidence.push(match[0]);
    }
  }

  for (const re of PAST_INDICATORS) {
    const match = text.match(re);
    if (match) {
      isPast = true;
      evidence.push(match[0]);
    }
  }

  let status: WorkStatusResult['status'] = 'uncertain';
  let confidence = 0.6;

  if (isCurrent && !isPast) {
    status = 'current';
    confidence = 0.88;
  } else if (isPast && !isCurrent) {
    status = 'former';
    confidence = 0.85;
  } else if (isCurrent && isPast) {
    status = 'uncertain';
    confidence = 0.5;
  }

  return {
    status,
    confidence,
    evidence,
    transition: isCurrent && isPast ? 'transition' : undefined,
  };
}

export function makeWorkStatusSignal(text: string, title?: string): StatusSignal | null {
  const result = resolveWorkStatus(text);
  if (result.status === 'uncertain' && result.confidence < 0.7) return null;

  return {
    attachedToType: 'work_role',
    inferredTitle: title || 'work role',
    status: result.status,
    transition: result.transition,
    evidencePhrases: result.evidence,
    sourceMessageIds: [],
    confidence: result.confidence,
    inferredNotConfirmed: true,
    requiresReview: false,
  };
}
