import { normalizeNameKey } from '../../../utils/nameNormalization';
import type { OrganizationCandidate } from './organizationInferenceTypes';
import { buildOrganizationContext } from './organizationProvenanceService';

const SCHOOL_NAME_RE =
  /\b([A-Z][A-Za-z0-9&'.-]+(?:\s+[A-Z][A-Za-z0-9&'.-]+){0,5}\s+(?:Middle School|High School|Elementary School|University|College))\b/g;

const SCHOOL_CONTEXT_RE =
  /\b(?:went to|graduated from|class at|student at|enrolled at|attended)\s+([A-Z][A-Za-z0-9&'.-]+(?:\s+[A-Z][A-Za-z0-9&'.-]+){0,5})/gi;

const UNIVERSITY_ABBREV_RE = /\b(CSUF|UCLA|USC|MIT|NYU|ASU)\b/g;

export function inferSchoolInstitutions(text: string): OrganizationCandidate[] {
  const out: OrganizationCandidate[] = [];
  const seen = new Set<string>();

  let match: RegExpExecArray | null;

  const schoolNameRe = new RegExp(SCHOOL_NAME_RE.source, 'gi');
  while ((match = schoolNameRe.exec(text)) !== null) {
    const displayName = match[1].trim();
    const key = normalizeNameKey(displayName);
    if (seen.has(key)) continue;
    seen.add(key);

    const organizationType = /\b(?:University|College)\b/i.test(displayName) ? 'university' : 'school';
    out.push(makeSchoolCandidate(displayName, organizationType, match[0], text, 0.9));
  }

  const contextRe = new RegExp(SCHOOL_CONTEXT_RE.source, 'gi');
  while ((match = contextRe.exec(text)) !== null) {
    const displayName = match[1].trim();
    const key = normalizeNameKey(displayName);
    if (seen.has(key)) continue;
    if (/\b(?:class|program|team)\b/i.test(displayName) && displayName.split(/\s+/).length < 3) continue;
    seen.add(key);

    const organizationType = /\b(?:university|college)\b/i.test(displayName) ? 'university' : 'school';
    out.push(makeSchoolCandidate(displayName, organizationType, match[0], text, 0.86));
  }

  const abbrevRe = new RegExp(UNIVERSITY_ABBREV_RE.source, 'gi');
  while ((match = abbrevRe.exec(text)) !== null) {
    const displayName = match[1].trim();
    const key = normalizeNameKey(displayName);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(makeSchoolCandidate(displayName, 'university', match[0], text, 0.88));
  }

  return out;
}

function makeSchoolCandidate(
  displayName: string,
  organizationType: OrganizationCandidate['organizationType'],
  evidence: string,
  text: string,
  confidence: number,
): OrganizationCandidate {
  return {
    displayName,
    organizationType,
    context: buildOrganizationContext(text, displayName, { roleToUser: 'school' }),
    aliases: [],
    evidencePhrases: [evidence],
    sourceMessageIds: [],
    confidence,
    inferredNotConfirmed: true,
    requiresReview: false,
    promotionStatus: 'candidate',
  };
}

export function isBareSchoolLabel(name: string): boolean {
  const key = normalizeNameKey(name);
  return key === 'school' || key === 'class' || key === 'university' || key === 'college';
}
