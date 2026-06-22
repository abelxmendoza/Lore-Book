import { normalizeNameKey } from '../../../utils/nameNormalization';
import type { OrganizationCandidate } from './organizationInferenceTypes';
import { buildOrganizationContext } from './organizationProvenanceService';

const BOOTCAMP_RE =
  /\b([A-Z][A-Za-z0-9&'.-]+(?:\s+[A-Z][A-Za-z0-9&'.-]+){0,4}\s+Bootcamp)\b/gi;

const PROGRAM_RE =
  /\b([A-Z][A-Za-z0-9&'.-]+(?:\s+[A-Z][A-Za-z0-9&'.-]+){0,4}\s+(?:Program|Academy|Institute))\b/gi;

export function inferBootcampOrganizations(text: string): OrganizationCandidate[] {
  const out: OrganizationCandidate[] = [];
  const seen = new Set<string>();

  for (const re of [BOOTCAMP_RE, PROGRAM_RE]) {
    let match: RegExpExecArray | null;
    const pattern = new RegExp(re.source, re.flags);
    while ((match = pattern.exec(text)) !== null) {
      const displayName = match[1].trim();
      const key = normalizeNameKey(displayName);
      if (seen.has(key)) continue;
      seen.add(key);

      const organizationType = /\bbootcamp\b/i.test(displayName) ? 'bootcamp' : 'program';
      out.push({
        displayName,
        organizationType,
        context: buildOrganizationContext(text, displayName, { roleToUser: 'program' }),
        aliases: [],
        evidencePhrases: [match[0]],
        sourceMessageIds: [],
        confidence: 0.88,
        inferredNotConfirmed: true,
        requiresReview: false,
        promotionStatus: 'candidate',
      });
    }
  }

  return out;
}
