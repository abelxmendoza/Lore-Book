import { normalizeNameKey } from '../../../utils/nameNormalization';
import type { OrganizationCandidate } from './organizationInferenceTypes';
import { buildOrganizationContext } from './organizationProvenanceService';

const EMPLOYER_PATTERNS: Array<{
  re: RegExp;
  group: number;
  organizationType: OrganizationCandidate['organizationType'];
  confidence: number;
}> = [
  {
    re: /\b(?:worked|working|started working|start working)\s+at\s+([A-Z][A-Za-z0-9&'.-]+(?:\s+[A-Z][A-Za-z0-9&'.-]+){0,4})/gi,
    group: 1,
    organizationType: 'employer',
    confidence: 0.9,
  },
  {
    re: /\b(?:hired by|offer from|interview with|onboard(?:ed|ing)? with)\s+([A-Z][A-Za-z0-9&'.-]+(?:\s+[A-Z][A-Za-z0-9&'.-]+){0,3})/gi,
    group: 1,
    organizationType: 'employer',
    confidence: 0.88,
  },
  {
    re: /\b(?:job at|position at|role at)\s+([A-Z][A-Za-z0-9&'.-]+(?:\s+[A-Z][A-Za-z0-9&'.-]+){0,3})/gi,
    group: 1,
    organizationType: 'employer',
    confidence: 0.84,
  },
];

export function inferEmployerOrganizations(text: string): OrganizationCandidate[] {
  const out: OrganizationCandidate[] = [];
  const seen = new Set<string>();

  for (const { re, group, organizationType, confidence } of EMPLOYER_PATTERNS) {
    let match: RegExpExecArray | null;
    const pattern = new RegExp(re.source, re.flags);
    while ((match = pattern.exec(text)) !== null) {
      let displayName = match[group].trim();
      displayName = stripWorksiteTail(displayName);
      const key = normalizeNameKey(displayName);
      if (!displayName || key.length < 2 || seen.has(key)) continue;
      seen.add(key);

      out.push({
        displayName,
        organizationType,
        context: buildOrganizationContext(text, displayName, { roleToUser: 'employer' }),
        aliases: [],
        evidencePhrases: [match[0]],
        sourceMessageIds: [],
        confidence,
        inferredNotConfirmed: true,
        requiresReview: false,
        promotionStatus: 'candidate',
      });
    }
  }

  return out;
}

function stripWorksiteTail(name: string): string {
  const atSplit = name.match(/^(.+?)\s+at\s+(?:Denny'?s|Walmart|Target)/i);
  return atSplit ? atSplit[1].trim() : name;
}

export function hasEmployerContext(text: string): boolean {
  return /\b(?:worked|working|hired|interview|offer|onboard|job at|employer)\b/i.test(text);
}
