/**
 * ContextualKnowledgeBundle — orchestration envelope for one conversation turn.
 * Not a permanent table; carried through ingest + response planning + explain UI.
 */

export type KnowledgeThreadKind =
  | 'person_intro'
  | 'group_naming'
  | 'care_visit'
  | 'creative_milestone'
  | 'employment_interview'
  | 'project_work'
  | 'reflection'
  | 'inner_conflict'
  | 'other';

export type ReflectionModality =
  | 'CONSIDERING'
  | 'BELIEVES'
  | 'REALIZED'
  | 'UNCERTAIN'
  | 'JOKING_BUT_MEANINGFUL';

export type EntityProposal = {
  kind: 'person' | 'group' | 'project' | 'creative_work' | 'artist_identity';
  canonicalName: string;
  rolePhrase?: string | null;
  supportsAnchor?: string | null;
  aliases?: string[];
  groupType?: string;
  confidence: number;
  evidenceSpan?: string;
};

export type EventProposal = {
  kind: KnowledgeThreadKind;
  title: string;
  summary: string;
  isMilestone: boolean;
  milestoneScore?: number;
  participants?: string[];
  unresolvedParticipantCount?: number;
  intendedPlatforms?: string[];
  /** True when release/publication is intended but not confirmed live. */
  publicationUncertain?: boolean;
  confidence: number;
  evidenceSpan?: string;
};

export type ReflectionProposal = {
  insight:
    | 'NEED_FOR_SUPPORT'
    | 'AMBITION_VS_SUPPORT'
    | 'TECHNOLOGY_VS_HUMAN_CONNECTION'
    | 'PROJECT_MOTIVATION'
    | 'OTHER';
  statement: string;
  modality: ReflectionModality;
  humorSoftening: boolean;
  relatedProjectHint?: string;
  confidence: number;
  evidenceSpan?: string;
};

export type KnowledgeClarification = {
  question: string;
  about: string;
  priority: 'high' | 'medium' | 'low';
};

export type LoreResponseMode =
  | 'PERSON_ONBOARDING'
  | 'STORY_REFLECTION'
  | 'MILESTONE_ACKNOWLEDGEMENT'
  | 'MULTI_EVENT_SYNTHESIS'
  | 'MIXED';

export type LoreResponsePlan = {
  responseMode: LoreResponseMode;
  acknowledgedIntroductions: string[];
  confirmedKnowledge: string[];
  highlightedMilestones: string[];
  reflectedInsights: string[];
  unresolvedClarifications: string[];
  avoidedClaims: string[];
  promptBlock: string;
};

export type ContextualConfidenceBreakdown = {
  entityIntroduction: number;
  roleResolution: number;
  groupNameResolution: number;
  eventSegmentation: number;
  milestoneDetection: number;
  reflectionDetection: number;
  modalityPreservation: number;
  overallMutationConfidence: number;
};

export type ContextualKnowledgeBundle = {
  sourceMessageExcerpt: string;
  introducedEntities: EntityProposal[];
  groupProposals: EntityProposal[];
  eventProposals: EventProposal[];
  reflectionProposals: ReflectionProposal[];
  unresolvedQuestions: KnowledgeClarification[];
  threads: KnowledgeThreadKind[];
  dayMomentTitle: string | null;
  confidence: ContextualConfidenceBreakdown;
  responsePlan: LoreResponsePlan;
};
