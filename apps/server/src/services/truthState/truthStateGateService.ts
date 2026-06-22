import { buildChipsForClaims } from './confirmationChipBuilder';
import {
  blocksDurableWrite,
  detectSensitiveCategories,
  isLowConfidence,
  requiresConfirmation,
  requiresRelationshipConfirmation,
} from './confirmationRequirementService';
import {
  findCanonConflict,
  preservesBothSides,
  shouldApplyIncoming,
} from './contradictionTruthResolver';
import { recordAudits } from './truthStateAuditService';
import { canOverride, correctionOutranksInference } from './truthAuthorityRanker';
import {
  archiveClaim,
  canPromote,
  promoteToConfirmed,
  rejectClaim,
  transitionClaim,
} from './truthStateTransitionService';
import type {
  TruthAttachmentType,
  TruthClaim,
  TruthClaimOrigin,
  TruthState,
  TruthStateAuditEntry,
  TruthStateEvaluationInput,
  TruthStateEvaluationResult,
} from './truthStateTypes';
import {
  claimRejectionKey,
  HIGH_CONFIDENCE_THRESHOLD,
  isDurableTruthState,
  PROMOTION_MENTION_THRESHOLD,
} from './truthStateTypes';

type RawCandidate = {
  claimText: string;
  claimType: TruthAttachmentType;
  origin: TruthClaimOrigin;
  confidence: number;
  sourceQuote: string;
};

function classifyOrigin(
  authorRole: 'user' | 'assistant' | 'system',
  opts: TruthStateEvaluationInput,
  isInference?: boolean,
): TruthClaimOrigin {
  if (opts.manualEdit) return 'manual_edit';
  if (opts.userCorrected) return 'user_corrected';
  if (opts.userConfirmed) return 'user_confirmed';
  if (authorRole === 'assistant') return 'assistant_generated';
  if (authorRole === 'system' || isInference) return 'system_inferred';
  return 'explicit_user';
}

