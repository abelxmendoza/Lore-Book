import type { EventCandidate } from './eventInferenceTypes';
import { buildEventContext } from './eventProvenanceService';
import { pickPrimaryPlace } from './eventPlaceAnchorResolver';

const GRADUATION_CONTEXT_RE =
  /\b(?:graduation\s+party|party)\s+(?:at|in)\s+([^.!?]+)/gi;

export function inferSocialEvents(text: string): EventCandidate[] {
  const out: EventCandidate[] = [];

  const gradRe = new RegExp(GRADUATION_CONTEXT_RE.source, 'gi');
  let match: RegExpExecArray | null;
  while ((match = gradRe.exec(text)) !== null) {
    const placeName = match[1].trim();
    const displayName = `Graduation Party at ${placeName}`;
    out.push({
      displayName,
      eventType: 'graduation_party',
      titleParts: { place: placeName },
      context: buildEventContext(text, displayName, {
        place: { displayName: placeName },
      }),
      evidencePhrases: [match[0]],
      sourceMessageIds: [],
      confidence: 0.85,
      needsResolution: false,
      requiresReview: false,
      promotionStatus: 'suggested_event',
    });
  }

  return out;
}
