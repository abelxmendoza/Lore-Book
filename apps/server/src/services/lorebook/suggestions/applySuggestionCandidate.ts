/**
 * Shared mutation boundary for LoreBook suggestion/card writers.
 *
 * Precedence: explicit user decisions → locked identity/type → aliases →
 * deterministic attach → quality inference → extractor guess.
 */

import { logger } from '../../../logger';
import type { LoreBookDomain } from '../parser/loreBookParserTypes';
import { evaluateSuggestionAcceptance } from './suggestionAcceptanceGate';
import {
  evaluateAttachEligibility,
  forceAttachFromUserMerge,
  isAttachPlan,
} from './suggestionAttachEligibility';
import { applyAttachPlan } from './suggestionAttachApply';
import {
  ensureSuggestionWriteContext,
  getSuggestionWriteContext,
  type SuggestionWriteContext,
} from './suggestionWriteContext';
import type { AttachCanonIndex, AttachCanonRecord, AttachDiagnostic, AttachPlan } from './suggestionAttachTypes';
import { operationMatchesApplyDomains } from './suggestionApplyDomains';
import {
  areNotSameEntities,
  consultUserDecision,
  correctedTypeFor,
  detectCooccurringDistinctPeople,
  emptySuggestionDecisionIndex,
} from './suggestionDecisionIndex';
import type { UserDecisionConsult } from './suggestionDecisionTypes';
import { notSamePairKey } from './suggestionDecisionTypes';

export type SuggestionMutationOutcome = 'ATTACHED' | 'REVIEW' | 'CREATED' | 'REJECTED' | 'DEGRADED';

export type SuggestionWriteResult = {
  outcome: SuggestionMutationOutcome;
  book: LoreBookDomain;
  candidate: string;
  extractor: string;
  source?: string;
  decision: AttachDiagnostic['decision'];
  matchBasis: AttachDiagnostic['matchBasis'];
  canonical?: AttachDiagnostic['canonical'];
  typeConflict: boolean;
  evidenceAttached: boolean;
  suggestionCreated: boolean;
  canonicalCreated: boolean;
  degraded: boolean;
  reason: string;
  attach?: AttachDiagnostic;
  userDecision?: UserDecisionConsult;
};

export type ApplySuggestionCandidateInput = {
  userId: string;
  domain: LoreBookDomain;
  name: string;
  evidence?: string;
  incomingType?: string;
  sourceMessageId?: string;
  spanStart?: number;
  spanEnd?: number;
  extractor: string;
  source?: string;
  context?: SuggestionWriteContext;
  applyDomains?: LoreBookDomain[];
  onCreate?: () => Promise<void>;
  onReview?: () => Promise<void>;
  /**
   * inference — default machine path (quality + decisions).
   * trusted_import — structured resume/calendar/docs: attach/reject/degraded still apply; quality may CREATE.
   * user — explicit user command; do not reject via inference or dismissal.
   */
  writePolicy?: 'inference' | 'trusted_import' | 'user';
};

function findCanonRecord(index: AttachCanonIndex, id?: string): AttachCanonRecord | undefined {
  if (!id) return undefined;
  for (const rows of Object.values(index)) {
    const hit = rows?.find((row) => row.id === id);
    if (hit) return hit;
  }
  return undefined;
}

function exactCanonByName(index: AttachCanonIndex, domain: LoreBookDomain, name: string): AttachCanonRecord | undefined {
  const key = name.trim().toLowerCase();
  const pool = [
    ...(index[domain] ?? []),
    ...(domain === 'organizations' || domain === 'groups' || domain === 'schools'
      ? [...(index.organizations ?? []), ...(index.groups ?? []), ...(index.schools ?? [])]
      : []),
  ];
  return pool.find((row) => row.name.trim().toLowerCase() === key || row.aliases.some((a) => a.trim().toLowerCase() === key));
}

/**
 * Decide attach / create / review / reject without persisting.
 * Eval and writers share this path; only {@link applySuggestionCandidate} mutates storage.
 */