function extractCandidates(text: string, authorRole: 'user' | 'assistant' | 'system'): RawCandidate[] {
  const out: RawCandidate[] = [];

  if (authorRole === 'assistant') {
    const important = text.match(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+was\s+important\s+to\s+you\b/i);
    if (important) {
      out.push({
        claimText: `${important[1].trim()} was important to the user`,
        claimType: 'inference',
        origin: 'assistant_generated',
        confidence: 0.45,
        sourceQuote: text.trim(),
      });
    }
    return out;
  }

  const bestFriend = text.match(/([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+is\s+my\s+best\s+friend/i);
  if (bestFriend) {
    out.push({
      claimText: `${bestFriend[1].trim()} is my best friend`,
      claimType: 'relationship',
      origin: 'explicit_user',
      confidence: 0.92,
      sourceQuote: text.trim(),
    });
  }

  const brother = text.match(/([A-Z][a-z]+)\s+is\s+my\s+(?:older\s+)?brother/i);
  if (brother) {
    out.push({
      claimText: `${brother[1].trim()} is my brother`,
      claimType: 'relationship',
      origin: 'explicit_user',
      confidence: 0.9,
      sourceQuote: text.trim(),
    });
  }

  const partner = text.match(/([A-Z][a-z]+)\s+is\s+my\s+(?:boyfriend|girlfriend|partner)/i);
  if (partner) {
    out.push({
      claimText: `${partner[1].trim()} is my partner`,
      claimType: 'relationship',
      origin: 'explicit_user',
      confidence: 0.9,
      sourceQuote: text.trim(),
    });
  }

  const notBestFriend = text.match(/([A-Z][a-z]+)\s+(?:and I\s+)?(?:is|are)\s+not\s+my\s+best\s+friend/i);
  if (notBestFriend) {
    out.push({
      claimText: `${notBestFriend[1].trim()} is not my best friend`,
      claimType: 'relationship',
      origin: 'explicit_user',
      confidence: 0.9,
      sourceQuote: text.trim(),
    });
  }

  const schoolmate = text.match(/\b(?:we|I)\s+went\s+to\s+(.+?)\s+with\s+([A-Z][a-z]+)\b/i);
  if (schoolmate) {
    out.push({
      claimText: `${schoolmate[2].trim()} is a schoolmate (attended ${schoolmate[1].trim()})`,
      claimType: 'relationship',
      origin: 'system_inferred',
      confidence: 0.68,
      sourceQuote: text.trim(),
    });
  }

  const nameFix = text.match(
    /\b(?:actually|correction:?)\s+(?:(?:his|her|their)|[A-Z][A-Za-z']+(?:\s+[A-Z][A-Za-z']+)*)\s+name\s+is\s+(.+?)[.!?]?\s*$/i,
  );
  if (nameFix) {
    out.push({
      claimText: `Person name is ${nameFix[1].trim()}`,
      claimType: 'identity',
      origin: 'user_corrected',
      confidence: 0.98,
      sourceQuote: text.trim(),
    });
  }

  return out;
}

function resolveInitialTruthState(
  origin: TruthClaimOrigin,
  claimType: TruthAttachmentType,
  confidence: number,
  sensitiveCategories: string[],
  opts: TruthStateEvaluationInput,
): TruthState {
  if (opts.userRejected) return 'rejected';
  if (opts.userConfirmed || origin === 'user_confirmed' || origin === 'manual_edit') {
    return 'user_confirmed';
  }
  if (origin === 'assistant_generated') return 'observed';
  if (origin === 'system_inferred') {
    if (claimType === 'relationship' || sensitiveCategories.length > 0 || isLowConfidence(confidence)) {
      return 'review_required';
    }
    return 'inferred';
  }
  if (origin === 'user_corrected') return 'user_confirmed';
  if (requiresConfirmation(sensitiveCategories as never[]) || isLowConfidence(confidence)) {
    return 'review_required';
  }
  if (origin === 'explicit_user') return 'candidate';
  return 'candidate';
}

function countMentions(key: string, priorClaims: TruthClaim[]): number {
  return priorClaims.filter((c) => c.rejectionKey === key || c.claimText.toLowerCase().includes(key.slice(0, 12))).length + 1;
}

function buildClaim(
  raw: RawCandidate,
  input: TruthStateEvaluationInput,
  priorClaims: TruthClaim[],
): TruthClaim {
  const origin =
    raw.origin === 'user_corrected' ||
    raw.origin === 'assistant_generated' ||
    raw.origin === 'system_inferred'
      ? raw.origin
      : classifyOrigin(input.authorRole ?? 'user', input, false);
  const sensitiveCategories = detectSensitiveCategories(raw.claimText, raw.sourceQuote, raw.claimType);
  const rejectionKey = claimRejectionKey(raw.claimText, raw.claimType);
  const mentionCount = countMentions(rejectionKey, priorClaims);
  const linkedToCanon = priorClaims.some(
    (c) => isDurableTruthState(c.truthState) && c.claimType === raw.claimType && c.rejectionKey.includes(rejectionKey.split(':')[1]?.slice(0, 8) ?? ''),
  );
  const timestamp = input.seenAt ?? new Date().toISOString();

  return {
    id: crypto.randomUUID(),
    claimText: raw.claimText,
    claimType: raw.claimType,
    origin,
    confidence: raw.confidence,
    truthState: resolveInitialTruthState(origin, raw.claimType, raw.confidence, sensitiveCategories, input),
    sourceQuote: raw.sourceQuote,
    sourceMessageId: input.sourceMessageId,
    sourceThreadId: input.sourceThreadId,
    mentionCount,
    linkedToCanon,
    sensitiveCategories,
    rejectionKey,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function shouldCreateTruthStateCard(_claim: TruthClaim): boolean {
  return false;
}

export function evaluateTruthState(input: TruthStateEvaluationInput): TruthStateEvaluationResult {
  const rejected: TruthStateEvaluationResult['rejected'] = [];
  const accepted: TruthClaim[] = [];
  const audit: TruthStateAuditEntry[] = [];
  let claimHistory: TruthClaim[] = [...(input.priorClaims ?? [])];

  if (input.manualEdit && input.text.trim()) {
    const manualClaim = buildClaim(
      {
        claimText: input.text.trim(),
        claimType: 'entity',
        origin: 'manual_edit',
        confidence: 0.99,
        sourceQuote: input.text.trim(),
      },
      { ...input, manualEdit: true, userConfirmed: true },
      claimHistory,
    );
    accepted.push(manualClaim);
    claimHistory.push(manualClaim);
    const chips = buildChipsForClaims(accepted);
    return { accepted, rejected, claimHistory, chips, audit };
  }

  const authorRole = input.authorRole ?? 'user';
  const candidates = extractCandidates(input.text, authorRole);

  for (const raw of candidates) {
    let claim = buildClaim(raw, input, claimHistory);

    if ((input.rejectedKeys ?? []).includes(claim.rejectionKey)) {
      rejected.push({ claimText: claim.claimText, reason: 'previously_rejected' });
      continue;
    }

    if (!claim.sourceQuote.trim()) {
      rejected.push({ claimText: claim.claimText, reason: 'missing_source_quote' });
      continue;
    }

    if (shouldCreateTruthStateCard(claim)) {
      rejected.push({ claimText: claim.claimText, reason: 'truth_state_not_book_card' });
      continue;
    }

    if (claim.origin === 'assistant_generated') {
      claim = { ...claim, truthState: 'observed', confidence: Math.min(claim.confidence, 0.55) };
    }

    if (requiresRelationshipConfirmation(claim.claimType, claim.sensitiveCategories)) {
      if (claim.truthState === 'candidate') {
        const transitioned = transitionClaim(claim, 'review_required', 'relationship_sensitive');
        claim = transitioned.claim;
        audit.push(transitioned.audit);
      } else if (claim.truthState === 'review_required' && claim.sensitiveCategories.length > 0) {
        audit.push({
          id: crypto.randomUUID(),
          claimId: claim.id,
          fromState: 'candidate',
          toState: 'review_required',
          reason: 'sensitive_confirmation_required',
          actor: 'system',
          timestamp: new Date().toISOString(),
        });
      }
    }

    if (blocksDurableWrite(claim.confidence, claim.sensitiveCategories) && !input.userConfirmed) {
      if (claim.truthState === 'candidate' || claim.truthState === 'inferred') {
        const transitioned = transitionClaim(claim, 'review_required', 'low_confidence_or_sensitive');
        claim = transitioned.claim;
        audit.push(transitioned.audit);
      }
    }

    const canonConflict = findCanonConflict(claim, claimHistory);
    if (canonConflict) {
      if (shouldApplyIncoming(claim, canonConflict)) {
        const archived = archiveClaim(canonConflict, 'superseded_by_correction');
        claimHistory = claimHistory.map((c) => (c.id === archived.claim.id ? archived.claim : c));
        audit.push(archived.audit);
        if (claim.origin === 'user_corrected' || claim.origin === 'manual_edit') {
          claim = { ...claim, truthState: 'user_confirmed' };
        }
      } else {
        const [oldMarked, newMarked] = preservesBothSides(canonConflict, claim);
        claimHistory = claimHistory.map((c) => (c.id === oldMarked.id ? oldMarked : c));
        claim = newMarked;
        audit.push({
          id: crypto.randomUUID(),
          claimId: claim.id,
          fromState: raw.origin === 'system_inferred' ? 'inferred' : 'candidate',
          toState: 'review_required',
          reason: 'canon_conflict',
          actor: 'system',
          timestamp: new Date().toISOString(),
        });
      }
    }

    if (input.userRejected) {
      const rejectedClaim = rejectClaim(claim);
      claim = rejectedClaim.claim;
      audit.push(rejectedClaim.audit);
    }

    if (
      canPromote(claim, {
        userConfirmed: input.userConfirmed,
        mentionCount: claim.mentionCount,
        linkedToCanon: claim.linkedToCanon,
      }) &&
      claim.truthState !== 'rejected' &&
      claim.origin !== 'assistant_generated'
    ) {
      const via =
        input.userConfirmed || claim.origin === 'user_corrected' || claim.origin === 'manual_edit'
          ? 'user'
          : claim.confidence >= HIGH_CONFIDENCE_THRESHOLD &&
              claim.mentionCount >= PROMOTION_MENTION_THRESHOLD
            ? 'system'
            : null;
      if (via) {
        const promoted = promoteToConfirmed(claim, via);
        claim = promoted.claim;
        audit.push(promoted.audit);
      }
    }

    if (claim.origin === 'assistant_generated' && isDurableTruthState(claim.truthState)) {
      rejected.push({ claimText: claim.claimText, reason: 'assistant_cannot_become_canon' });
      continue;
    }

    if (correctionOutranksInference(claim.origin, 'system_inferred')) {
      const correctedName = claim.claimText.replace(/^Person name is\s+/i, '').toLowerCase();
      const namePrefix = correctedName.split(/\s+/)[0]?.slice(0, 3) ?? '';
      const superseded = claimHistory.filter((c) => {
        if (c.origin !== 'system_inferred' || c.truthState === 'archived') return false;
        if (!canOverride(claim.origin, c.origin)) return false;
        if (c.claimType === claim.claimType) return true;
        const blob = c.claimText.toLowerCase();
        return namePrefix.length >= 3 && blob.includes(namePrefix);
      });
      for (const old of superseded) {
        const archived = archiveClaim(old, 'superseded_by_user_correction');
        claimHistory = claimHistory.map((c) => (c.id === archived.claim.id ? archived.claim : c));
        audit.push(archived.audit);
      }
    }

    accepted.push(claim);
    claimHistory.push(claim);
  }

  recordAudits(audit);
  const chips = buildChipsForClaims(accepted);

  return { accepted, rejected, claimHistory, chips, audit };
}

export class TruthStateGateService {
  evaluate(input: TruthStateEvaluationInput): TruthStateEvaluationResult {
    return evaluateTruthState(input);
  }
}

export const truthStateGateService = new TruthStateGateService();

export {
  blocksDurableWrite,
  requiresConfirmation,
  requiresRelationshipConfirmation,
  isLowConfidence,
  findCanonConflict,
  preservesBothSides,
  buildChipsForClaims,
};
