import { describe, it, expect, beforeEach } from 'vitest';

import { buildChipsForClaims, hasConfirmChip, hasRejectChip } from '../../../src/services/truthState/confirmationChipBuilder';
import { isLowConfidence, requiresConfirmation } from '../../../src/services/truthState/confirmationRequirementService';
import { clearAuditForTests, getAuditForClaim } from '../../../src/services/truthState/truthStateAuditService';
import {
  evaluateTruthState,
  truthStateGateService,
} from '../../../src/services/truthState/truthStateGateService';
import { claimRejectionKey, isDurableTruthState } from '../../../src/services/truthState/truthStateTypes';

function evaluate(
  text: string,
  extra: Parameters<typeof truthStateGateService.evaluate>[0] = {},
) {
  return evaluateTruthState({
    text,
    sourceMessageId: 'msg-1',
    sourceThreadId: 'thread-1',
    authorRole: 'user',
    ...extra,
  });
}

function findClaim(result: ReturnType<typeof evaluate>, part: string) {
  return result.accepted.find((c) => c.claimText.toLowerCase().includes(part.toLowerCase()));
}

describe('truth-state rules', () => {
  beforeEach(() => {
    clearAuditForTests();
  });

  it('explicit user statement enters candidate', () => {
    const result = evaluate('Bryan Oconner is my best friend.');
    const claim = findClaim(result, 'best friend');
    expect(claim).toBeDefined();
    expect(claim!.truthState).toBe('candidate');
    expect(claim!.origin).toBe('explicit_user');
  });

  it('family relationship requires confirmation', () => {
    const result = evaluate('Marcus is my older brother.');
    const claim = findClaim(result, 'brother');
    expect(claim).toBeDefined();
    expect(claim!.truthState).toBe('review_required');
    expect(requiresConfirmation(claim!.sensitiveCategories)).toBe(true);
    expect(claim!.sensitiveCategories).toContain('family');
  });

  it('romantic relationship requires confirmation', () => {
    const result = evaluate('Jamie is my girlfriend.');
    const claim = findClaim(result, 'Jamie');
    expect(claim).toBeDefined();
    expect(claim!.truthState).toBe('review_required');
    expect(claim!.sensitiveCategories).toContain('romantic');
  });

  it('assistant claim blocked from canon', () => {
    const result = evaluate('Bryan was important to you.', { authorRole: 'assistant' });
    const claim = findClaim(result, 'important');
    expect(claim).toBeDefined();
    expect(claim!.truthState).toBe('observed');
    expect(claim!.origin).toBe('assistant_generated');
    expect(isDurableTruthState(claim!.truthState)).toBe(false);
  });

  it('low confidence goes to review', () => {
    const result = evaluate('We went to Northwind Middle School with Taylor.');
    const claim = findClaim(result, 'schoolmate');
    expect(claim).toBeDefined();
    expect(isLowConfidence(claim!.confidence)).toBe(false);
    expect(claim!.truthState).toBe('review_required');
  });

  it('contradiction does not overwrite', () => {
    const first = evaluate('Jamie is my best friend.');
    const confirmed = evaluate('Jamie is my best friend.', {
      priorClaims: first.claimHistory,
      userConfirmed: true,
      sourceMessageId: 'msg-2',
    });
    const canon = confirmed.claimHistory.find((c) => c.truthState === 'user_confirmed');
    expect(canon).toBeDefined();

    const conflict = evaluate('Jamie is not my best friend anymore.', {
      priorClaims: confirmed.claimHistory,
      sourceMessageId: 'msg-3',
    });
    const contradicted = conflict.claimHistory.find((c) => c.truthState === 'contradicted');
    const review = conflict.accepted.find((c) => c.truthState === 'review_required');
    expect(contradicted).toBeDefined();
    expect(review).toBeDefined();
    expect(contradicted!.claimText).not.toBe(review!.claimText);
  });

  it('user correction outranks system inference', () => {
    const inferred = evaluate('We went to Northwind Middle School with Taylor.');
    const corrected = evaluate("Actually Taylor's name is Taylor Brooks.", {
      priorClaims: inferred.claimHistory,
      userCorrected: true,
      sourceMessageId: 'msg-2',
    });
    const identity = findClaim(corrected, 'Taylor Brooks');
    expect(identity).toBeDefined();
    expect(identity!.origin).toBe('user_corrected');
    expect(identity!.truthState).toBe('user_confirmed');
    const archivedInference = corrected.claimHistory.find(
      (c) => c.origin === 'system_inferred' && c.truthState === 'archived',
    );
    expect(archivedInference).toBeDefined();
  });

  it('rejected item does not resurface', () => {
    const first = evaluate('Oscar is my best friend.', { userRejected: true });
    const rejected = first.accepted.find((c) => c.truthState === 'rejected');
    expect(rejected).toBeDefined();
    const key = claimRejectionKey(rejected!.claimText, rejected!.claimType);

    const second = evaluate('Oscar is my best friend.', {
      rejectedKeys: [key],
      sourceMessageId: 'msg-2',
    });
    expect(second.rejected.some((r) => r.reason === 'previously_rejected')).toBe(true);
    expect(second.accepted.some((c) => c.claimText.includes('Oscar'))).toBe(false);
  });

  it('archive preserves provenance', () => {
    const inferred = evaluate('We went to Northwind Middle School with Sol.');
    const corrected = evaluate("Actually Sol's name is Solomon Reed.", {
      priorClaims: inferred.claimHistory,
      userCorrected: true,
      sourceMessageId: 'msg-2',
    });
    const archived = corrected.claimHistory.find((c) => c.truthState === 'archived');
    expect(archived).toBeDefined();
    expect(archived!.sourceQuote).toBeTruthy();
    expect(archived!.sourceMessageId).toBeTruthy();
  });

  it('confirmation chips generated correctly', () => {
    const result = evaluate('Jamie is my girlfriend.');
    const claim = findClaim(result, 'Jamie');
    expect(claim).toBeDefined();
    const chips = buildChipsForClaims([claim!]);
    expect(hasConfirmChip(chips)).toBe(true);
    expect(hasRejectChip(chips)).toBe(true);
    expect(chips.some((c) => c.action === 'mark_sensitive')).toBe(true);
    expect(chips.some((c) => c.action === 'need_more_context')).toBe(false);
    expect(result.chips.length).toBeGreaterThan(0);
  });

  it('audit trail records transitions', () => {
    const result = evaluate('Taylor is my girlfriend.');
    const claim = findClaim(result, 'Taylor');
    expect(claim).toBeDefined();
    const audit = getAuditForClaim(claim!.id);
    expect(audit.length).toBeGreaterThan(0);
    expect(audit[0].toState).toBe('review_required');
  });
});
