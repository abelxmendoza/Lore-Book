export type CognitiveChangeType =
  | 'IDENTITY_STRENGTHENED'
  | 'IDENTITY_WEAKENED'
  | 'RELATIONSHIP_CHANGED'
  | 'GOAL_COMPLETED'
  | 'GOAL_ABANDONED'
  | 'GOAL_REPRIORITIZED'
  | 'PROJECT_STARTED'
  | 'PROJECT_COMPLETED'
  | 'PROJECT_STATUS_CHANGED'
  | 'CURRENT_FOCUS_CHANGED'
  | 'LIFE_EVENT_DETECTED'
  | 'CAREER_MILESTONE'
  | 'CHAPTER_STARTED'
  | 'CHAPTER_ENDED'
  | 'RECURRING_PATTERN_CANDIDATE'
  | 'TIMELINE_CORRECTION'
  | 'CONTRADICTION_DETECTED';

export type CognitiveDomain =
  | 'identity'
  | 'career'
  | 'relationships'
  | 'goals'
  | 'projects'
  | 'education'
  | 'music'
  | 'health'
  | 'community'
  | 'timeline'
  | 'narrative';

export type ProjectionKind =
  | 'assertions'
  | 'canonical_timeline'
  | 'relationship_projection'
  | 'goal_projection'
  | 'quest_projection'
  | 'project_projection'
  | 'narrative_ir'
  | 'identity_snapshot'
  | 'context_plan_cache';

export type ProjectionUpdateAction =
  | 'NO_ACTION'
  | 'INCREMENTAL_REFRESH'
  | 'FULL_REGENERATION'
  | 'MARK_STALE'
  | 'REVIEW_REQUIRED';

export type UpdatePriority = 'HIGH' | 'MEDIUM' | 'LOW' | 'DEFERRED' | 'IDLE';

export type CognitiveEvidenceInput = {
  evidenceId: string;
  userId: string;
  content: string;
  source: 'chat_message' | 'journal_entry' | 'document' | 'import' | 'manual';
  authorRole: 'user' | 'assistant' | 'external';
  recordedAt: string;
  occurredAt?: string | null;
  entityIds?: string[];
  unitIds?: string[];
  confidence?: number;
  batchSize?: number;
};

export type CognitiveStateSnapshot = {
  revision?: string;
  currentChapter?: { id: string; domain: CognitiveDomain; status: string } | null;
  activeGoals?: Array<{ id: string; title: string; status: string }>;
  activeProjects?: Array<{ id: string; title: string; status: string }>;
  identityThreads?: Array<{ id: string; domain: CognitiveDomain; strength: number }>;
};

export type CognitiveChange = {
  type: CognitiveChangeType;
  domain: CognitiveDomain;
  summary: string;
  confidence: number;
  status: 'OBSERVED' | 'CANDIDATE' | 'REVIEW_REQUIRED';
  evidenceIds: string[];
  previousStateRef?: string;
};

export type ProjectionImpact = {
  projection: ProjectionKind;
  action: ProjectionUpdateAction;
  priority: UpdatePriority;
  reason: string;
  causedBy: CognitiveChangeType[];
  dependsOn: ProjectionKind[];
};

export type CognitiveDiff = {
  id: string;
  version: 'cognitive-update-v1';
  evaluatedAt: string;
  mode: 'SHADOW';
  trigger: {
    evidenceId: string;
    source: CognitiveEvidenceInput['source'];
    stateRevision: string | null;
  };
  changed: boolean;
  changes: CognitiveChange[];
  impacts: ProjectionImpact[];
  confidence: number;
  requiresReview: boolean;
  noChangeReason?: string;
  invariants: {
    rawEvidenceMutated: false;
    canonicalStateMutated: false;
  };
};
