import { normalizeNameKey } from '../../../utils/nameNormalization';
import { attachPreferenceTarget, inferDomain } from './preferenceAttachmentService';
import { scoreStrengthFromText } from './preferenceStrengthScorer';
import type { PreferenceSignal, PreferenceType } from './preferenceInferenceTypes';

type ExplicitPattern = {
  re: RegExp;
  preferenceType: PreferenceType;
  confidence: number;
  label: (match: RegExpExecArray) => string;
};

const EXPLICIT_PATTERNS: ExplicitPattern[] = [
  {
    re: /\bI like ([^.!?,]{2,60})/gi,
    preferenceType: 'like',
    confidence: 0.88,
    label: (m) => cleanLabel(m[1]),
  },
  {
    re: /\bI love ([^.!?,]{2,60})/gi,
    preferenceType: 'like',
    confidence: 0.9,
    label: (m) => cleanLabel(m[1]),
  },
  {
    re: /\bI hate ([^.!?,]{2,60})/gi,
    preferenceType: 'dislike',
    confidence: 0.9,
    label: (m) => cleanLabel(m[1]),
  },
  {
    re: /\bI prefer ([^.!?,]{2,60})/gi,
    preferenceType: 'like',
    confidence: 0.88,
    label: (m) => cleanLabel(m[1]),
  },
  {
    re: /\bI'?m into ([^.!?,]{2,60})/gi,
    preferenceType: 'affinity',
    confidence: 0.86,
    label: (m) => cleanLabel(m[1]),
  },
  {
    re: /\bI don'?t like ([^.!?,]{2,60})/gi,
    preferenceType: 'dislike',
    confidence: 0.88,
    label: (m) => cleanLabel(m[1]),
  },
  {
    re: /\bI don'?t want ([^.!?,]{2,60})/gi,
    preferenceType: 'avoidance',
    confidence: 0.86,
    label: (m) => cleanLabel(m[1]),
  },
  {
    re: /\bI want ([^.!?,]{2,60})/gi,
    preferenceType: 'value',
    confidence: 0.84,
    label: (m) => cleanLabel(m[1]),
  },
];

function collectMatches(re: RegExp, text: string): RegExpExecArray[] {
  const flags = re.flags.includes('g') ? re.flags : `${re.flags}g`;
  return [...text.matchAll(new RegExp(re.source, flags))] as RegExpExecArray[];
}

function cleanLabel(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ').replace(/^(?:to|the|a|an)\s+/i, '');
}

function makeSignal(
  displayName: string,
  text: string,
  evidence: string,
  preferenceType: PreferenceType,
  confidence: number,
  explicit: boolean,
): PreferenceSignal {
  const domain = inferDomain(displayName, text);
  const strength = scoreStrengthFromText(text, preferenceType);
  return {
    displayName,
    preferenceType,
    domain,
    strength,
    attachedTo: attachPreferenceTarget(displayName, text, domain),
    evidencePhrases: [evidence],
    sourceMessageIds: [],
    confidence,
    inferredNotConfirmed: !explicit,
    requiresReview: false,
    temporal: { currentStatus: 'current', evidenceCount: 1 },
    promotionStatus: 'candidate',
  };
}

export function inferExplicitPreferences(text: string): PreferenceSignal[] {
  const out: PreferenceSignal[] = [];
  const seen = new Set<string>();

  for (const { re, preferenceType, confidence, label } of EXPLICIT_PATTERNS) {
    for (const match of collectMatches(re, text)) {
      const displayName = label(match);
      const key = normalizeNameKey(displayName);
      if (!displayName || seen.has(key)) continue;
      seen.add(key);
      out.push(makeSignal(displayName, text, match[0], preferenceType, confidence, true));
    }
  }

  return out;
}