export async function decideSuggestionCandidate(
  input: ApplySuggestionCandidateInput,
): Promise<SuggestionWriteResult> {
  const ctx =
    input.context ??
    getSuggestionWriteContext() ??
    (await ensureSuggestionWriteContext(input.userId));

  const applyDomains = input.applyDomains ?? (ctx.applyDomains as LoreBookDomain[] | undefined);
  const name = input.name.trim();
  const decisions = ctx.decisions ?? emptySuggestionDecisionIndex();
  const writePolicy = input.writePolicy ?? 'inference';
  for (const [left, right] of detectCooccurringDistinctPeople(input.evidence, ctx.index.characters ?? [])) {
    decisions.notSamePairs.add(notSamePairKey(left, right));
  }

  const eligibilityInput = {
    name,
    domain: input.domain,
    evidence: input.evidence,
    incomingType: input.incomingType,
    sourceMessageId: input.sourceMessageId,
    spanStart: input.spanStart,
    spanEnd: input.spanEnd,
    userId: input.userId,
    canon: ctx.index,
    canonStatus: ctx.status,
  };

  let attach = evaluateAttachEligibility(eligibilityInput);
  let userDecision: UserDecisionConsult | undefined;

  const consulted = consultUserDecision({
    index: decisions,
    domain: input.domain,
    name,
    evidence: input.evidence,
    attachTargetId: isAttachPlan(attach) ? attach.target.id : undefined,
  });
  userDecision = consulted.consult;

  if (consulted.action === 'reject' && writePolicy !== 'user') {
    return {
      outcome: 'REJECTED',
      book: input.domain,
      candidate: name,
      extractor: input.extractor,
      source: input.source,
      decision: 'REJECT',
      matchBasis: attach.matchBasis,
      typeConflict: false,
      evidenceAttached: false,
      suggestionCreated: false,
      canonicalCreated: false,
      degraded: false,
      reason: consulted.consult?.suppressionReason ?? 'rejected_candidate',
      attach,
      userDecision,
    };
  }

  if (consulted.action === 'attach' && consulted.decision?.canonicalId) {
    const target = findCanonRecord(ctx.index, consulted.decision.canonicalId);
    if (target) {
      const lockedType = correctedTypeFor(decisions, target.id);
      attach = forceAttachFromUserMerge(
        { ...eligibilityInput, incomingType: lockedType ?? target.canonicalType ?? input.incomingType },
        target,
      );
    }
  }

  const result = (
    outcome: SuggestionMutationOutcome,
    extra: Partial<SuggestionWriteResult> = {},
    diag: AttachDiagnostic = attach,
  ): SuggestionWriteResult => ({
    outcome,
    book: input.domain,
    candidate: name,
    extractor: input.extractor,
    source: input.source,
    decision: extra.decision ?? diag.decision,
    matchBasis: diag.matchBasis,
    canonical: diag.canonical,
    typeConflict: diag.typeConflict,
    evidenceAttached: extra.evidenceAttached ?? diag.evidenceAttached,
    suggestionCreated: extra.suggestionCreated ?? false,
    canonicalCreated: extra.canonicalCreated ?? false,
    degraded: extra.degraded ?? (diag.decision === 'DEGRADED' || ctx.status === 'degraded'),
    reason: extra.reason ?? diag.reason,
    attach: diag,
    userDecision: extra.userDecision ?? userDecision,
  });

  if (attach.decision === 'DEGRADED' || ctx.status === 'degraded') {
    if (writePolicy !== 'user') {
      logger.debug({ extractor: input.extractor, candidate: name }, 'suggestion write degraded — no spawn');
      return result('DEGRADED', { degraded: true, reason: 'canonical_index_degraded' });
    }
  }

  if (isAttachPlan(attach)) {
    const lockedType = correctedTypeFor(decisions, attach.target.id);
    if (lockedType && input.incomingType && lockedType !== input.incomingType) {
      userDecision = {
        type: 'TYPE_CORRECTED',
        timestamp: new Date().toISOString(),
        source: 'USER',
        reason: `canonical_type_${lockedType}`,
        superseded: false,
        suppressionReason: 'canonical_type_wins',
      };
    }

    const sameNameCard = exactCanonByName(ctx.index, input.domain, name);
    if (sameNameCard && areNotSameEntities(decisions, sameNameCard.id, attach.target.id)) {
      return result('REVIEW', {
        reason: 'not_same_entity',
        userDecision: {
          type: 'NOT_SAME_ENTITY',
          timestamp: new Date().toISOString(),
          source: 'USER',
          superseded: false,
          suppressionReason: 'duplicate_recommendation_suppressed',
        },
      });
    }

    const cooccur = detectCooccurringDistinctPeople(input.evidence, ctx.index.characters ?? []);
    if (
      cooccur.some(
        ([a, b]) =>
          (a === attach.target.id || b === attach.target.id) &&
          sameNameCard &&
          (a === sameNameCard.id || b === sameNameCard.id) &&
          a !== b,
      )
    ) {
      return result('REVIEW', { reason: 'cooccurrence_distinct' });
    }

    return result('ATTACHED', { evidenceAttached: attach.evidenceAttached });
  }

  if (attach.decision === 'REJECT') {
    return result('REJECTED');
  }

  if (!operationMatchesApplyDomains(input.domain, applyDomains)) {
    return result('REJECTED', { reason: 'book_isolation' });
  }

  if (attach.decision === 'REVIEW_DUPLICATE') {
    const reviewTarget = (attach as AttachPlan).canonical?.id;
    if (reviewTarget && exactCanonByName(ctx.index, input.domain, name)) {
      const other = exactCanonByName(ctx.index, input.domain, name);
      if (other && areNotSameEntities(decisions, other.id, reviewTarget)) {
        return result('REJECTED', {
          reason: 'not_same_entity',
          userDecision: {
            type: 'NOT_SAME_ENTITY',
            timestamp: new Date().toISOString(),
            source: 'USER',
            superseded: false,
            suppressionReason: 'duplicate_recommendation_suppressed',
          },
        });
      }
    }
    return result('REVIEW');
  }

  const acceptance = evaluateSuggestionAcceptance({
    name,
    domain: input.domain,
    evidence: input.evidence,
    qualityContext: { userId: input.userId },
  });
  if (!acceptance.accept && writePolicy === 'inference') {
    return result('REJECTED', { reason: acceptance.reason });
  }

  return result('CREATED');
}

export async function applySuggestionCandidate(
  input: ApplySuggestionCandidateInput,
): Promise<SuggestionWriteResult> {
  const decided = await decideSuggestionCandidate(input);

  if (decided.outcome === 'ATTACHED' && isAttachPlan(decided.attach)) {
    await applyAttachPlan(input.userId, decided.attach);
    logger.debug(
      {
        extractor: input.extractor,
        candidate: decided.candidate,
        decision: decided.decision,
        canonical: decided.canonical,
        userDecision: decided.userDecision,
      },
      'suggestion write attached',
    );
    return decided;
  }

  if (decided.outcome === 'CREATED') {
    await input.onCreate?.();
    return {
      ...decided,
      suggestionCreated: Boolean(input.onCreate),
      canonicalCreated: Boolean(input.onCreate),
    };
  }

  if (decided.outcome === 'REVIEW') {
    await input.onReview?.();
    return {
      ...decided,
      suggestionCreated: Boolean(input.onReview),
    };
  }

  return decided;
}
