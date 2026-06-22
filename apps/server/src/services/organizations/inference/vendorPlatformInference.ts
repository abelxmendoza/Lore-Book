import { normalizeNameKey } from '../../../utils/nameNormalization';
import type { OrganizationCandidate } from './organizationInferenceTypes';
import { buildOrganizationContext } from './organizationProvenanceService';
import { hasEmployerContext } from './employerInference';

const PLATFORM_VENDORS = [
  'Supabase',
  'Vercel',
  'Railway',
  'OpenAI',
  'Google',
  'Stripe',
  'GitHub',
  'AWS',
  'Azure',
];

export function inferVendorPlatformOrganizations(text: string): OrganizationCandidate[] {
  const out: OrganizationCandidate[] = [];
  const seen = new Set<string>();
  const employerContext = hasEmployerContext(text);

  for (const vendor of PLATFORM_VENDORS) {
    const re = new RegExp(`\\b${vendor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    if (!re.test(text)) continue;
    const key = normalizeNameKey(vendor);
    if (seen.has(key)) continue;
    seen.add(key);

    const isEmployerMention =
      employerContext && new RegExp(`\\b(?:worked|working|at|for)\\s+${vendor}\\b`, 'i').test(text);

    out.push({
      displayName: vendor,
      organizationType: isEmployerMention ? 'employer' : 'platform',
      context: buildOrganizationContext(text, vendor, {
        roleToUser: isEmployerMention ? 'employer' : 'tool_provider',
      }),
      aliases: [],
      evidencePhrases: [vendor],
      sourceMessageIds: [],
      confidence: isEmployerMention ? 0.88 : 0.84,
      inferredNotConfirmed: true,
      requiresReview: false,
      promotionStatus: 'candidate',
    });
  }

  const apiMention = text.match(/\b(OpenAI|Google|Supabase|Vercel)\s+API\b/i);
  if (apiMention) {
    const displayName = apiMention[1];
    const key = normalizeNameKey(displayName);
    if (!seen.has(key)) {
      seen.add(key);
      out.push({
        displayName,
        organizationType: 'vendor',
        context: buildOrganizationContext(text, displayName, { roleToUser: 'tool_provider' }),
        aliases: [`${displayName} API`],
        evidencePhrases: [apiMention[0]],
        sourceMessageIds: [],
        confidence: 0.86,
        inferredNotConfirmed: true,
        requiresReview: false,
        promotionStatus: 'candidate',
      });
    }
  }

  return out;
}
