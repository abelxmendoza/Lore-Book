import { normalizeNameKey } from '../../../utils/nameNormalization';
import type { OrganizationCandidate } from './organizationInferenceTypes';
import { buildOrganizationContext } from './organizationProvenanceService';

const INVESTOR_FROM_RE =
  /\b(?:potential\s+)?investor\s+from\s+([A-Z][A-Za-z0-9&'.-]+(?:\s+[A-Z][A-Za-z0-9&'.-]+){0,3})/gi;

const ACCELERATOR_RE =
  /\b(?:accelerator|vc|venture)\s+(?:from\s+)?([A-Z][A-Za-z0-9&'.-]+(?:\s+[A-Z][A-Za-z0-9&'.-]+){0,2})/gi;

export function inferInvestorOrganizations(text: string): OrganizationCandidate[] {
  const out: OrganizationCandidate[] = [];
  const seen = new Set<string>();

  for (const re of [INVESTOR_FROM_RE, ACCELERATOR_RE]) {
    let match: RegExpExecArray | null;
    const pattern = new RegExp(re.source, re.flags);
    while ((match = pattern.exec(text)) !== null) {
      const displayName = match[1].trim();
      const key = normalizeNameKey(displayName);
      if (seen.has(key)) continue;
      seen.add(key);

      out.push({
        displayName,
        organizationType: 'investor',
        context: buildOrganizationContext(text, displayName, {
          roleToUser: 'investor',
          personContext: extractInvestorPersonReference(text),
        }),
        aliases: [],
        evidencePhrases: [match[0]],
        sourceMessageIds: [],
        confidence: 0.87,
        inferredNotConfirmed: true,
        requiresReview: true,
        promotionStatus: 'candidate',
      });
    }
  }

  return out;
}

function extractInvestorPersonReference(text: string): string | undefined {
  const m = text.match(/\b(potential investor from [A-Za-z]+)/i);
  return m?.[1];
}

export function isInvestorPersonPhrase(text: string): boolean {
  return /\bpotential investor from\b/i.test(text);
}
