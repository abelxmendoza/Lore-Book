import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('../../../logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

vi.mock('./suggestionAttachApply', async () => {
  const actual = await vi.importActual<typeof import('./suggestionAttachApply')>('./suggestionAttachApply');
  return {
    ...actual,
    applyAttachPlan: vi.fn().mockResolvedValue(undefined),
  };
});

import { decideSuggestionCandidate } from './applySuggestionCandidate';
import {
  addSuggestionDecision,
  emptySuggestionDecisionIndex,
} from './suggestionDecisionIndex';
import { notSamePairKey } from './suggestionDecisionTypes';
import {
  resetSuggestionWriteContextForTests,
  suggestionWriteLoadCount,
  withSuggestionWriteContext,
} from './suggestionWriteContext';
import type { AttachCanonRecord } from './suggestionAttachTypes';

function org(partial: Partial<AttachCanonRecord> & Pick<AttachCanonRecord, 'id' | 'name'>): AttachCanonRecord {
  return {
    aliases: [],
    domain: 'organizations',
    userId: 'user-a',
    mentionCount: 1,
    evidence: [],
    ...partial,
  };
}

const robotics = org({ id: 'org-1', name: 'Vanguard Robotics', canonicalType: 'employer' });

describe('unique org-stem decision memory and isolation', () => {
  beforeEach(() => {
    resetSuggestionWriteContextForTests();
  });

  it('D. MERGED_INTO Vanguard → Vanguard Robotics attaches without the new heuristic', async () => {
    const decisions = emptySuggestionDecisionIndex();
    addSuggestionDecision(decisions, {
      type: 'MERGED_INTO',
      domain: 'organizations',
      normalizedKey: 'vanguard',
      canonicalId: 'org-1',
      canonicalName: 'Vanguard Robotics',
      scope: 'entity',
      source: 'USER',
      createdAt: '2026-08-21T00:00:00.000Z',
      evidenceStrength: 'strong',
    });
    const result = await withSuggestionWriteContext(
      'user-a',
      () =>
        decideSuggestionCandidate({
          userId: 'user-a',
          domain: 'organizations',
          name: 'Vanguard',
          evidence: 'I worked at Vanguard.',
          incomingType: 'company',
          extractor: 'eval',
        }),
      {
        index: { organizations: [robotics] },
        status: 'ok',
        decisions,
      },
    );
    expect(result.outcome).toBe('ATTACHED');
    expect(result.canonical?.id).toBe('org-1');
    expect(result.userDecision?.suppressionReason).toBe('previous_merge_attach');
    expect(result.matchBasis).not.toBe('unique_org_stem_with_full_identity_evidence');
  });

  it('D. ALIAS_CONFIRMED outranks unique-stem matching', async () => {
    const decisions = emptySuggestionDecisionIndex();
    addSuggestionDecision(decisions, {
      type: 'ALIAS_CONFIRMED',
      domain: 'organizations',
      normalizedKey: 'vanguard',
      canonicalId: 'org-1',
      canonicalName: 'Vanguard Robotics',
      scope: 'entity',
      source: 'USER',
      createdAt: '2026-08-21T00:00:00.000Z',
      evidenceStrength: 'strong',
    });
    const result = await withSuggestionWriteContext(
      'user-a',
      () =>
        decideSuggestionCandidate({
          userId: 'user-a',
          domain: 'organizations',
          name: 'Vanguard',
          evidence: 'Vanguard',
          extractor: 'eval',
        }),
      {
        index: { organizations: [robotics] },
        status: 'ok',
        decisions,
      },
    );
    expect(result.outcome).toBe('ATTACHED');
    expect(result.canonical?.id).toBe('org-1');
    expect(result.userDecision?.suppressionReason).toBe('alias_confirmed_attach');
  });

  it('D. rejected Vanguard Group does not resurrect as an Organization', async () => {
    const decisions = emptySuggestionDecisionIndex();
    addSuggestionDecision(decisions, {
      type: 'REJECTED_CANDIDATE',
      domain: 'groups',
      normalizedKey: 'vanguard',
      scope: 'book',
      source: 'USER',
      createdAt: '2026-08-21T00:00:00.000Z',
      evidenceStrength: 'strong',
    });
    const result = await withSuggestionWriteContext(
      'user-a',
      () =>
        decideSuggestionCandidate({
          userId: 'user-a',
          domain: 'organizations',
          name: 'Vanguard',
          evidence: 'Software Engineer, Vanguard Robotics',
          incomingType: 'company',
          extractor: 'eval',
        }),
      {
        index: { organizations: [robotics] },
        status: 'ok',
        decisions,
      },
    );
    expect(result.outcome).toBe('REJECTED');
    expect(result.canonicalCreated).toBe(false);
    expect(result.userDecision?.suppressionReason).toBe('suppressed_from_rescan');
  });

  it('D. NOT_SAME keeps a same-name Vanguard card from attaching onto Robotics', async () => {
    const decisions = emptySuggestionDecisionIndex();
    addSuggestionDecision(decisions, {
      type: 'NOT_SAME_ENTITY',
      domain: 'organizations',
      normalizedKey: 'vanguard',
      canonicalId: 'org-v',
      relatedId: 'org-1',
      scope: 'entity',
      source: 'USER',
      createdAt: '2026-08-21T00:00:00.000Z',
      evidenceStrength: 'strong',
    });
    decisions.notSamePairs.add(notSamePairKey('org-v', 'org-1'));
    const result = await withSuggestionWriteContext(
      'user-a',
      () =>
        decideSuggestionCandidate({
          userId: 'user-a',
          domain: 'organizations',
          name: 'Vanguard',
          evidence: 'Software Engineer, Vanguard Robotics',
          incomingType: 'company',
          extractor: 'eval',
        }),
      {
        index: {
          organizations: [
            org({ id: 'org-v', name: 'Vanguard', canonicalType: 'employer' }),
            robotics,
          ],
        },
        status: 'ok',
        decisions,
      },
    );
    expect(result.outcome).toBe('ATTACHED');
    expect(result.canonical?.id).toBe('org-v');
    expect(result.matchBasis).toBe('exact_normalized');
  });

  it('short-form Vanguard without merge memory stays review, not a duplicate card', async () => {
    const result = await withSuggestionWriteContext(
      'user-a',
      () =>
        decideSuggestionCandidate({
          userId: 'user-a',
          domain: 'organizations',
          name: 'Vanguard',
          evidence: 'I worked at Vanguard.',
          incomingType: 'company',
          extractor: 'eval',
        }),
      {
        index: { organizations: [robotics] },
        status: 'ok',
      },
    );
    expect(result.outcome).toBe('REVIEW');
    expect(result.reason).toBe('containment_not_identity');
    expect(result.canonicalCreated).toBe(false);
    expect(suggestionWriteLoadCount()).toBe(1);
  });
});
