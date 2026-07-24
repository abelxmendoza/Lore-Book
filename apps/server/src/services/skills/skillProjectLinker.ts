/**
 * Link skills to projects (e.g. LoreBook) without treating projects as skills.
 */

import { isLoreBookProjectLabel } from './skillCanonicalResolver';
import type { SkillRelationshipProposal } from './skillCognitionTypes';

export function linkSkillToProjects(
  canonicalTitle: string,
  evidenceText: string,
  entityType: string,
): { projectLinks: string[]; relationships: SkillRelationshipProposal[]; rulesFired: string[] } {
  const projectLinks: string[] = [];
  const relationships: SkillRelationshipProposal[] = [];
  const rulesFired: string[] = [];

  if (isLoreBookProjectLabel(canonicalTitle) || entityType === 'PROJECT') {
    projectLinks.push('LoreBook');
    rulesFired.push('span_is_project');
    return { projectLinks, relationships, rulesFired };
  }

  if (/lorebook/i.test(canonicalTitle) || /lorebook/i.test(evidenceText)) {
    projectLinks.push('LoreBook');
    relationships.push({
      relatedName: 'LoreBook',
      relation: 'APPLIED_IN',
      confidence: 0.85,
      reasons: ['lorebook_mentioned'],
    });
    rulesFired.push('applied_in_lorebook');
  }

  return { projectLinks, relationships, rulesFired };
}
