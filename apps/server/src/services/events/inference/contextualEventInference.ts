import { normalizeNameKey } from '../../../utils/nameNormalization';
import type { EventCandidate } from './eventInferenceTypes';
import { buildEventContext } from './eventProvenanceService';
import { pickPrimaryPlace } from './eventPlaceAnchorResolver';
import { resolveParticipants } from './eventParticipantResolver';

export const BARE_GENERIC_EVENTS = new Set([
  'party',
  'show',
  'fight',
  'meeting',
  'interview',
  'lunch',
  'yesterday',
  'last night',
  'went',
  'talked',
  'saw',
  'hung out',
  'concert',
  'festival',
  'gig',
]);

export function isBareGenericEvent(name: string): boolean {
  return BARE_GENERIC_EVENTS.has(normalizeNameKey(name));
}

const CONTEXTUAL_FIGHT_RE =
  /\b(?:fight|argument|altercation)\s+(?:involving|with|between)\s+([^.!?]+?)\s+(?:at|in)\s+([A-Z][^.!?]+)\b/gi;

const CONTEXTUAL_INTERVIEW_RE =
  /\b((?:Amazon|Google|Meta|Apple|Microsoft|Ring|Vanguard(?:\s+Robotics)?)\s+Interview(?:\s+with\s+[^.!?]+)?)\b/gi;

const CONTEXTUAL_PARTY_RE =
  /\b((?:Graduation\s+Party|Birthday\s+Party)\s+(?:at|in)\s+[^.!?]+)\b/gi;

const CONTEXTUAL_SHOW_RE =
  /\b(?:show|concert|gig|set)\s+at\s+(?:the\s+)?([A-Z][A-Za-z\s']+?)(?=\s+(?:last|yesterday|\.|,|$))/gi;

export function inferContextualEvents(text: string): EventCandidate[] {
  const out: EventCandidate[] = [];
  const seen = new Set<string>();

  let match: RegExpExecArray | null;

  const showRe = new RegExp(CONTEXTUAL_SHOW_RE.source, 'gi');
  while ((match = showRe.exec(text)) !== null) {
    const place = match[1].trim();
    const displayName = `Show at ${place}`;
    const key = normalizeNameKey(displayName);
    if (seen.has(key)) continue;
    seen.add(key);

    out.push({
      displayName,
      eventType: /\bcompound|club|venue\b/i.test(place) ? 'music_event' : 'show',
      titleParts: { action: 'show', place },
      context: buildEventContext(text, displayName, {
        place: { displayName: place },
      }),
      evidencePhrases: [match[0]],
      sourceMessageIds: [],
      confidence: 0.86,
      needsResolution: false,
      requiresReview: false,
      promotionStatus: 'suggested_event',
    });
  }

  const fightRe = new RegExp(CONTEXTUAL_FIGHT_RE.source, 'gi');
  while ((match = fightRe.exec(text)) !== null) {
    const place = match[2].trim();
    const displayName = `Fight at ${place}`;
    const key = normalizeNameKey(displayName);
    if (seen.has(key)) continue;
    seen.add(key);

    const people = resolveParticipants(match[1]);
    out.push({
      displayName,
      eventType: 'conflict',
      titleParts: { action: 'fight', place, object: match[1].trim() },
      context: buildEventContext(text, displayName, {
        people,
        place: { displayName: place },
      }),
      evidencePhrases: [match[0]],
      sourceMessageIds: [],
      confidence: 0.88,
      needsResolution: false,
      requiresReview: true,
      sensitive: true,
      promotionStatus: 'candidate',
    });
  }

  const interviewRe = new RegExp(CONTEXTUAL_INTERVIEW_RE.source, 'gi');
  while ((match = interviewRe.exec(text)) !== null) {
    const displayName = match[1].trim();
    const key = normalizeNameKey(displayName);
    if (seen.has(key)) continue;
    seen.add(key);

    const org = displayName.split(/\s+Interview/i)[0]?.trim();
    out.push({
      displayName,
      eventType: 'work_event',
      titleParts: { organization: org, action: 'interview' },
      context: buildEventContext(text, displayName, {
        organization: org ? { displayName: org } : undefined,
      }),
      evidencePhrases: [match[0]],
      sourceMessageIds: [],
      confidence: 0.9,
      needsResolution: false,
      requiresReview: false,
      promotionStatus: 'suggested_event',
    });
  }

  const partyRe = new RegExp(CONTEXTUAL_PARTY_RE.source, 'gi');
  while ((match = partyRe.exec(text)) !== null) {
    const displayName = match[1].trim();
    const key = normalizeNameKey(displayName);
    if (seen.has(key)) continue;
    seen.add(key);

    const place = pickPrimaryPlace(displayName);
    out.push({
      displayName,
      eventType: /\bgraduation\b/i.test(displayName) ? 'graduation_party' : 'party',
      titleParts: { place: place?.displayName },
      context: buildEventContext(text, displayName, { place }),
      evidencePhrases: [match[0]],
      sourceMessageIds: [],
      confidence: 0.86,
      needsResolution: false,
      requiresReview: false,
      promotionStatus: 'suggested_event',
    });
  }

  return out;
}

export function inferRelationshipEvents(text: string): EventCandidate[] {
  const out: EventCandidate[] = [];
  const patterns: Array<{ re: RegExp; label: string }> = [
    { re: /\b([A-Z][a-z]+)\s+ghosted\s+me\b/g, label: 'ghosted' },
    { re: /\b([A-Z][a-z]+)\s+blocked\s+me\b/g, label: 'blocked' },
    { re: /\b([A-Z][a-z]+)\s+(?:was|is)\s+my\s+best\s+friend\b/gi, label: 'best friend' },
    {
      re: /\b([A-Z][a-z]+)\s+hasn'?t\s+seen\s+me\s+since\s+before\s+covid\b/gi,
      label: 'estranged',
    },
  ];

  for (const { re, label } of patterns) {
    let m: RegExpExecArray | null;
    const regex = new RegExp(re.source, re.flags);
    while ((m = regex.exec(text)) !== null) {
      const person = m[1].trim();
      const displayName = `${person} ${label === 'ghosted' ? 'Ghosted Me' : label === 'blocked' ? 'Blocked Me' : label === 'best friend' ? 'Best Friend Arc' : 'Estrangement'}`;
      out.push({
        displayName,
        eventType: 'relationship_event',
        titleParts: { actor: person, action: label },
        context: buildEventContext(text, displayName, {
          people: [{ displayName: person }],
          emotionalWeight: label,
        }),
        evidencePhrases: [m[0]],
        sourceMessageIds: [],
        confidence: 0.84,
        needsResolution: false,
        requiresReview: label === 'ghosted' || label === 'blocked',
        sensitive: true,
        promotionStatus: 'candidate',
      });
    }
  }

  return out;
}
