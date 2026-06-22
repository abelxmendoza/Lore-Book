import type { EvidenceBundle } from '../provenance/inference/provenanceInferenceTypes';

export type ContradictionType =
  | 'identity'
  | 'relationship'
  | 'timeline'
  | 'status'
  | 'domain'
  | 'attribute'
  | 'location'
  | 'employment'
  | 'school'
  | 'alias';

export type ContradictionSeverity = 'low' | 'medium' | 'high' | 'critical';

export type SuggestedResolution =
  | 'keep_existing'
  | 'replace_with_new'
  | 'split_entities'
  | 'merge_entities'
  | 'mark_time_bounded'
  | 'needs_user_review';

export type ContradictionReviewAction =
  | 'keep_existing'
  | 'replace_with_new'
  | 'mark_old_as_former'
  | 'split_entities'
  | 'merge_entities'
  | 'add_time_boundary'
  | 'reject_new_claim'
  | 'ask_me_later';

/** Reviewable tension between evidence — never silent overwrite. */
export type ContradictionCandidate = {
  id: string;
  contradictionType: ContradictionType;
  existingClaim: EvidenceBundle;
  newClaim: EvidenceBundle;
  severity: ContradictionSeverity;
  suggestedResolution: SuggestedResolution;
  requiresReview: true;
  reason: string;
  preserveBoth: true;
  createdAt: string;
};

export type StatusTransition = {
  id: string;
  entityOrSubject: string;
  fromStatus: string;
  toStatus: string;
  existingClaim: EvidenceBundle;
  newClaim: EvidenceBundle;
  isTransition: true;
  reason: string;
};

export type ContradictionDetectionInput = {
  existingClaims: EvidenceBundle[];
  newClaim: EvidenceBundle;
  knownCanonDomains?: Record<string, 'character' | 'project' | 'organization' | 'location' | 'group'>;
  seenAt?: string;
};

export type ContradictionDetectionResult = {
  contradictions: ContradictionCandidate[];
  transitions: StatusTransition[];
  rejectedWeakExtractions: EvidenceBundle[];
  preservedClaims: EvidenceBundle[];
};

export type ContradictionReviewItem = {
  candidate: ContradictionCandidate;
  availableActions: ContradictionReviewAction[];
};
