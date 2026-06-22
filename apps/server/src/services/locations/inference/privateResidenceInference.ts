import {
  analyzePrivateResidence,
  isOrphanPossessiveResidence,
} from '../../lexical/places/privateResidenceGuard';
import type { LocationCandidate } from './locationInferenceTypes';
import { buildLocationContext } from './locationProvenanceService';

export function inferPrivateResidences(text: string): LocationCandidate[] {
  const out: LocationCandidate[] = [];
  const seen = new Set<string>();

  const pattern =
    /\b((?:my\s+|our\s+|the\s+)?[A-Za-zÀ-ÿ]+(?:\s+[A-Za-zÀ-ÿ]+){0,2}?'s)\s+(house|home|apartment|condo|casa|place)\b/gi;

  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    const span = match[0].trim();
    if (isOrphanPossessiveResidence(span)) continue;

    const residence = analyzePrivateResidence(span);
    if (!residence) continue;

    const key = residence.displayName.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    out.push({
      displayName: residence.displayName,
      locationType: residence.placeType,
      ownerDisplayName: residence.ownerDisplayName,
      context: {
        ...buildLocationContext(text, residence.displayName),
        privacySensitive: true,
      },
      evidencePhrases: [match[0]],
      sourceMessageIds: [],
      confidence: 0.9,
      needsResolution: false,
      requiresReview: true,
      promotionStatus: 'candidate',
    });
  }

  return out;
}

export function isBrokenResidenceSpan(span: string): boolean {
  return isOrphanPossessiveResidence(span);
}
