import type { CanonicalMutationDecision } from '../canonicalMutation';
import type { ProjectRow } from '../projectService';

export type CanonicalStateTransitionType =
  | 'PROJECT_STATUS_CHANGED'
  | 'PROJECT_PRIORITY_CHANGED'
  | 'CURRENT_FOCUS_REPLACED'
  | 'LIFE_EVENT_DETECTED';

export type CanonicalStateTransition = {
  type: CanonicalStateTransitionType;
  subject: string;
  subjectId: string | null;
  before: string | string[] | null;
  after: string | string[];
  confidence: number;
  evidenceText: string;
  details?: Record<string, unknown>;
};

export type CanonicalStateDetection = {
  transitions: CanonicalStateTransition[];
  focusLabels: string[];
  unresolvedSubjects: string[];
};

export type CanonicalStateApplyResult = CanonicalStateDetection & {
  applied: CanonicalStateTransition[];
  unchanged: CanonicalStateTransition[];
  failed: Array<{ transition: CanonicalStateTransition; error: string }>;
  governance: CanonicalMutationDecision[];
  quality: {
    stateTransitionsDetected: number;
    stateTransitionsApplied: number;
    canonicalProjectsReused: number;
    unresolvedFocusLabels: number;
    governanceAutomatic: number;
    governanceReviewRequired: number;
    legacyNonAtomicWrites: number;
  };
};

export type CanonicalProject = Pick<
  ProjectRow,
  'id' | 'name' | 'normalized_name' | 'status' | 'importance_score' | 'metadata'
>;
