import type { TruthClaim, TruthState, TruthStateAuditEntry } from './truthStateTypes';

export type TruthStateTransitionKey = `${TruthState}->${TruthState}`;

const VALID_TRANSITIONS: Partial<Record<TruthStateTransitionKey, { reason: string }>> = {
  'observed->candidate': { reason: 'user_statement_detected' },
  'observed->inferred': { reason: 'system_inference_detected' },
  'observed->review_required': { reason: 'assistant_or_sensitive_observation' },
  'candidate->review_required': { reason: 'sensitive_or_low_confidence' },
  'candidate->user_confirmed': { reason: 'user_confirmation' },
  'candidate->system_confirmed': { reason: 'promotion_high_confidence' },
  'candidate->rejected': { reason: 'user_rejection' },
  'candidate->contradicted': { reason: 'canon_conflict' },
  'candidate->archived': { reason: 'user_archive' },
  'inferred->review_required': { reason: 'inference_needs_review' },
  'inferred->user_confirmed': { reason: 'user_confirmation' },
  'inferred->system_confirmed': { reason: 'promotion_repeated_evidence' },
  'inferred->contradicted': { reason: 'canon_conflict' },
  'inferred->rejected': { reason: 'user_rejection' },
  'inferred->archived': { reason: 'superseded_or_user_archive' },
  'review_required->user_confirmed': { reason: 'user_confirmation' },
  'review_required->rejected': { reason: 'user_rejection' },
  'review_required->contradicted': { reason: 'canon_conflict' },
  'review_required->archived': { reason: 'superseded_or_user_archive' },
  'user_confirmed->archived': { reason: 'user_archive' },
  'user_confirmed->contradicted': { reason: 'canon_conflict' },
  'system_confirmed->archived': { reason: 'user_archive' },
  'system_confirmed->contradicted': { reason: 'canon_conflict' },
  'contradicted->review_required': { reason: 'conflict_review' },
  'contradicted->user_confirmed': { reason: 'user_resolved_conflict' },
  'rejected->archived': { reason: 'rejection_archived' },
};

export function canTransition(from: TruthState, to: TruthState): boolean {
  if (from === to) return true;
  const key: TruthStateTransitionKey = `${from}->${to}`;
  return key in VALID_TRANSITIONS;
}

export function transitionClaim(
  claim: TruthClaim,
  toState: TruthState,
  reason: string,
  actor: TruthStateAuditEntry['actor'] = 'system',
): { claim: TruthClaim; audit: TruthStateAuditEntry } {
  if (!canTransition(claim.truthState, toState) && claim.truthState !== toState) {
    throw new Error(`Invalid truth-state transition: ${claim.truthState} → ${toState}`);
  }

  const timestamp = new Date().toISOString();
  const audit: TruthStateAuditEntry = {
    id: crypto.randomUUID(),
    claimId: claim.id,
    fromState: claim.truthState,
    toState,
    reason,
    actor,
    timestamp,
  };

  return {
    claim: { ...claim, truthState: toState, updatedAt: timestamp },
    audit,
  };
}

export function promoteToConfirmed(
  claim: TruthClaim,
  via: 'user' | 'system',
): { claim: TruthClaim; audit: TruthStateAuditEntry } {
  const toState = via === 'user' ? 'user_confirmed' : 'system_confirmed';
  return transitionClaim(
    claim,
    toState,
    via === 'user' ? 'user_confirmation' : 'promotion_rule',
    via === 'user' ? 'user' : 'system',
  );
}

export function rejectClaim(
  claim: TruthClaim,
  reason = 'user_rejection',
): { claim: TruthClaim; audit: TruthStateAuditEntry } {
  return transitionClaim(claim, 'rejected', reason, 'user');
}

export function archiveClaim(
  claim: TruthClaim,
  reason = 'user_archive',
): { claim: TruthClaim; audit: TruthStateAuditEntry } {
  return transitionClaim(claim, 'archived', reason, 'user');
}

export function canPromote(
  claim: TruthClaim,
  opts: { userConfirmed?: boolean; mentionCount?: number; linkedToCanon?: boolean },
): boolean {
  if (claim.truthState === 'rejected' || claim.truthState === 'archived') return false;
  if (claim.origin === 'assistant_generated') return false;
  if (claim.sensitiveCategories.length > 0 && !opts.userConfirmed) return false;
  if (opts.userConfirmed) return true;
  if ((opts.mentionCount ?? claim.mentionCount) >= 2 && claim.confidence >= 0.75) return true;
  if (claim.confidence >= 0.88 && claim.sensitiveCategories.length === 0) return true;
  if (opts.linkedToCanon || claim.linkedToCanon) return true;
  return false;
}
