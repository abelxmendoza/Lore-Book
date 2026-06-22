import { normalizeNameKey } from '../../../utils/nameNormalization';
import type { PreferenceSignal } from './preferenceInferenceTypes';

const TASTE_CLUSTERS: Array<{
  re: RegExp;
  displayName: string;
  cluster: string;
  confidence: number;
}> = [
  { re: /\b(?:gothic|occult|mystical)\b/i, displayName: 'gothic/occult aesthetic', cluster: 'gothic/occult', confidence: 0.82 },
  { re: /\b(?:dark purple|mystical fantasy)\b/i, displayName: 'mystical fantasy aesthetic', cluster: 'mystical fantasy', confidence: 0.8 },
  { re: /\b(?:punk|ska|metal)\b/i, displayName: 'punk/ska/metal taste', cluster: 'punk/ska/metal', confidence: 0.78 },
  { re: /\b(?:sci-fi|science fiction|fantasy)\b/i, displayName: 'sci-fi/fantasy taste', cluster: 'sci-fi/fantasy', confidence: 0.76 },
  { re: /\b(?:cyberpunk|Blade Runner vibe)\b/i, displayName: 'cyberpunk aesthetic', cluster: 'cyberpunk', confidence: 0.8 },
  { re: /\bdark gothic themes?\b/i, displayName: 'dark gothic themes', cluster: 'gothic', confidence: 0.84 },
];

export function inferTasteProfiles(text: string): PreferenceSignal[] {
  const out: PreferenceSignal[] = [];
  const seen = new Set<string>();

  for (const { re, displayName, cluster, confidence } of TASTE_CLUSTERS) {
    const match = re.exec(text);
    if (!match) continue;
    const key = normalizeNameKey(displayName);
    if (seen.has(key)) continue;
    seen.add(key);

    const attachTo = /\bLoreBook\b/i.test(text)
      ? { entityType: 'project' as const, inferredTitle: 'LoreBook' }
      : { entityType: 'user_profile' as const, inferredTitle: 'taste profile' };

    out.push({
      displayName,
      preferenceType: /\bLoreBook\b/i.test(text) ? 'style' : 'taste',
      domain: 'aesthetic',
      strength: /\b(?:prefer|love|favorite|dark)\b/i.test(text) ? 'strong' : 'medium',
      attachedTo: attachTo,
      evidencePhrases: [match[0]],
      sourceMessageIds: [],
      confidence,
      inferredNotConfirmed: !/\bI (?:like|love|prefer)\b/i.test(text),
      requiresReview: false,
      temporal: { currentStatus: 'current', evidenceCount: 1 },
      promotionStatus: 'candidate',
    });
  }

  return out;
}

export function tasteClusterLabel(displayName: string): string {
  return displayName.split('/')[0]?.trim() ?? displayName;
}
