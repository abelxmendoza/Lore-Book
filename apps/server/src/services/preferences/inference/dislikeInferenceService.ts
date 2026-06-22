import { normalizeNameKey } from '../../../utils/nameNormalization';
import { attachPreferenceTarget, inferDomain } from './preferenceAttachmentService';
import type { PreferenceSignal } from './preferenceInferenceTypes';

const DISLIKE_PATTERNS: Array<{
  re: RegExp;
  label: (m: RegExpExecArray, text: string) => string;
  confidence: number;
}> = [
  {
    re: /\bI hate ([^.!?,]{2,60})/gi,
    label: (m) => m[1].trim(),
    confidence: 0.9,
  },
  {
    re: /\bI avoid ([^.!?,]{2,60})/gi,
    label: (m) => m[1].trim(),
    confidence: 0.86,
  },
  {
    re: /\bnot into ([^.!?,]{2,60})/gi,
    label: (m) => m[1].trim(),
    confidence: 0.82,
  },
  {
    re: /\bdon'?t care for ([^.!?,]{2,60})/gi,
    label: (m) => m[1].trim(),
    confidence: 0.8,
  },
];

const NAMED_AVOIDANCES: Array<{ re: RegExp; displayName: string }> = [
  {
    re: /\bI didn'?t want to drive(?: because it'?s a far drive)?/i,
    displayName: 'far driving',
  },
  {
    re: /\bdon'?t want to drive far\b/i,
    displayName: 'far driving',
  },
  {
    re: /\bhate(?:s)? fake memories\b/i,
    displayName: 'fake memories',
  },
  {
    re: /\bdon'?t want forgetful AI\b/i,
    displayName: 'forgetful AI',
  },
  {
    re: /\bdon'?t want generic AI\b/i,
    displayName: 'generic AI',
  },
  {
    re: /\bhate(?:s)? wrong memory\b/i,
    displayName: 'wrong memory',
  },
];

function collectMatches(re: RegExp, text: string): RegExpExecArray[] {
  const flags = re.flags.includes('g') ? re.flags : `${re.flags}g`;
  return [...text.matchAll(new RegExp(re.source, flags))] as RegExpExecArray[];
}

export function inferDislikes(text: string): PreferenceSignal[] {
  const out: PreferenceSignal[] = [];
  const seen = new Set<string>();

  for (const { re, displayName } of NAMED_AVOIDANCES) {
    const match = re.exec(text);
    if (!match) continue;
    const key = normalizeNameKey(displayName);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(makeAvoidance(displayName, text, match[0], 0.88));
  }

  for (const { re, label, confidence } of DISLIKE_PATTERNS) {
    for (const match of collectMatches(re, text)) {
      const displayName = label(match, text);
      const key = normalizeNameKey(displayName);
      if (!displayName || seen.has(key)) continue;
      seen.add(key);
      out.push(makeAvoidance(displayName, text, match[0], confidence));
    }
  }

  return out;
}

function makeAvoidance(
  displayName: string,
  text: string,
  evidence: string,
  confidence: number,
): PreferenceSignal {
  const domain = inferDomain(displayName, text);
  return {
    displayName,
    preferenceType: 'avoidance',
    domain,
    strength: /\bhate\b/i.test(text) ? 'strong' : 'medium',
    attachedTo: attachPreferenceTarget(displayName, text, domain),
    evidencePhrases: [evidence],
    sourceMessageIds: [],
    confidence,
    inferredNotConfirmed: !/\bI (?:hate|avoid|don'?t want)\b/i.test(text),
    requiresReview: false,
    temporal: { currentStatus: 'current', evidenceCount: 1 },
    promotionStatus: 'candidate',
  };
}
