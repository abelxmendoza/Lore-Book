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

import { evaluateAttachEligibility } from './suggestionAttachEligibility';
import { decideSuggestionCandidate } from './applySuggestionCandidate';
import {
  addSuggestionDecision,
  emptySuggestionDecisionIndex,
} from './suggestionDecisionIndex';
import { notSamePairKey } from './suggestionDecisionTypes';
import {
  resetSuggestionWriteContextForTests,
  withSuggestionWriteContext,
} from './suggestionWriteContext';
import type { AttachCanonRecord } from './suggestionAttachTypes';
import { guardCharacterCandidate } from '../quality/characterCandidateGuard';

function person(partial: Partial<AttachCanonRecord> & Pick<AttachCanonRecord, 'id' | 'name'>): AttachCanonRecord {
  return { aliases: [], domain: 'characters', userId: 'user-a', mentionCount: 1, evidence: [], ...partial };
}

const coffee = 'Had coffee with Maya Chen and Jamie Park after class.';

describe('distinct full-name identity', () => {
  beforeEach(() => {
    resetSuggestionWriteContextForTests();
  });

  it('attaches the exact full name', () => {
    const result = evaluateAttachEligibility({
      name: 'Maya Chen',
      domain: 'characters',
      evidence: 'Maya Chen joined the study group',
      userId: 'user-a',
      canon: { characters: [person({ id: 'c-1', name: 'Maya Chen' })] },
    });
    expect(result.decision).toBe('ATTACH_EXACT');
  });

  it('reviews typo and near surnames instead of creating', () => {
    const canon = { characters: [person({ id: 'c-1', name: 'Maya Chen' })] };
    expect(
      evaluateAttachEligibility({
        name: 'Maya Cheen',
        domain: 'characters',
        userId: 'user-a',
        canon,
      }).decision,
    ).toBe('REVIEW_DUPLICATE');
    expect(
      evaluateAttachEligibility({
        name: 'Maya Chan',
        domain: 'characters',
        userId: 'user-a',
        canon,
      }).decision,
    ).toBe('REVIEW_DUPLICATE');
  });

  it('reviews first-name Maya when two Mayas exist', () => {
    const result = evaluateAttachEligibility({
      name: 'Maya',
      domain: 'characters',
      evidence: 'Maya stopped by after class',
      userId: 'user-a',
      canon: {
        characters: [
          person({ id: 'c-1', name: 'Maya Chen' }),
          person({ id: 'c-2', name: 'Maya Lopez' }),
        ],
      },
    });
    expect(result.decision).toBe('REVIEW_DUPLICATE');
    expect(result.matchBasis).toBe('first_name_only');
  });

  it('merge memory attaches a distinct-looking surface to the survivor', async () => {
    const decisions = emptySuggestionDecisionIndex();
    addSuggestionDecision(decisions, {
      type: 'MERGED_INTO',
      domain: 'characters',
      normalizedKey: 'maya lopez',
      canonicalId: 'c-chen',
      canonicalName: 'Maya Chen',
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
          domain: 'characters',
          name: 'Maya Lopez',
          evidence: 'Maya Lopez sat down',
          extractor: 'eval',
        }),
      {
        index: { characters: [person({ id: 'c-chen', name: 'Maya Chen', aliases: ['Maya Lopez'] })] },
        status: 'ok',
        decisions,
      },
    );
    expect(result.outcome).toBe('ATTACHED');
    expect(result.canonical?.id).toBe('c-chen');
    expect(result.userDecision?.suppressionReason).toMatch(/previous_merge_attach|alias_confirmed_attach/);
  });

  it('not-same suppresses a duplicate recommendation without creating', async () => {
    const decisions = emptySuggestionDecisionIndex();
    decisions.notSamePairs.add(notSamePairKey('c-chen', 'c-lopez'));
    const result = await withSuggestionWriteContext(
      'user-a',
      () =>
        decideSuggestionCandidate({
          userId: 'user-a',
          domain: 'characters',
          name: 'Maya',
          evidence: 'Maya waved',
          extractor: 'eval',
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
    expect(result.canonicalCreated).toBe(false);
  });

  it('Jamie Park still creates as a person and weak actors stay rejected', () => {
    expect(
      guardCharacterCandidate({
        name: 'Jamie Park',
        domain: 'characters',
        evidence: coffee,
      }),
    ).toBeNull();
    for (const name of ['her friend', 'the guy from work', 'my manager', 'the girl from the show']) {
      expect(
        guardCharacterCandidate({
          name,
          domain: 'characters',
          evidence: `${name} waved`,
        })?.gate,
      ).toBe('reject');
    }
  });
});
