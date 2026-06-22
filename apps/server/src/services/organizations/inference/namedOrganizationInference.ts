import { normalizeNameKey } from '../../../utils/nameNormalization';
import type { OrganizationCandidate } from './organizationInferenceTypes';

export const BARE_GENERIC_ORG_WORDS = new Set([
  'company',
  'school',
  'bootcamp',
  'workplace',
  'agency',
  'program',
  'platform',
  'team',
  'startup',
  'class',
  'project',
  'app',
  'people',
  'coworkers',
  'coworker',
  'organization',
  'institution',
  'employer',
  'university',
  'college',
]);

export function isBareGenericOrgWord(name: string): boolean {
  return BARE_GENERIC_ORG_WORDS.has(normalizeNameKey(name));
}

const KNOWN_ORGANIZATIONS: Array<{
  displayName: string;
  organizationType: OrganizationCandidate['organizationType'];
  aliases?: string[];
  defaultRole?: OrganizationCandidate['context']['roleToUser'];
  confidence: number;
}> = [
  { displayName: 'Vanguard Robotics', organizationType: 'employer', confidence: 0.92 },
  { displayName: 'Amazon', organizationType: 'employer', aliases: ['AMZN'], confidence: 0.9 },
  { displayName: 'Supabase', organizationType: 'platform', defaultRole: 'tool_provider', confidence: 0.88 },
  { displayName: 'Vercel', organizationType: 'platform', defaultRole: 'tool_provider', confidence: 0.88 },
  { displayName: 'Railway', organizationType: 'platform', defaultRole: 'tool_provider', confidence: 0.86 },
  { displayName: 'CSUF', organizationType: 'university', aliases: ['California State University Fullerton'], confidence: 0.9 },
  {
    displayName: 'Whittier Christian Middle School',
    organizationType: 'school',
    confidence: 0.92,
  },
  { displayName: 'Clever Programmer Bootcamp', organizationType: 'bootcamp', defaultRole: 'program', confidence: 0.9 },
  { displayName: 'Antler', organizationType: 'investor', defaultRole: 'investor', confidence: 0.88 },
  { displayName: 'Kforce', organizationType: 'agency', confidence: 0.85 },
  { displayName: 'Serve Robotics', organizationType: 'company', confidence: 0.86 },
  { displayName: 'RLH Industries', organizationType: 'company', confidence: 0.85 },
  { displayName: 'Google', organizationType: 'platform', defaultRole: 'tool_provider', confidence: 0.86 },
  { displayName: 'OpenAI', organizationType: 'platform', defaultRole: 'tool_provider', confidence: 0.88 },
];

export function inferNamedOrganizations(text: string): OrganizationCandidate[] {
  const out: OrganizationCandidate[] = [];
  const seen = new Set<string>();

  for (const known of KNOWN_ORGANIZATIONS) {
    const patterns = [known.displayName, ...(known.aliases ?? [])];
    for (const pattern of patterns) {
      const re = new RegExp(`\\b${escapeRe(pattern)}\\b`, 'i');
      if (!re.test(text)) continue;
      const key = normalizeNameKey(known.displayName);
      if (seen.has(key)) continue;
      seen.add(key);

      out.push({
        displayName: known.displayName,
        organizationType: known.organizationType,
        context: { roleToUser: known.defaultRole ?? 'unknown' },
        aliases: known.aliases ?? [],
        evidencePhrases: [pattern],
        sourceMessageIds: [],
        confidence: known.confidence,
        inferredNotConfirmed: true,
        requiresReview: false,
        promotionStatus: 'candidate',
      });
      break;
    }
  }

  return out;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
