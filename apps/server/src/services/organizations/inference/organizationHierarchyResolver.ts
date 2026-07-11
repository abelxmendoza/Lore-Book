/**
 * Organization Hierarchy Resolver
 * Detects parent orgs, subsidiaries, teams from phrases like "Ring a sub company of Amazon", "Team at Ring"
 */
export interface OrgHierarchy {
  name: string;
  type: 'organization' | 'team' | 'subsidiary';
  parent?: string;
  confidence: number;
  evidence: string;
}

// Cap org name length to avoid polynomial backtracking (CodeQL js/polynomial-redos).
const ORG_TOKEN = String.raw`[A-Z][A-Za-z0-9&'.-]{0,30}`;
const ORG_NAME = String.raw`${ORG_TOKEN}(?:\s+${ORG_TOKEN}){0,5}`;
const PARENT_RE = new RegExp(
  String.raw`\b(${ORG_NAME})\s+(?:a sub(?:sidiary)?(?: company)? of|subsidiary of|parent (?:company|org)(?: is| of)|under)\s+(${ORG_NAME})\b`,
  'i',
);
const TEAM_RE = new RegExp(
  String.raw`\b(${ORG_NAME}\s+Team)\s+(?:at|of|in)\s+(${ORG_NAME})\b`,
  'i',
);

export function resolveOrganizationHierarchy(text: string): OrgHierarchy[] {
  const results: OrgHierarchy[] = [];

  const parentMatch = text.match(PARENT_RE);
  if (parentMatch) {
    const child = parentMatch[1].trim();
    const parent = parentMatch[2].trim();
    results.push({
      name: child,
      type: 'subsidiary',
      parent,
      confidence: 0.9,
      evidence: parentMatch[0],
    });
  }

  const teamMatch = text.match(TEAM_RE);
  if (teamMatch) {
    const team = teamMatch[1].trim();
    const org = teamMatch[2].trim();
    results.push({
      name: team,
      type: 'team',
      parent: org,
      confidence: 0.88,
      evidence: teamMatch[0],
    });
  }

  // "Ring / Amazon" or "at Ring (Amazon)"
  const slashMatch = text.match(/\b([A-Z][\w]+)\s*[/]\s*([A-Z][\w]+)\b/);
  if (slashMatch) {
    results.push({
      name: slashMatch[1],
      type: 'organization',
      parent: slashMatch[2],
      confidence: 0.75,
      evidence: slashMatch[0],
    });
  }

  return results;
}

export function buildHierarchyFromResults(results: OrgHierarchy[]): Record<string, any> {
  const hierarchy: Record<string, any> = {};
  for (const r of results) {
    if (r.parent) {
      hierarchy[r.name] = { parent: r.parent, type: r.type };
    }
  }
  return hierarchy;
}
