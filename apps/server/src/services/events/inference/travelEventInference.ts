import type { EventCandidate } from './eventInferenceTypes';
import { buildEventContext } from './eventProvenanceService';

const TRAVEL_RE =
  /\b(?:went\s+to|visited|traveled\s+to|trip\s+to)\s+(Japan|Mexico|Canada|France|Korea|Hawaii|Europe)\b[^.!?]*(?:last\s+summer|last\s+year|last\s+winter|before\s+covid)?/gi;

const TRIP_NAMED_RE = /\b((?:Japan|Mexico|Hawaii)\s+Trip)\b/gi;

export function inferTravelEvents(text: string): EventCandidate[] {
  const out: EventCandidate[] = [];
  const seen = new Set<string>();

  let match: RegExpExecArray | null;
  const travelRe = new RegExp(TRAVEL_RE.source, 'gi');
  while ((match = travelRe.exec(text)) !== null) {
    const destination = match[1].trim();
    const timeHint = text.match(/\b(?:last\s+summer|last\s+year|last\s+winter|before\s+covid)\b/i)?.[0];
    const displayName = timeHint ? `${destination} Trip` : `${destination} Trip`;
    const key = displayName.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    const groupMatch = text.match(/\b(?:Japanese\s+Class|class|with\s+[^.!?]+)\b/i);

    out.push({
      displayName,
      eventType: 'trip',
      titleParts: { place: destination, time: timeHint, group: groupMatch?.[0] },
      context: buildEventContext(text, displayName, {
        place: { displayName: destination },
        timeHint,
        group: groupMatch?.[0] ? { displayName: groupMatch[0] } : undefined,
      }),
      evidencePhrases: [match[0]],
      sourceMessageIds: [],
      confidence: 0.88,
      needsResolution: false,
      requiresReview: false,
      promotionStatus: 'suggested_event',
    });
  }

  const tripRe = new RegExp(TRIP_NAMED_RE.source, 'gi');
  while ((match = tripRe.exec(text)) !== null) {
    const displayName = match[1].trim();
    const key = displayName.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    out.push({
      displayName,
      eventType: 'travel',
      titleParts: { place: displayName.replace(/\s+Trip$/i, '') },
      context: buildEventContext(text, displayName),
      evidencePhrases: [match[0]],
      sourceMessageIds: [],
      confidence: 0.9,
      needsResolution: false,
      requiresReview: false,
      promotionStatus: 'suggested_event',
    });
  }

  return out;
}
