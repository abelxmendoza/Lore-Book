/**
 * Professional / workplace ontology types for LoreBook inference.
 * All workplace facts remain review-first until user confirmation.
 */

export type ProfessionalEntityKind =
  | 'Organization'
  | 'Role'
  | 'Team'
  | 'Worksite'
  | 'DeploymentSite'
  | 'Project'
  | 'WorkActivity'
  | 'ProfessionalSkill';

export type ProfessionalRelationshipType =
  | 'coworker'
  | 'manager'
  | 'direct_report'
  | 'mentor'
  | 'client'
  | 'customer'
  | 'vendor'
  | 'operator'
  | 'technician'
  | 'engineer'
  | 'field_support'
  | 'teammate'
  | 'worked_for'
  | 'worked_with'
  | 'deployed_to'
  | 'member_of';

export type SkillProficiencyTrend = 'emerging' | 'established' | 'expert_candidate';

export interface SkillProgressionRecord {
  skill: string;
  category: string;
  firstSeen?: string;
  lastSeen?: string;
  confidence: number;
  frequency: number;
  proficiencyTrend: SkillProficiencyTrend;
  inferredNotConfirmed: true;
}

export interface CareerTimelineEntry {
  organization: string;
  role?: string;
  skillsGained: string[];
  deploymentSites?: string[];
  confidence: number;
  inferredNotConfirmed: true;
}

export interface WorkplaceCommunityInference {
  communityName: string;
  members: string[];
  confidence: number;
  inferredNotConfirmed: true;
}

export interface OrganizationHierarchyNode {
  name: string;
  kind: ProfessionalEntityKind;
  children?: OrganizationHierarchyNode[];
}

export const SKILL_ESTABLISHED_THRESHOLD = 5;
export const SKILL_EXPERT_THRESHOLD = 8;

export const PROFESSIONAL_RELATIONSHIP_TYPES: ProfessionalRelationshipType[] = [
  'coworker',
  'manager',
  'direct_report',
  'mentor',
  'client',
  'customer',
  'vendor',
  'operator',
  'technician',
  'engineer',
  'field_support',
  'teammate',
  'worked_for',
  'worked_with',
  'deployed_to',
  'member_of',
];
