/**
 * Parent / child / project-application hierarchy proposals.
 */

import { normalizeSkillKey } from './skillIdentity';
import type { SkillRelationshipProposal } from './skillCognitionTypes';

const PARENT_MAP: Array<{ child: string | RegExp; parent: string }> = [
  { child: 'front-end development', parent: 'Software Product Development' },
  { child: 'frontend development', parent: 'Software Product Development' },
  { child: 'ai-assisted coding', parent: 'Software Product Development' },
  { child: 'software debugging', parent: 'Software Product Development' },
  { child: 'product iteration', parent: 'Software Product Development' },
  { child: 'product testing', parent: 'Software Product Development' },
  { child: 'ui/ux design', parent: 'Software Product Development' },
  { child: 'coding', parent: 'Software Product Development' },
  { child: 'interviewing', parent: 'Career Navigation' },
  { child: 'professional self-marketing', parent: 'Career Navigation' },
  { child: 'marketing myself', parent: 'Career Navigation' },
  { child: 'self-advocacy', parent: 'Career Navigation' },
  { child: 'muay thai', parent: 'Combat Sports' },
  { child: 'brazilian jiu-jitsu', parent: 'Combat Sports' },
  { child: 'scheduling', parent: 'Practical Coordination' },
  { child: 'appointment coordination', parent: 'Practical Coordination' },
  { child: 'transportation coordination', parent: 'Practical Coordination' },
  { child: /cosplay\s+planning/i, parent: 'Cosplay' },
  { child: /costume\s+planning/i, parent: 'Cosplay' },
];

export function resolveSkillHierarchy(
  canonicalTitle: string,
  evidenceText = '',
): {
  parentSkillName?: string;
  relationships: SkillRelationshipProposal[];
  rulesFired: string[];
} {
  const key = normalizeSkillKey(canonicalTitle);
  const rulesFired: string[] = [];
  const relationships: SkillRelationshipProposal[] = [];
  let parentSkillName: string | undefined;

  for (const row of PARENT_MAP) {
    const hit =
      typeof row.child === 'string'
        ? normalizeSkillKey(row.child) === key
        : row.child.test(canonicalTitle);
    if (hit) {
      parentSkillName = row.parent;
      rulesFired.push(`parent:${row.parent}`);
      relationships.push({
        parentSkillName: row.parent,
        childSkillName: canonicalTitle,
        relation: 'SPECIALIZATION_OF',
        confidence: 0.85,
        reasons: ['hierarchy_map'],
      });
      break;
    }
  }

  // LoreBook project application
  if (
    /lorebook/i.test(canonicalTitle)
    || /lorebook/i.test(evidenceText)
  ) {
    if (!/^lorebook$/i.test(canonicalTitle.trim())) {
      relationships.push({
        relatedName: 'LoreBook',
        relation: 'APPLIED_IN',
        confidence: 0.8,
        reasons: ['lorebook_project_context'],
      });
      rulesFired.push('applied_in_lorebook');
    }
  }

  // Social context practice
  if (
    /goth|underground|clubbing|nightlife/i.test(evidenceText)
    && /network|social/i.test(canonicalTitle)
  ) {
    relationships.push({
      relatedName: 'Goth / Underground Nightlife',
      relation: 'PRACTICED_IN',
      confidence: 0.7,
      reasons: ['social_context'],
    });
    rulesFired.push('practiced_in_nightlife');
  }

  return { parentSkillName, relationships, rulesFired };
}
