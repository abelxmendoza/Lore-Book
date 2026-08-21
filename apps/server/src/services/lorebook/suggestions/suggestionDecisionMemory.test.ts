import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('../../../logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

const mockApplyAttachPlan = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.mock('./suggestionAttachApply', async () => {
  const actual = await vi.importActual<typeof import('./suggestionAttachApply')>('./suggestionAttachApply');
  return {
    ...actual,
    applyAttachPlan: mockApplyAttachPlan,
  };
});

import {
  addSuggestionDecision,
  consultUserDecision,
  detectCooccurringDistinctPeople,
  emptySuggestionDecisionIndex,
  findBookRejection,
  findEntityMergeOrAlias,
  isCharacterRejectedInIndex,
  rejectionSupersededByEvidence,
} from './suggestionDecisionIndex';
import { notSamePairKey } from './suggestionDecisionTypes';
import type { SuggestionDecision } from './suggestionDecisionTypes';
import { applySuggestionCandidate } from './applySuggestionCandidate';
import { withSuggestionWriteContext } from './suggestionWriteContext';
import type { AttachCanonRecord } from './suggestionAttachTypes';

function org(partial: Partial<AttachCanonRecord> & Pick<AttachCanonRecord, 'id' | 'name'>): AttachCanonRecord {
  return { aliases: [], domain: 'organizations', userId: 'user-a', ...partial };
}

function person(partial: Partial<AttachCanonRecord> & Pick<AttachCanonRecord, 'id' | 'name'>): AttachCanonRecord {
  return { aliases: [], domain: 'characters', userId: 'user-a', ...partial };
}

function rejected(name: string, extra: Partial<SuggestionDecision> = {}): SuggestionDecision {
  return {
    type: 'REJECTED_CANDIDATE',
    domain: 'organizations',
    normalizedKey: name.toLowerCase(),
    scope: 'book',
    source: 'USER',
    createdAt: '2026-08-21T00:00:00.000Z',
    evidenceStrength: 'strong',
    ...extra,
  };
}

describe('suggestion decision memory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('1+2. dismissed group candidate stays suppressed including case variants', () => {
    const index = emptySuggestionDecisionIndex();
    addSuggestionDecision(index, rejected('failure analysis'));
    expect(findBookRejection(index, 'organizations', 'Failure Analysis')?.type).toBe('REJECTED_CANDIDATE');
    expect(findBookRejection(index, 'organizations', 'FAILURE ANALYSIS')?.type).toBe('REJECTED_CANDIDATE');
    const consult = consultUserDecision({
      index,
      domain: 'organizations',
      name: 'Failure Analysis',
    });
    expect(consult.action).toBe('reject');
    expect(consult.consult?.suppressionReason).toBe('suppressed_from_rescan');
  });

  it('3+19. rejected org phrase does not suppress the same words as a Skill', () => {
    const index = emptySuggestionDecisionIndex();
    addSuggestionDecision(index, rejected('failure analysis'));
    expect(findBookRejection(index, 'skills', 'Failure Analysis')).toBeUndefined();
    expect(consultUserDecision({ index, domain: 'skills', name: 'Failure Analysis' }).action).toBe('none');
  });

  it('4+5. merge acronym attaches to canonical identity', () => {
    const index = emptySuggestionDecisionIndex();
    addSuggestionDecision(index, {
      type: 'MERGED_INTO',
      domain: 'organizations',
      normalizedKey: 'usc',
      canonicalId: 'org-usc',
      canonicalName: 'University of Southern California',
      scope: 'entity',
      source: 'USER',
      createdAt: '2026-08-21T00:00:00.000Z',
      evidenceStrength: 'strong',
    });
    const hit = findEntityMergeOrAlias(index, 'organizations', 'USC');
    expect(hit?.canonicalId).toBe('org-usc');
    expect(consultUserDecision({ index, domain: 'organizations', name: 'USC' }).action).toBe('attach');
  });

  it('6+7. merge/alias records are idempotent in the in-memory index', () => {
    const index = emptySuggestionDecisionIndex();
    const decision: SuggestionDecision = {
      type: 'ALIAS_CONFIRMED',
      domain: 'organizations',
      normalizedKey: 'usc',
      canonicalId: 'org-usc',
      canonicalName: 'University of Southern California',
      scope: 'entity',
      source: 'USER',
      createdAt: '2026-08-21T00:00:00.000Z',
      evidenceStrength: 'strong',
    };
    addSuggestionDecision(index, decision);
    addSuggestionDecision(index, decision);
    expect(index.byNormalizedKey.get('usc')).toHaveLength(1);
  });

  it('11. co-occurring same-given-name people are distinct', () => {
    const pairs = detectCooccurringDistinctPeople('Maya Chen was talking to Maya Lopez at Vanguard Robotics.', [
      person({ id: 'c-1', name: 'Maya Chen' }),
      person({ id: 'c-2', name: 'Maya Lopez' }),
    ]);
    expect(pairs).toEqual([['c-1', 'c-2']]);
  });

  it('12+13. weak her-friend rejection can be superseded by naming evidence', () => {
    const decision: SuggestionDecision = {
      type: 'REJECTED_CANDIDATE',
      domain: 'characters',
      normalizedKey: 'her friend',
      scope: 'book',
      source: 'USER',
      createdAt: '2026-08-21T00:00:00.000Z',
      evidenceStrength: 'weak',
    };
    expect(rejectionSupersededByEvidence(decision, 'her friend showed up', 'her friend')).toBe(false);
    expect(
      rejectionSupersededByEvidence(decision, "Her friend's name is Maya Chen.", 'her friend'),
    ).toBe(true);
    const index = emptySuggestionDecisionIndex();
    addSuggestionDecision(index, decision);
    const blocked = consultUserDecision({
      index,
      domain: 'characters',
      name: 'her friend',
      evidence: 'her friend showed up',
    });
    expect(blocked.action).toBe('reject');
    const named = consultUserDecision({
      index,
      domain: 'characters',
      name: 'her friend',
      evidence: "Her friend's name is Maya Chen.",
    });
    expect(named.consult?.superseded).toBe(true);
    expect(named.action).toBe('none');
  });

  it('8. user type correction is stored as TYPE_CORRECTED and wins later', () => {
    const index = emptySuggestionDecisionIndex();
    addSuggestionDecision(index, {
      type: 'TYPE_CORRECTED',
      domain: 'organizations',
      normalizedKey: 'usc',
      canonicalId: 'org-usc',
      canonicalType: 'university',
      scope: 'entity',
      source: 'USER',
      createdAt: '2026-08-21T00:00:00.000Z',
      evidenceStrength: 'strong',
    });
    expect(index.typeByCanonicalId.get('org-usc')).toBe('university');
  });

  it('10. not-same pair suppresses duplicate attach of the other card', async () => {
    const reviewed = vi.fn();
    const created = vi.fn();
    const decisions = emptySuggestionDecisionIndex();
    decisions.notSamePairs.add(notSamePairKey('c-chen', 'c-lopez'));
    const result = await withSuggestionWriteContext(
      'user-a',
      () =>
        applySuggestionCandidate({
          userId: 'user-a',
          domain: 'characters',
          name: 'Maya',
          evidence: 'Maya waved',
          extractor: 'character_rescan',
          onCreate: created,
          onReview: reviewed,
        }),
      {
        index: {
          characters: [
            person({ id: 'c-chen', name: 'Maya Chen', distinctFrom: ['c-lopez'] }),
            person({ id: 'c-lopez', name: 'Maya Lopez', distinctFrom: ['c-chen'] }),
          ],
        },
        status: 'ok',
        decisions,
      },
    );
    expect(result.outcome).toBe('REVIEW');
    expect(created).not.toHaveBeenCalled();
  });

  it('14+15. archive/delete decisions do not become REJECTED_CANDIDATE', () => {
    const index = emptySuggestionDecisionIndex();
    addSuggestionDecision(index, {
      type: 'ARCHIVED',
      domain: 'characters',
      normalizedKey: 'marcus vanguard',
      canonicalId: 'c-marcus',
      scope: 'entity',
      source: 'USER',
      createdAt: '2026-08-21T00:00:00.000Z',
      evidenceStrength: 'strong',
    });
    expect(consultUserDecision({ index, domain: 'characters', name: 'Marcus Vanguard' }).action).toBe('none');
    expect(findBookRejection(index, 'characters', 'Marcus Vanguard')).toBeUndefined();
  });

  it('21. shared gate consults reject memory before create', async () => {
    const created = vi.fn();
    const index = emptySuggestionDecisionIndex();
    addSuggestionDecision(index, rejected('failure analysis'));
    const result = await withSuggestionWriteContext(
      'user-a',
      () =>
        applySuggestionCandidate({
          userId: 'user-a',
          domain: 'organizations',
          name: 'Failure Analysis',
          evidence: 'I work in Failure Analysis at Vanguard Robotics',
          extractor: 'organization_suggestion',
          onCreate: created,
        }),
      {
        index: { organizations: [org({ id: 'org-v', name: 'Vanguard Robotics', canonicalType: 'employer' })] },
        status: 'ok',
        decisions: index,
      },
    );
    expect(result.outcome).toBe('REJECTED');
    expect(result.userDecision?.type).toBe('REJECTED_CANDIDATE');
    expect(created).not.toHaveBeenCalled();
  });

  it('5. previous merge makes USC attach without creating', async () => {
    const created = vi.fn();
    const decisions = emptySuggestionDecisionIndex();
    addSuggestionDecision(decisions, {
      type: 'MERGED_INTO',
      domain: 'organizations',
      normalizedKey: 'usc',
      canonicalId: 'org-usc',
      canonicalName: 'University of Southern California',
      scope: 'entity',
      source: 'USER',
      createdAt: '2026-08-21T00:00:00.000Z',
      evidenceStrength: 'strong',
    });
    const result = await withSuggestionWriteContext(
      'user-a',
      () =>
        applySuggestionCandidate({
          userId: 'user-a',
          domain: 'organizations',
          name: 'USC',
          evidence: 'I graduated from USC',
          incomingType: 'company',
          extractor: 'organization_suggestion',
          onCreate: created,
        }),
      {
        index: {
          organizations: [
            org({
              id: 'org-usc',
              name: 'University of Southern California',
              canonicalType: 'university',
            }),
          ],
        },
        status: 'ok',
        decisions,
      },
    );
    expect(result.outcome).toBe('ATTACHED');
    expect(result.canonical?.id).toBe('org-usc');
    expect(created).not.toHaveBeenCalled();
    expect(mockApplyAttachPlan).toHaveBeenCalled();
  });

  it('20. entity-level merge is visible from a location projection lookup', () => {
    const index = emptySuggestionDecisionIndex();
    addSuggestionDecision(index, {
      type: 'MERGED_INTO',
      domain: 'organizations',
      normalizedKey: 'usc',
      canonicalId: 'org-usc',
      canonicalName: 'University of Southern California',
      scope: 'entity',
      source: 'USER',
      createdAt: '2026-08-21T00:00:00.000Z',
      evidenceStrength: 'strong',
    });
    expect(consultUserDecision({ index, domain: 'locations', name: 'USC' }).action).toBe('attach');
  });

  it('1. twenty character candidates use zero per-name rejection queries', async () => {
    const { resetEntityRejectionLookupCount, entityRejectionLookupCount } = await import(
      '../../entityRejectionRegistry'
    );
    resetEntityRejectionLookupCount();
    const index = emptySuggestionDecisionIndex();
    addSuggestionDecision(index, {
      type: 'REJECTED_CANDIDATE',
      domain: 'characters',
      normalizedKey: 'jamie vanguard',
      scope: 'book',
      source: 'USER',
      createdAt: '2026-08-21T00:00:00.000Z',
      reason: 'permanent_entity_deletion',
      evidenceStrength: 'strong',
    });
    const names = Array.from({ length: 20 }, (_, i) => `Marcus Friend ${i + 1}`);
    names[0] = 'Jamie Vanguard';
    let suppressed = 0;
    for (const name of names) {
      if (isCharacterRejectedInIndex(index, name)) suppressed += 1;
    }
    expect(suppressed).toBe(1);
    expect(entityRejectionLookupCount()).toBe(0);
  });

  it('2. batched deletion memory still suppresses the deleted character', () => {
    const index = emptySuggestionDecisionIndex();
    addSuggestionDecision(index, {
      type: 'REJECTED_CANDIDATE',
      domain: 'characters',
      normalizedKey: 'jamie vanguard',
      scope: 'book',
      source: 'USER',
      createdAt: '2026-08-21T00:00:00.000Z',
      reason: 'permanent_entity_deletion',
      evidenceStrength: 'strong',
    });
    expect(isCharacterRejectedInIndex(index, 'Jamie Vanguard')).toBe(true);
    expect(isCharacterRejectedInIndex(index, 'Marcus Vanguard')).toBe(false);
  });
});
