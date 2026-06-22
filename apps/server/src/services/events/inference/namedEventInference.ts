import { normalizeNameKey } from '../../../utils/nameNormalization';
import type { EventCandidate } from './eventInferenceTypes';
import { buildEventContext } from './eventProvenanceService';

const NAMED_EVENT_RE =
  /\b((?:Ska\s+Prom|Gothicumbia|Code\s+Red(?:\s+Show)?|Leslie'?s?\s+Graduation\s+Party|Oscar\s+and\s+Abel\s+LA\s+Ska\s+Shows?))\b/gi;

const POSSESSIVE_PARTY_RE =
  /\b([A-Z][A-Za-z]+(?:'s|s))\s+(Graduation\s+Party|Birthday\s+Party|Wedding|Quinceañera)\b/gi;

export function inferNamedEvents(text: string): EventCandidate[] {
  const out: EventCandidate[] = [];
  const seen = new Set<string>();

  let match: RegExpExecArray | null;
  const namedRe = new RegExp(NAMED_EVENT_RE.source, 'gi');
  while ((match = namedRe.exec(text)) !== null) {
    const displayName = titleCaseEvent(match[1].trim());
    const key = normalizeNameKey(displayName);
    if (seen.has(key)) continue;
    seen.add(key);

    const eventType = classifyNamedEvent(displayName);
    out.push({
      displayName,
      eventType,
      titleParts: { object: displayName },
      context: buildEventContext(text, displayName),
      evidencePhrases: [match[0]],
      sourceMessageIds: [],
      confidence: 0.92,
      needsResolution: false,
      requiresReview: false,
      promotionStatus: 'suggested_event',
    });
  }

  const partyRe = new RegExp(POSSESSIVE_PARTY_RE.source, 'gi');
  while ((match = partyRe.exec(text)) !== null) {
    const displayName = `${match[1].replace(/'s$/i, "'s")} ${match[2]}`.replace(/\s+/g, ' ');
    const key = normalizeNameKey(displayName);
    if (seen.has(key)) continue;
    seen.add(key);

    out.push({
      displayName,
      eventType: /\bgraduation\b/i.test(displayName) ? 'graduation_party' : 'party',
      titleParts: { honoree: match[1].replace(/'s$/i, ''), object: match[2] },
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

function classifyNamedEvent(name: string): EventCandidate['eventType'] {
  if (/graduation\s+party/i.test(name)) return 'graduation_party';
  if (/ska\s+prom|gothicumbia|code\s+red|ska\s+shows?/i.test(name)) return 'music_event';
  return 'show';
}

function titleCaseEvent(label: string): string {
  return label
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}
