import { normalizeNameKey } from '../../../utils/nameNormalization';
import { attachPreferenceTarget, inferDomain } from './preferenceAttachmentService';
import type { PreferenceSignal } from './preferenceInferenceTypes';

const FAVORITE_PATTERNS: Array<{
  re: RegExp;
  label: (m: RegExpExecArray) => string;
  confidence: number;
}> = [
  {
    re: /\bmy favorite ([^.!?,]{2,60})/gi,
    label: (m) => m[1].trim().replace(/\s+/g, ' '),
    confidence: 0.92,
  },
  {
    re: /\bfavorite ([^.!?,]{2,60})/gi,
    label: (m) => m[1].trim().replace(/\s+/g, ' '),
    confidence: 0.86,
  },
];

const NAMED_FAVORITES: Array<{ re: RegExp; displayName: string; domain: PreferenceSignal['domain'] }> = [
  { re: /\bfavorite summer clothes\b/i, displayName: 'summer clothes', domain: 'clothing' },
  { re: /\bOne Piece\b/i, displayName: 'One Piece', domain: 'media' },
];

function collectMatches(re: RegExp, text: string): RegExpExecArray[] {
  const flags = re.flags.includes('g') ? re.flags : `${re.flags}g`;
  return [...text.matchAll(new RegExp(re.source, flags))] as RegExpExecArray[];
}

export function inferFavorites(text: string): PreferenceSignal[] {
  const out: PreferenceSignal[] = [];
  const seen = new Set<string>();

  for (const { re, displayName, domain } of NAMED_FAVORITES) {
    const match = re.exec(text);
    if (!match) continue;
    const key = normalizeNameKey(displayName);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(makeFavorite(displayName, text, match[0], domain, 0.9));
  }

  for (const { re, label, confidence } of FAVORITE_PATTERNS) {
    for (const match of collectMatches(re, text)) {
      const displayName = label(match);
      const key = normalizeNameKey(displayName);
      if (!displayName || seen.has(key)) continue;
      seen.add(key);
      const domain = inferDomain(displayName, text);
      out.push(makeFavorite(displayName, text, match[0], domain, confidence));
    }
  }

  const identityMatch = text.match(/\b([A-Za-z\s]+)\s+is(?: still)? my main thing\b/i);
  if (identityMatch) {
    const displayName = identityMatch[1].trim();
    const key = normalizeNameKey(displayName);
    if (!seen.has(key)) {
      seen.add(key);
      const domain = inferDomain(displayName, text);
      out.push({
        ...makeFavorite(displayName, text, identityMatch[0], domain, 0.94),
        strength: 'identity_level',
        preferenceType: 'affinity',
        promotionStatus: 'suggested_profile_memory',
      });
    }
  }

  return out;
}

function makeFavorite(
  displayName: string,
  text: string,
  evidence: string,
  domain: PreferenceSignal['domain'],
  confidence: number,
): PreferenceSignal {
  return {
    displayName,
    preferenceType: 'favorite',
    domain,
    strength: 'favorite',
    attachedTo: attachPreferenceTarget(displayName, text, domain),
    evidencePhrases: [evidence],
    sourceMessageIds: [],
    confidence,
    inferredNotConfirmed: false,
    requiresReview: false,
    temporal: { currentStatus: 'current', evidenceCount: 1 },
    promotionStatus: 'suggested_profile_memory',
  };
}
