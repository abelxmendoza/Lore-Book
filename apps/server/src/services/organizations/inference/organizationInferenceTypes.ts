/** Organization / institution inference from chat — candidate model before card promotion. */

export type OrganizationType =
  | 'company'
  | 'employer'
  | 'school'
  | 'university'
  | 'bootcamp'
  | 'startup'
  | 'investor'
  | 'agency'
  | 'platform'
  | 'vendor'
  | 'client'
  | 'program'
  | 'community_org'
  | 'unknown_organization';

export type OrganizationRoleToUser =
  | 'employer'
  | 'school'
  | 'client'
  | 'vendor'
  | 'investor'
  | 'tool_provider'
  | 'program'
  | 'unknown';

export type OrganizationPromotionStatus =
  | 'mention_only'
  | 'candidate'
  | 'suggested_organization'
  | 'confirmed_organization';

export type OrganizationInferenceContext = {
  roleToUser?: OrganizationRoleToUser;
  placeContext?: string;
  worksiteContext?: string;
  projectContext?: string;
  personContext?: string;
  timeContext?: string;
};

export type OrganizationCandidate = {
  displayName: string;
  organizationType: OrganizationType;
  context: OrganizationInferenceContext;
  aliases: string[];
  evidencePhrases: string[];
  sourceMessageIds: string[];
  confidence: number;
  inferredNotConfirmed: boolean;
  requiresReview: boolean;
  promotionStatus: OrganizationPromotionStatus;
  rejectionReason?: string;
};

export type OrganizationInferenceInput = {
  text: string;
  sourceMessageId?: string;
  authorRole?: 'user' | 'assistant' | 'system';
  mentionCount?: number;
  userConfirmed?: boolean;
  priorMentionCounts?: Record<string, number>;
  knownDomains?: Record<string, 'person' | 'place' | 'event' | 'project' | 'organization' | 'group' | 'junk'>;
};

export type OrganizationInferenceResult = {
  accepted: OrganizationCandidate[];
  rejected: Array<{ displayName: string; reason: string }>;
};
