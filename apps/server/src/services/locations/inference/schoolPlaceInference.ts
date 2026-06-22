import { SCHOOL_ABBREVS } from '../../lexical/places/placeSuggestionTypes';
import { normalizeNameKey } from '../../../utils/nameNormalization';
import type { LocationCandidate } from './locationInferenceTypes';
import { buildLocationContext } from './locationProvenanceService';

const SCHOOL_ABBREV_RE = /\b(CSUF|UCI|UCLA|USC|Cal Poly|NYU)\b/g;

const NAMED_SCHOOL_RE =
  /\b([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+){0,5}\s+(?:High School|Middle School|Elementary School|Academy|Preparatory School))\b/g;

const SCHOOL_FROM_RE =
  /\bfrom\s+([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+){0,5}\s+(?:High School|Middle School|Elementary School|Academy|Preparatory School))\b/gi;

const BARE_SCHOOL_LABELS = new Set([
  'school',
  'high school',
  'middle school',
  'elementary school',
  'college',
  'university',
  'campus',
]);

export function isBareSchoolLabel(name: string): boolean {
  return BARE_SCHOOL_LABELS.has(normalizeNameKey(name));
}

export function inferSchoolPlaces(text: string): LocationCandidate[] {
  const out: LocationCandidate[] = [];
  const seen = new Set<string>();

  let match: RegExpExecArray | null;
  const abbrevRe = new RegExp(SCHOOL_ABBREV_RE.source, 'g');
  while ((match = abbrevRe.exec(text)) !== null) {
    const displayName = match[1].trim();
    const key = normalizeNameKey(displayName);
    if (seen.has(key)) continue;
    seen.add(key);

    const isAbbrev = SCHOOL_ABBREVS.has(key);
    out.push({
      displayName,
      locationType: isAbbrev ? 'university' : 'school',
      context: buildLocationContext(text, displayName),
      evidencePhrases: [match[0]],
      sourceMessageIds: [],
      confidence: 0.9,
      needsResolution: false,
      requiresReview: false,
      promotionStatus: 'suggested_location',
    });
  }

  const namedRe = new RegExp(NAMED_SCHOOL_RE.source, 'g');
  while ((match = namedRe.exec(text)) !== null) {
    addSchool(out, seen, match[1], text, match[0]);
  }

  const fromRe = new RegExp(SCHOOL_FROM_RE.source, 'gi');
  while ((match = fromRe.exec(text)) !== null) {
    addSchool(out, seen, match[1], text, match[0]);
  }

  return out;
}

function addSchool(
  out: LocationCandidate[],
  seen: Set<string>,
  rawName: string,
  text: string,
  evidence: string,
): void {
  const displayName = rawName.trim();
  const key = normalizeNameKey(displayName);
  if (seen.has(key)) return;
  seen.add(key);

  const locationType = /\b(university|college|campus)\b/i.test(displayName)
    ? 'university'
    : 'school';

  out.push({
    displayName,
    locationType,
    context: buildLocationContext(text, displayName),
    evidencePhrases: [evidence],
    sourceMessageIds: [],
    confidence: 0.88,
    needsResolution: false,
    requiresReview: false,
    promotionStatus: 'suggested_location',
  });
}
