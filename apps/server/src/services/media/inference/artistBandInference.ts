import { normalizeNameKey } from '../../../utils/nameNormalization';
import type { MediaCandidate } from './mediaInferenceTypes';
import { inferPreferenceSignal } from './mediaProvenanceService';

const NAMED_ARTISTS: Array<{
  pattern: RegExp;
  displayName: string;
  mediaType: MediaCandidate['mediaType'];
  requiresPerformanceContext?: boolean;
}> = [
  { pattern: /\bBill Skasby\b/i, displayName: 'Bill Skasby', mediaType: 'band', requiresPerformanceContext: true },
  { pattern: /\bLos Skallejeros\b/i, displayName: 'Los Skallejeros', mediaType: 'band' },
  { pattern: /\bLa Muerte\b/i, displayName: 'La Muerte', mediaType: 'band' },
  { pattern: /\bBaby Bats\b/i, displayName: 'Baby Bats', mediaType: 'artist', requiresPerformanceContext: true },
  { pattern: /\bGoth Tio\b/i, displayName: 'Goth Tio', mediaType: 'artist', requiresPerformanceContext: true },
  { pattern: /\bHell Fairy\b/i, displayName: 'Hell Fairy', mediaType: 'artist', requiresPerformanceContext: true },
  { pattern: /\bOscuridad\b/i, displayName: 'Oscuridad', mediaType: 'artist', requiresPerformanceContext: true },
];

const PERFORMANCE_CONTEXT = /\b(?:playing|played|set|show|concert|band|stage|performed|listening to)\b/i;

export function inferArtistsAndBands(text: string): MediaCandidate[] {
  const out: MediaCandidate[] = [];
  const seen = new Set<string>();
  const pref = inferPreferenceSignal(text);
  const hasPerformance = PERFORMANCE_CONTEXT.test(text);

  for (const { pattern, displayName, mediaType, requiresPerformanceContext } of NAMED_ARTISTS) {
    const match = pattern.exec(text);
    if (!match) continue;
    const key = normalizeNameKey(displayName);
    if (seen.has(key)) continue;
    seen.add(key);

    out.push({
      displayName,
      mediaType,
      context: {
        preferenceSignal: pref,
        sceneContext: hasPerformance ? 'performance context' : undefined,
        personContext: requiresPerformanceContext && !hasPerformance ? 'stage name ambiguity' : undefined,
      },
      evidencePhrases: [match[0]],
      sourceMessageIds: [],
      confidence: hasPerformance ? 0.86 : 0.74,
      inferredNotConfirmed: !hasPerformance,
      requiresReview: requiresPerformanceContext && !hasPerformance,
      promotionStatus: hasPerformance ? 'candidate' : 'mention_only',
    });
  }

  return out;
}

export function isStageNameAmbiguous(displayName: string): boolean {
  return ['Baby Bats', 'Goth Tio', 'Oscuridad', 'Hell Fairy'].some(
    (n) => normalizeNameKey(n) === normalizeNameKey(displayName),
  );
}

export function hasPerformanceContext(text: string): boolean {
  return PERFORMANCE_CONTEXT.test(text);
}
