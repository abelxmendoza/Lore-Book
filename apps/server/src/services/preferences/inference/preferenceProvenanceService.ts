import type { PreferenceSignal } from './preferenceInferenceTypes';

const SENSITIVE_PATTERNS = [
  /\b(?:tequila|vodka|whiskey|weed|drugs|cocaine|meth)\b/i,
  /\b(?:sex|sexual|hookup|onlyfans)\b/i,
  /\b(?:minor|underage|child)\b/i,
  /\b(?:violence|assault|weapon)\b/i,
  /\b(?:politics|republican|democrat|trump|biden)\b/i,
  /\b(?:diagnosis|medication|therapy|disorder)\b/i,
];

const THIRD_PARTY_PATTERNS = [
  /\b(?:they|he|she|them)\s+(?:had|have|likes?|loves?|hates?|wanted|prefers?)\b/i,
  /\b(?:someone|people|everyone)\s+(?:had|likes?|loves?)\b/i,
];

const QUOTED_PREFERENCE = /^["'“].+["'”]$/;

export function extractEvidencePhrases(text: string, span?: string): string[] {
  const sentences = text.split(/(?<=[.!?])\s+/);
  if (!span) return sentences.map((s) => s.trim()).filter(Boolean).slice(0, 4);
  const needle = span.toLowerCase();
  return sentences
    .filter((s) => s.toLowerCase().includes(needle))
    .map((s) => s.trim())
    .slice(0, 4);
}

export function isThirdPartyPreference(text: string): boolean {
  if (/\bI\s+(?:like|love|hate|prefer|don't|do not|am into|want)\b/i.test(text)) return false;
  return THIRD_PARTY_PATTERNS.some((re) => re.test(text));
}

export function isQuotedOnlyMention(text: string): boolean {
  const trimmed = text.trim();
  return QUOTED_PREFERENCE.test(trimmed);
}

export function requiresSensitiveReview(text: string, displayName: string): boolean {
  const blob = `${text} ${displayName}`;
  return SENSITIVE_PATTERNS.some((re) => re.test(blob));
}

export function hasProvenance(signal: PreferenceSignal): boolean {
  return (
    signal.sourceMessageIds.length > 0 &&
    signal.evidencePhrases.length > 0 &&
    Boolean(signal.displayName.trim())
  );
}

export function shouldCreatePreferenceCard(_signal: PreferenceSignal): boolean {
  return false;
}

export function evaluatePromotionStatus(
  signal: PreferenceSignal,
  opts: { mentionCount?: number; userConfirmed?: boolean },
): PreferenceSignal['promotionStatus'] {
  if (opts.userConfirmed) return 'confirmed_profile_memory';
  if (signal.strength === 'identity_level' || signal.strength === 'favorite') {
    return 'suggested_profile_memory';
  }
  if (signal.preferenceType === 'like' && /\bI (?:like|love|prefer|favorite)\b/i.test(signal.evidencePhrases[0] ?? '')) {
    return 'suggested_profile_memory';
  }
  if ((opts.mentionCount ?? signal.temporal.evidenceCount) >= 2) return 'suggested_profile_memory';
  if (signal.strength === 'strong') return 'candidate';
  if (signal.inferredNotConfirmed) return 'weak_signal';
  return 'candidate';
}
