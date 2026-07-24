/**
 * Responsibility cluster linking (family support, logistics) — avoid skill spam.
 */

import { normalizeSkillKey } from './skillIdentity';
import type { SkillRelationshipProposal } from './skillCognitionTypes';

const FAMILY_CLUSTER = [
  'family care coordination',
  'family caregiving',
  'family caregiving / errand running',
  'driving and errand coordination',
  'scheduling',
  'family logistics',
  'family support',
  'errand running',
];

export function linkSkillResponsibility(
  canonicalTitle: string,
  entityType: string,
): {
  responsibilityCluster?: string;
  relationships: SkillRelationshipProposal[];
  rulesFired: string[];
  shouldRouteToResponsibility: boolean;
} {
  const key = normalizeSkillKey(canonicalTitle);
  const rulesFired: string[] = [];
  const relationships: SkillRelationshipProposal[] = [];

  if (entityType === 'RESPONSIBILITY' || FAMILY_CLUSTER.some((c) => normalizeSkillKey(c) === key)) {
    rulesFired.push('family_support_cluster');
    relationships.push({
      relatedName: 'Family Support',
      relation: 'RELATED_TO',
      confidence: 0.9,
      reasons: ['responsibility_cluster'],
    });
    // Scheduling can remain a skill under Practical Coordination
    const isScheduling = key === normalizeSkillKey('scheduling');
    return {
      responsibilityCluster: 'Family Support',
      relationships,
      rulesFired,
      shouldRouteToResponsibility: !isScheduling,
    };
  }

  return {
    relationships,
    rulesFired,
    shouldRouteToResponsibility: false,
  };
}
