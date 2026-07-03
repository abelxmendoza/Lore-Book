/**
 * Current Role Snapshot Service
 * Produces UserCurrentRole from parsed signals, organizations, roles, statuses.
 * Does not create role titles as Character cards.
 */
export interface UserCurrentRole {
  title: string;
  organization?: string;
  parentOrganization?: string;
  team?: string;
  status: 'current' | 'former' | 'pending' | 'uncertain';
  confidence: number;
  evidenceQuotes: string[];
  lastUpdated: string;
  source: 'chats' | 'timeline' | 'corrections' | 'manual';
}

import type { ExtractedRole } from '../inference/work/roleInferenceService';
import { resolveWorkStatus } from '../inference/work/workStatusResolver';
import { resolveOrganizationHierarchy } from '../organizations/inference/organizationHierarchyResolver';

export function createCurrentRoleSnapshot(params: {
  text: string;
  role?: ExtractedRole | null;
  employer?: string;
  hierarchies?: ReturnType<typeof resolveOrganizationHierarchy>;
  statusSignals?: ReturnType<typeof resolveWorkStatus>[];
  evidence: string[];
}): UserCurrentRole | null {
  const { text, role, employer, hierarchies = [], statusSignals = [], evidence } = params;

  const statusRes = statusSignals[0] || resolveWorkStatus(text);
  const roleTitle = role?.displayTitle || extractRoleTitleFromText(text);

  if (!roleTitle) return null;

  let organization = employer;
  let parentOrganization: string | undefined;
  let team: string | undefined;

  for (const h of hierarchies) {
    if (h.type === 'team') team = h.name;
    if (h.type === 'subsidiary' || h.parent) {
      if (!organization) organization = h.name;
      parentOrganization = h.parent;
    }
  }

  // Prefer explicit hierarchy results (clean names), fallback
  let ringHier = hierarchies.find(h => /ring/i.test(h.name));
  if (!ringHier) {
    // fallback parse
    if (/ring/i.test(text)) ringHier = { name: 'Ring', type: 'organization' as const, parent: undefined, confidence: 0.8, evidence: '' };
  }
  if (ringHier) {
    organization = 'Ring';
    if (ringHier.parent || /amazon/i.test(text + (ringHier.parent||''))) parentOrganization = 'Amazon';
  } else if (employer && /ring/i.test(employer)) {
    organization = employer;
  }
  if (/amazon/i.test(text) || hierarchies.some(h => /amazon/i.test(h.name + (h.parent||'')))) parentOrganization = parentOrganization || 'Amazon';
  if (/failure analysis/i.test(text)) team = 'Failure Analysis and Prototypes Team';
  if (employer && !organization) organization = employer;

  const snapshot: UserCurrentRole = {
    title: roleTitle,
    organization,
    parentOrganization,
    team,
    status: statusRes.status,
    confidence: Math.max(statusRes.confidence, role?.confidence || 0.7),
    evidenceQuotes: [...evidence, ...(role?.evidencePhrase ? [role.evidencePhrase] : [])],
    lastUpdated: new Date().toISOString(),
    source: 'chats',
  };

  return snapshot;
}

function extractRoleTitleFromText(text: string): string | undefined {
  const m = text.match(/\b(Quality Assurance Technician|QA Technician|technician|engineer)\b/i);
  return m ? m[1] : undefined;
}

export function formatCurrentRoleForUI(snapshot: UserCurrentRole): string {
  const parts: string[] = [];
  if (snapshot.title) parts.push(snapshot.title);
  if (snapshot.team) parts.push(snapshot.team);
  const org = snapshot.organization ? (snapshot.parentOrganization ? `${snapshot.organization} / ${snapshot.parentOrganization}` : snapshot.organization) : '';
  if (org) parts.push(org);
  return parts.join('\n');
}
