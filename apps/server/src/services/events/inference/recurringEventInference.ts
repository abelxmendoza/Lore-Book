import type { EventCandidate } from './eventInferenceTypes';
import { buildEventContext } from './eventProvenanceService';
import { resolveParticipants } from './eventParticipantResolver';

const RECURRING_BAND_RE =
  /\b(?:practiced|practice|rehearsed|rehearsal)\s+(?:in\s+)?(?:band|with\s+the\s+band)[^.!?]*(?:every\s+(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday))\b/gi;

const RECURRING_GENERIC_RE =
  /\b(?:every\s+(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday))\s+([^.!?]{5,60})\b/gi;

const NAMED_RECURRING_RE =
  /\b((?:[A-Z][A-Za-z]+(?:\s+and\s+[A-Z][A-Za-z]+)?)\s+(?:Middle\s+School\s+)?Band\s+Practice)\b/gi;

export function inferRecurringEvents(text: string): EventCandidate[] {
  const out: EventCandidate[] = [];
  const seen = new Set<string>();

  let match: RegExpExecArray | null;
  const bandRe = new RegExp(RECURRING_BAND_RE.source, 'gi');
  while ((match = bandRe.exec(text)) !== null) {
    const day = match[1];
    const displayName = `${day} Band Practice`;
    const key = displayName.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    out.push({
      displayName,
      eventType: 'recurring_activity',
      titleParts: { time: `every ${day}`, action: 'band practice' },
      context: buildEventContext(text, displayName, { timeHint: `every ${day}` }),
      evidencePhrases: [match[0]],
      sourceMessageIds: [],
      confidence: 0.88,
      needsResolution: false,
      requiresReview: false,
      promotionStatus: 'suggested_event',
    });
  }

  const namedRe = new RegExp(NAMED_RECURRING_RE.source, 'gi');
  while ((match = namedRe.exec(text)) !== null) {
    const displayName = match[1].trim();
    const key = displayName.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    const people = resolveParticipants(displayName);
    out.push({
      displayName,
      eventType: 'recurring_activity',
      titleParts: { group: 'band', action: 'practice' },
      context: buildEventContext(text, displayName, { people }),
      evidencePhrases: [match[0]],
      sourceMessageIds: [],
      confidence: 0.9,
      needsResolution: false,
      requiresReview: false,
      promotionStatus: 'suggested_event',
    });
  }

  const genericRe = new RegExp(RECURRING_GENERIC_RE.source, 'gi');
  while ((match = genericRe.exec(text)) !== null) {
    const day = match[1];
    const activity = match[2].trim();
    if (activity.split(/\s+/).length < 2) continue;
    const displayName = `${day} ${titleCase(activity)}`;
    const key = displayName.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    out.push({
      displayName,
      eventType: 'recurring_activity',
      titleParts: { time: `every ${day}`, action: activity },
      context: buildEventContext(text, displayName, { timeHint: `every ${day}` }),
      evidencePhrases: [match[0]],
      sourceMessageIds: [],
      confidence: 0.8,
      needsResolution: true,
      requiresReview: false,
      promotionStatus: 'candidate',
    });
  }

  return out;
}

function titleCase(s: string): string {
  return s
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}
