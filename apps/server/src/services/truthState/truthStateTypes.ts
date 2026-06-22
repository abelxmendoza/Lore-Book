export type TruthState =
  | 'observed'
  | 'candidate'
  | 'inferred'
  | 'review_required'
  | 'user_confirmed'
  | 'system_confirmed'
  | 'contradicted'
  | 'rejected'
  | 'archived';

export type TruthAttachmentType =
  | 'entity'
  | 'relationship'
  | 'event'
  | 'status'
  | 'preference'
  | 'skill'
  | 'timeline'
  | 'identity'
  | 'inference';

export type TruthClaimOrigin =
  | 'explicit_user'
  | 'implicit_user'
  | 'system_inferred'
  | 'assistant_generated'
  | 'user_corrected'
  | 'user_confirmed'
  | 'manual_edit';

export type SensitiveCategory =
  | 'family'
  | 'romantic'
  | 'conflict'
  | 'identity'
  | 'residence'
  | 'health'
  | 'finance'
  | 'substance'
  | 'minor_discipline'
  | 'employment';

/** Lifecycle state of a claim — not a LoreBook card. */
export type TruthClaim = {
  id: string;
  claimText: string;
  claimType: TruthAttachmentType;
  origin: TruthClaimOrigin;
  confidence: number;
  truthState: TruthState;
  sourceQuote: string;
  sourceMessageId?: string;
  sourceThreadId?: string;
  evidenceBundleId?: string;
  mentionCount: number;
  linkedToCanon: boolean;
  sensitiveCategories: SensitiveCategory[];
  rejectionKey: string;
  supersededById?: string;
  createdAt: string;
  updatedAt: string;
};

export type ConfirmationChipAction =
  | 'confirm'
  | 'edit'
  | 'merge'
  | 'keep_separate'
  | 'reject'
  | 'move_to_other_book'
  | 'mark_sensitive'
  | 'need_more_context';

export type ConfirmationChip = {
  id: string;
  claimId: string;
  label: string;
  action: ConfirmationChipAction;
  priority: number;
  reason?: string;
};

export type TruthStateAuditEntry = {
  id: string;
  claimId: string;
  fromState: TruthState;
  toState: TruthState;
  reason: string;
  actor: 'user' | 'system' | 'assistant';
  timestamp: string;
};

export type TruthStateEvaluationInput = {
  text: string;
  sourceMessageId?: string;
  sourceThreadId?: string;
  authorRole?: 'user' | 'assistant' | 'system';
  userConfirmed?: boolean;
  userRejected?: boolean;
  userCorrected?: boolean;
  manualEdit?: boolean;
  priorClaims?: TruthClaim[];
  rejectedKeys?: string[];
  seenAt?: string;
};

export type TruthStateEvaluationResult = {
  accepted: TruthClaim[];
  rejected: Array<{ claimText: string; reason: string }>;
  claimHistory: TruthClaim[];
  chips: ConfirmationChip[];
  audit: TruthStateAuditEntry[];
};

export const LOW_CONFIDENCE_THRESHOLD = 0.65;
export const HIGH_CONFIDENCE_THRESHOLD = 0.88;
export const PROMOTION_MENTION_THRESHOLD = 2;

export function claimRejectionKey(claimText: string, claimType: TruthAttachmentType): string {
  return `${claimType}:${claimText.toLowerCase().replace(/[^\w\s']/g, '').replace(/\s+/g, ' ').trim()}`;
}

export function isDurableTruthState(state: TruthState): boolean {
  return state === 'user_confirmed' || state === 'system_confirmed';
}

export function isReviewOnlyState(state: TruthState): boolean {
  return (
    state === 'observed' ||
    state === 'candidate' ||
    state === 'inferred' ||
    state === 'review_required' ||
    state === 'contradicted'
  );
}
