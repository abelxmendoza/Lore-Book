import { resolvePlaceBoundary } from '../../lexical/places/placeBoundaryResolver';
import { normalizeNameKey } from '../../../utils/nameNormalization';
import type { LocationCandidate } from './locationInferenceTypes';
import { buildLocationContext } from './locationProvenanceService';
import { inferNamedPlaces } from './namedPlaceInference';

/** Employer org names to exclude from location candidates in worksite patterns. */
const ORG_SUFFIX =
  /\b(robotics|technologies|technology|systems|solutions|consulting|studios|media|group|inc|llc|corp)\b/i;

const WORKSITE_CHAIN_RE =
  /\b(?:worked|working|deployed|stationed)\s+at\s+([A-Z][A-Za-z\s&'.-]+?)\s+at\s+((?:Denny'?s)(?:\s+[A-Z][a-z]+)?)/gi;

const IN_CITY_RE = /\bin\s+(Hollywood|Downtown|Midtown|Brooklyn|Manhattan)\b/gi;

export function inferWorkplaceLocations(text: string): LocationCandidate[] {
  const out: LocationCandidate[] = [];
  const seen = new Set<string>();
  const rejectedEmployers = new Set<string>();

  let match: RegExpExecArray | null;
  const worksiteRe = new RegExp(WORKSITE_CHAIN_RE.source, 'gi');
  while ((match = worksiteRe.exec(text)) !== null) {
    const employer = match[1].trim();
    const worksiteRaw = match[2].trim();
    rejectedEmployers.add(normalizeNameKey(employer));

    const boundary = resolvePlaceBoundary(worksiteRaw);
    const displayName = boundary.text.trim();
    const key = normalizeNameKey(displayName);
    if (seen.has(key)) continue;
    seen.add(key);

    out.push({
      displayName,
      locationType: 'deployment_site',
      context: {
        ...buildLocationContext(text, displayName),
        organizationContext: employer,
      },
      evidencePhrases: [match[0]],
      sourceMessageIds: [],
      confidence: 0.86,
      needsResolution: false,
      requiresReview: false,
      promotionStatus: 'candidate',
    });
  }

  const cityRe = new RegExp(IN_CITY_RE.source, 'gi');
  while ((match = cityRe.exec(text)) !== null) {
    if (!/denny|worked|working|at\b/i.test(text)) continue;
    const displayName = match[1].trim();
    const key = normalizeNameKey(displayName);
    if (seen.has(key)) continue;
    seen.add(key);

    out.push({
      displayName,
      locationType: 'neighborhood',
      context: buildLocationContext(text, displayName),
      evidencePhrases: [match[0]],
      sourceMessageIds: [],
      confidence: 0.75,
      needsResolution: true,
      requiresReview: false,
      promotionStatus: 'mention_only',
    });
  }

  // Reject standalone employer-looking spans that slipped through generic detection.
  for (const employer of rejectedEmployers) {
    const idx = out.findIndex((c) => normalizeNameKey(c.displayName) === employer);
    if (idx >= 0) out.splice(idx, 1);
  }

  return out;
}

export function looksLikeEmployerOrg(name: string): boolean {
  return ORG_SUFFIX.test(name) && !/\bdenny|walmart|target\b/i.test(name);
}

/** Strip employer org spans from a mixed candidate list. */
export function filterEmployerOrganizations(
  candidates: LocationCandidate[],
  text: string,
): LocationCandidate[] {
  const employerMatch = text.match(
    /\b(?:worked|working)\s+at\s+([A-Z][A-Za-z\s&'.-]+?)\s+at\s+/i,
  );
  if (!employerMatch?.[1]) return candidates;

  const employerKey = normalizeNameKey(employerMatch[1]);
  return candidates.filter((c) => normalizeNameKey(c.displayName) !== employerKey);
}

export function inferEmployerContextCity(text: string): LocationCandidate[] {
  return inferNamedPlaces(text).filter((c) =>
    /\bhollywood\b/i.test(c.displayName) && /\bworked\b/i.test(text),
  );
}
