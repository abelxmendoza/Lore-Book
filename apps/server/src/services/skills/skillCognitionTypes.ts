/**
 * Skill Cognition & Consolidation Engine v1 — shared types.
 * Skills Book records are durable, reusable abilities demonstrated by the user —
 * not topics, projects, activities, responsibilities, or other people's expertise.
 */

export type CapabilityEntityType =
  | 'SKILL'
  | 'KNOWLEDGE_AREA'
  | 'ACTIVITY'
  | 'HOBBY'
  | 'INTEREST'
  | 'RESPONSIBILITY'
  | 'ROLE'
  | 'PROCESS'
  | 'PROJECT'
  | 'PROJECT_APPLICATION'
  | 'TRAIT'
  | 'CERTIFICATION'
  | 'FIELD_OF_STUDY'
  | 'SOCIAL_CONTEXT'
  | 'OBSERVATION'
  | 'UNKNOWN';

export type EvidenceRealityContext =
  | 'REAL_WORLD'
  | 'FICTION'
  | 'ROLEPLAY'
  | 'JOKE'
  | 'HYPOTHETICAL'
  | 'QUOTE'
  | 'OTHER_PERSON'
  | 'UNCERTAIN';

export type SkillSubjectType =
  | 'USER'
  | 'OTHER_PERSON'
  | 'ORGANIZATION'
  | 'FICTIONAL_CHARACTER'
  | 'UNKNOWN';

export type SkillAgentResolution = {
  subjectEntityId?: string;
  subjectName?: string;
  subjectType: SkillSubjectType;
  resolutionMethod:
    | 'explicit_subject'
    | 'pronoun_resolution'
    | 'conversation_subject'
    | 'quoted_subject'
    | 'unresolved';
  confidence: number;
  reasons: string[];
};

export type SkillEvidenceStrength =
  | 'DIRECT_DEMONSTRATION'
  | 'REPEATED_PRACTICE'
  | 'PROFESSIONAL_USE'
  | 'EDUCATION'
  | 'CERTIFICATION'
  | 'SELF_REPORT'
  | 'INDIRECT_INFERENCE'
  | 'BARE_MENTION';

export type SkillCandidateDecision =
  | 'CREATE'
  | 'AUTO_MERGE'
  | 'SUGGEST_MERGE'
  | 'ADD_AS_ALIAS'
  | 'ADD_AS_CHILD_SKILL'
  | 'LINK_AS_PROJECT_APPLICATION'
  | 'ROUTE_TO_OTHER_ONTOLOGY'
  | 'REJECT'
  | 'NEEDS_REVIEW';

export type SkillUsageFrequencyV2 =
  | 'UNKNOWN'
  | 'OBSERVED_ONCE'
  | 'RARE'
  | 'MONTHLY'
  | 'WEEKLY'
  | 'MULTIPLE_TIMES_WEEKLY'
  | 'DAILY';

export type SkillTrajectoryV2 =
  | 'UNKNOWN'
  | 'EMERGING'
  | 'IMPROVING'
  | 'STABLE'
  | 'DECLINING'
  | 'DORMANT';

export type SkillMonetizationV2 =
  | 'currently_paid'
  | 'previously_paid'
  | 'directly_market_validated'
  | 'career_relevant'
  | 'possible_but_unvalidated'
  | 'hobby_only'
  | 'not_applicable'
  | 'unknown';

export type SkillProficiencyEstimate = {
  score?: number;
  range?: { min: number; max: number };
  label: 'UNKNOWN' | 'BEGINNER' | 'DEVELOPING' | 'COMPETENT' | 'ADVANCED' | 'EXPERT';
  evidenceDepth: 'NONE' | 'WEAK' | 'MODERATE' | 'STRONG' | 'EXTENSIVE';
  confidence: number;
  reasons: string[];
};

export type SkillObservationCoverage = {
  observedDays: number;
  relevantConversationCount: number;
  lastRelevantObservationAt?: string;
  coverageConfidence: number;
};

