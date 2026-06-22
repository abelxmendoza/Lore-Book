import { normalizeNameKey } from '../../../utils/nameNormalization';
import { attachPreferenceTarget, inferDomain } from './preferenceAttachmentService';
import { scoreStrengthFromText } from './preferenceStrengthScorer';
import type { PreferenceSignal } from './preferenceInferenceTypes';

const IMPLICIT_PATTERNS: Array<{
  re: RegExp;
  displayName: string;
  preferenceType: PreferenceSignal['preferenceType'];
  confidence: number;
}> = [
  {
    re: /\b(?:went to|go to|going to)\s+ska shows?\s+(?:all the time|often|a lot)\b/i,
    displayName: 'ska live music',
    preferenceType: 'affinity',
    confidence: 0.76,
  },
  {
    re: /\bstayed home and (?:made|worked on|built)\s+LoreBook\b/i,
    displayName: 'LoreBook product-building priority',
    preferenceType: 'value',
    confidence: 0.74,
  },
  {
    re: /\bworks? on LoreBook at night\b/i,
    displayName: 'nighttime LoreBook work',
    preferenceType: 'habit',
    confidence: 0.72,
  },
  {
    re: /\b(?:train(?:s|ing)?|practice(?:s|ing)?)\s+Muay Thai\b/i,
    displayName: 'Muay Thai training',
    preferenceType: 'habit',
    confidence: 0.78,
  },
  {
    re: /\buses? Duolingo\b/i,
    displayName: 'Duolingo language learning',
    preferenceType: 'habit',
    confidence: 0.74,
  },
  {
    re: /\b(?:into|interested in)\s+robotics\b/i,
    displayName: 'robotics',
    preferenceType: 'affinity',
    confidence: 0.72,
  },
];

export function inferImplicitPreferences(text: string): PreferenceSignal[] {
  const out: PreferenceSignal[] = [];
  const seen = new Set<string>();

  for (const { re, displayName, preferenceType, confidence } of IMPLICIT_PATTERNS) {
    const match = re.exec(text);
    if (!match) continue;
    const key = normalizeNameKey(displayName);
    if (seen.has(key)) continue;
    seen.add(key);

    const domain = inferDomain(displayName, text);
    out.push({
      displayName,
      preferenceType,
      domain,
      strength: scoreStrengthFromText(text, preferenceType),
      attachedTo: attachPreferenceTarget(displayName, text, domain),
      evidencePhrases: [match[0]],
      sourceMessageIds: [],
      confidence,
      inferredNotConfirmed: true,
      requiresReview: false,
      temporal: { currentStatus: 'uncertain', evidenceCount: 1 },
      promotionStatus: 'weak_signal',
    });
  }

  return out;
}
