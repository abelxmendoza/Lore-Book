import { normalizeNameKey } from '../../../utils/nameNormalization';
import type { OrganizationCandidate } from './organizationInferenceTypes';

const RESTAURANT_OR_PLACE =
  /\b(?:denny'?s|walmart|target|starbucks|mcdonald'?s|in-n-out|trader joe'?s)\b/i;

const WORKSITE_CHAIN_RE =
  /\b(?:worked|working|deployed|stationed)\s+at\s+([A-Z][A-Za-z\s&'.-]+?)\s+at\s+((?:Denny'?s)(?:\s+(?:in\s+)?[A-Z][a-z]+)?)/i;

/** Reject org candidates that are really worksite/place spans in employer-at-worksite chains. */
export function disambiguateOrganizationFromPlace(
  candidates: OrganizationCandidate[],
  text: string,
): OrganizationCandidate[] {
  const chain = text.match(WORKSITE_CHAIN_RE);
  const employerName = chain?.[1]?.trim();
  const worksiteName = chain?.[2]?.trim();
  const employerKey = employerName ? normalizeNameKey(employerName) : null;
  const worksiteKey = worksiteName ? normalizeNameKey(worksiteName.replace(/\s+in\s+/i, ' ')) : null;

  return candidates.filter((candidate) => {
    const key = normalizeNameKey(candidate.displayName);

    if (worksiteKey && (key.includes('denny') || key === worksiteKey)) {
      return false;
    }

    if (employerKey && key === employerKey) {
      return true;
    }

    if (RESTAURANT_OR_PLACE.test(candidate.displayName) && employerKey) {
      return false;
    }

    if (/\bin\s+hollywood\b/i.test(text) && /\bdenny/i.test(candidate.displayName)) {
      return false;
    }

    return true;
  });
}

export function looksLikeWorksiteNotEmployer(name: string, text: string): boolean {
  if (!RESTAURANT_OR_PLACE.test(name)) return false;
  return WORKSITE_CHAIN_RE.test(text);
}

export function extractEmployerFromWorksiteChain(text: string): string | undefined {
  return text.match(WORKSITE_CHAIN_RE)?.[1]?.trim();
}
