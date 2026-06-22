import type { EventCandidate } from './eventInferenceTypes';
import { buildEventContext } from './eventProvenanceService';
import { pickPrimaryPlace } from './eventPlaceAnchorResolver';
import { resolveParticipants } from './eventParticipantResolver';

const SENSITIVE_CUES =
  /\b(?:fight|got\s+kicked\s+out|wanted\s+to\s+jump\s+me|detention|blacked\s+out|drunk|intoxicated|sexual|hooked\s+up|family\s+conflict|argument)\b/i;

const CONFLICT_AT_RE =
  /\b(?:fight|altercation|argument)\s+(?:at|in)\s+([A-Z][A-Za-z\s']+?)(?=\s+(?:last|yesterday|\.|,|$))/gi;

const CONFLICT_INVOLVING_RE =
  /\b(?:fight|altercation)\s+involving\s+([^.!?]+?)\s+at\s+([A-Z][^.!?]+)\b/gi;

export function inferConflictEvents(text: string): EventCandidate[] {
  const out: EventCandidate[] = [];
  const seen = new Set<string>();

  let match: RegExpExecArray | null;

  const involvingRe = new RegExp(CONFLICT_INVOLVING_RE.source, 'gi');
  while ((match = involvingRe.exec(text)) !== null) {
    const place = match[2].trim();
    const displayName = `Fight at ${place}`;
    const key = displayName.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    out.push({
      displayName,
      eventType: 'conflict',
      titleParts: { action: 'fight', place, object: match[1].trim() },
      context: buildEventContext(text, displayName, {
        people: resolveParticipants(match[1]),
        place: { displayName: place },
      }),
      evidencePhrases: [match[0]],
      sourceMessageIds: [],
      confidence: 0.9,
      needsResolution: false,
      requiresReview: true,
      sensitive: true,
      promotionStatus: 'candidate',
    });
  }

  const atRe = new RegExp(CONFLICT_AT_RE.source, 'gi');
  while ((match = atRe.exec(text)) !== null) {
    const place = match[1].trim();
    const displayName = `Fight at ${place}`;
    const key = displayName.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    out.push({
      displayName,
      eventType: 'fight',
      titleParts: { action: 'fight', place },
      context: buildEventContext(text, displayName, {
        place: { displayName: place },
      }),
      evidencePhrases: [match[0]],
      sourceMessageIds: [],
      confidence: 0.85,
      needsResolution: false,
      requiresReview: true,
      sensitive: SENSITIVE_CUES.test(text),
      promotionStatus: 'candidate',
    });
  }

  return out;
}

export function isSensitiveEventText(text: string): boolean {
  return SENSITIVE_CUES.test(text);
}