export type SkillRelationshipKind =
  | 'PARENT_OF'
  | 'SPECIALIZATION_OF'
  | 'SUPPORTS'
  | 'APPLIED_IN'
  | 'USES_TOOL'
  | 'PRACTICED_IN'
  | 'RELATED_TO';

export type SkillRelationshipProposal = {
  parentSkillName?: string;
  childSkillName?: string;
  relatedName?: string;
  relation: SkillRelationshipKind;
  confidence: number;
  reasons: string[];
};

export type KnownSkillRecord = {
  id?: string;
  name: string;
  aliases?: string[];
  parentName?: string;
};

export type SkillCognitionInput = {
  /** Proposed skill / capability label */
  span: string;
  /** Supporting evidence text (usually the source utterance) */
  evidenceText?: string;
  sourceType?: 'chat' | 'journal' | 'user_import' | 'assistant' | 'system' | 'manual' | 'test';
  sourceMessageId?: string;
  proposedConfidence?: number;
  proposedProficiency?: number;
  proposedUsageFrequency?: string;
  proposedTrajectory?: string;
  proposedMonetization?: string;
  knownSkills?: KnownSkillRecord[];
  /** Distinct practice timestamps for this skill (ISO strings), if known */
  practiceEventAts?: string[];
  userConfirmed?: boolean;
  /** Self character / user display names for ownership resolution */
  userNames?: string[];
  /** Known non-self person names (entity/character registry) */
  knownPersonNames?: string[];
  /**
   * Existing Skills Book rows: when evidence is thin/ambiguous, prefer USER
   * rather than archiving durable skills on weak third-person mentions.
   */
  preferUserWhenAmbiguous?: boolean;
};

export type SkillCognitionResult = {
  decision: SkillCandidateDecision;
  canonicalTitle: string;
  aliases: string[];
  entityType: CapabilityEntityType;
  subject: SkillAgentResolution;
  realityContext: EvidenceRealityContext;
  evidenceStrength: SkillEvidenceStrength;
  existenceConfidence: number;
  proficiency: SkillProficiencyEstimate;
  usageFrequency: SkillUsageFrequencyV2;
  trajectory: SkillTrajectoryV2;
  monetization: SkillMonetizationV2;
  matchExistingName?: string;
  parentSkillName?: string;
  projectLinks: string[];
  relationships: SkillRelationshipProposal[];
  status: 'accepted' | 'merged' | 'routed' | 'rejected' | 'needs_review';
  rejectionReason?: string;
  routeTarget?: CapabilityEntityType;
  rulesFired: string[];
  reasonsAccepted: string[];
  reasonsRejected: string[];
  diagnostics: SkillDiagnosticTrace;
};

export type SkillDiagnosticTrace = {
  originalSpan: string;
  canonicalTitle: string;
  entityType: CapabilityEntityType;
  decision: SkillCandidateDecision;
  subject: SkillAgentResolution;
  realityContext: EvidenceRealityContext;
  evidenceStrength: SkillEvidenceStrength;
  existenceConfidence: number;
  proficiency: SkillProficiencyEstimate;
  usageFrequency: SkillUsageFrequencyV2;
  trajectory: SkillTrajectoryV2;
  monetization: SkillMonetizationV2;
  matchExistingName?: string;
  parentSkillName?: string;
  projectLinks: string[];
  relationships: SkillRelationshipProposal[];
  reasonsAccepted: string[];
  reasonsRejected: string[];
  rulesFired: string[];
};

export const EVIDENCE_STRENGTH_WEIGHT: Record<SkillEvidenceStrength, number> = {
  DIRECT_DEMONSTRATION: 1.0,
  PROFESSIONAL_USE: 0.95,
  REPEATED_PRACTICE: 0.9,
  CERTIFICATION: 0.9,
  EDUCATION: 0.8,
  SELF_REPORT: 0.65,
  INDIRECT_INFERENCE: 0.35,
  BARE_MENTION: 0.1,
};
