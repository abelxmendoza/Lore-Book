import type { EventCandidate } from './eventInferenceTypes';
import { buildEventContext } from './eventProvenanceService';
import { resolveParticipants } from './eventParticipantResolver';

const DETENTION_RE =
  /\b(detention)\s+(?:yesterday|last\s+week|today|last\s+night)?\b/gi;

export function inferSchoolEvents(text: string): EventCandidate[] {
  const out: EventCandidate[] = [];

  let match: RegExpExecArray | null;
  const detentionRe = new RegExp(DETENTION_RE.source, 'gi');
  while ((match = detentionRe.exec(text)) !== null) {
    const people = resolveParticipants(text);
    const displayName = 'Detention';
    const timeHint = text.match(/\b(?:yesterday|last\s+week|today)\b/i)?.[0];

    out.push({
      displayName: timeHint ? `Detention (${timeHint})` : 'Detention Event',
      eventType: 'school_event',
      titleParts: { action: 'detention', time: timeHint },
      context: buildEventContext(text, displayName, {
        people: people.slice(0, 3),
        timeHint,
      }),
      evidencePhrases: [match[0]],
      sourceMessageIds: [],
      confidence: 0.82,
      needsResolution: !timeHint,
      requiresReview: true,
      sensitive: true,
      promotionStatus: 'candidate',
    });
  }

  return out;
}

export function isSchoolDayTimeOnly(text: string): boolean {
  return /^\s*lunch\s+break\s*$/i.test(text.trim()) || /\blunch\s+break\b/i.test(text) && !/\b(?:detention|fight|interview|party)\b/i.test(text);
}
