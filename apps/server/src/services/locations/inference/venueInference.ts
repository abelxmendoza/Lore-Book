import { PLACE_PREPOSITIONS, VENUE_COMPOUND_SUFFIX } from '../../lexical/places/placeSuggestionTypes';
import { resolvePlaceBoundary } from '../../lexical/places/placeBoundaryResolver';
import { normalizeNameKey } from '../../../utils/nameNormalization';
import type { LocationCandidate } from './locationInferenceTypes';
import { buildLocationContext } from './locationProvenanceService';

const VENUE_CUE =
  /\b(?:show\s+at|at\s+the\s+show|went\s+to|drove\s+to|inside|outside|near)\b/i;

const COMPOUND_VENUE_RE =
  /\b([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+)*\s+(?:Compound|Warehouse|Grounds|Arena|Stadium|Center|Centre))\b/g;

const EVENT_VENUE_RE =
  /\b(?:at|inside|outside|near)\s+(?:the\s+)?([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+){0,4})\b/g;

const SHOW_CONTEXT = /\b(show|concert|festival|gig|set|performance|party)\b/i;

export function inferVenuePlaces(text: string): LocationCandidate[] {
  const out: LocationCandidate[] = [];
  const seen = new Set<string>();

  let match: RegExpExecArray | null;

  const compoundRe = new RegExp(COMPOUND_VENUE_RE.source, 'g');
  while ((match = compoundRe.exec(text)) !== null) {
    const boundary = resolvePlaceBoundary(match[1]);
    const displayName = boundary.text.trim();
    const key = normalizeNameKey(displayName);
    if (seen.has(key)) continue;
    seen.add(key);

    const hasVenueCue = VENUE_CUE.test(text) || PLACE_PREPOSITIONS.test(text);
    const hasShow = SHOW_CONTEXT.test(text);
    const locationType = hasShow || VENUE_COMPOUND_SUFFIX.test(displayName)
      ? 'event_space'
      : 'music_venue';

    out.push({
      displayName,
      locationType,
      context: {
        ...buildLocationContext(text, displayName),
        eventContext: hasShow ? text.match(SHOW_CONTEXT)?.[0] : undefined,
      },
      evidencePhrases: [match[0]],
      sourceMessageIds: [],
      confidence: hasVenueCue ? 0.9 : 0.78,
      needsResolution: !hasVenueCue,
      requiresReview: !hasVenueCue,
      promotionStatus: hasVenueCue ? 'suggested_location' : 'candidate',
    });
  }

  if (SHOW_CONTEXT.test(text) && PLACE_PREPOSITIONS.test(text)) {
    // 'g' only — adding 'i' would let the [A-Z] proper-noun anchor match
    // lowercase prose fragments after "at/in".
    const eventRe = new RegExp(EVENT_VENUE_RE.source, 'g');
    while ((match = eventRe.exec(text)) !== null) {
      const boundary = resolvePlaceBoundary(match[1]);
      const displayName = boundary.text.trim();
      if (!displayName || displayName.split(/\s+/).length < 2) continue;
      if (!VENUE_COMPOUND_SUFFIX.test(displayName) && !/\bclub\b/i.test(displayName)) continue;

      const key = normalizeNameKey(displayName);
      if (seen.has(key)) continue;
      seen.add(key);

      out.push({
        displayName,
        locationType: 'music_venue',
        context: buildLocationContext(text, displayName),
        evidencePhrases: [match[0]],
        sourceMessageIds: [],
        confidence: 0.84,
        needsResolution: false,
        requiresReview: false,
        promotionStatus: 'suggested_location',
      });
    }
  }

  return out;
}
