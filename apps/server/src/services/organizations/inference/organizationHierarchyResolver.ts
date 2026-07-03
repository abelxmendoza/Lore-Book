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

const PARENT_RE = /\b([A-Z][A-Za-z\s&]+?)\s+(?:a sub(?:sidiary)?(?: company)? of|subsidiary of|parent (?:company|org)(?: is| of)|under)\s+([A-Z][A-Za-z\s&]+)\b/i;
const TEAM_RE = /\b([A-Z][A-Za-z\s&]+? Team)\s+(?:at|of|in)\s+([A-Z][A-Za-z\s&]+)\b/i;

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
