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

import { isSemanticallyCompleteGoalTitle } from '../../goals/goalCanonicalizer';
import { evaluateAttachEligibility } from './suggestionAttachEligibility';
import { decideSuggestionCandidate } from './applySuggestionCandidate';
import {
  resetSuggestionWriteContextForTests,
  withSuggestionWriteContext,
} from './suggestionWriteContext';
import type { AttachCanonRecord } from './suggestionAttachTypes';

function project(partial: Partial<AttachCanonRecord> & Pick<AttachCanonRecord, 'id' | 'name'>): AttachCanonRecord {
  return { aliases: [], domain: 'projects', userId: 'user-a', mentionCount: 1, evidence: [], ...partial };
}

function quest(partial: Partial<AttachCanonRecord> & Pick<AttachCanonRecord, 'id' | 'name'>): AttachCanonRecord {
  return { aliases: [], domain: 'quests', userId: 'user-a', mentionCount: 1, evidence: [], ...partial };
}

describe('MemoVault launch quest recall', () => {
  beforeEach(() => {
    resetSuggestionWriteContextForTests();
  });

  it('treats named milestones as complete titles without accepting generic fragments', () => {
    expect(isSemanticallyCompleteGoalTitle('MemoVault launch')).toBe(true);
    expect(isSemanticallyCompleteGoalTitle('Launch MemoVault')).toBe(true);
    expect(isSemanticallyCompleteGoalTitle('MemoVault')).toBe(false);
    expect(isSemanticallyCompleteGoalTitle('The launch')).toBe(false);
    expect(isSemanticallyCompleteGoalTitle('Product launch')).toBe(false);
  });

  it('creates a quest from I need to finish the MemoVault launch', async () => {
    const result = await withSuggestionWriteContext(
      'user-a',
      () =>
        decideSuggestionCandidate({
          userId: 'user-a',
          domain: 'quests',
          name: 'MemoVault launch',
          evidence: 'I need to finish the MemoVault launch',
          extractor: 'eval',
        }),
      {
        index: { projects: [project({ id: 'p-1', name: 'MemoVault' })], quests: [] },
        status: 'ok',
      },
    );
    expect(result.outcome).toBe('CREATED');
    expect(result.reason).not.toBe('fragment_or_incomplete_title');
  });

  it('does not collapse the launch quest onto the MemoVault project', () => {
    const result = evaluateAttachEligibility({
      name: 'MemoVault launch',
      domain: 'quests',
      evidence: 'I need to finish the MemoVault launch',
      userId: 'user-a',
      canon: { projects: [project({ id: 'p-1', name: 'MemoVault' })], quests: [] },
    });
    expect(result.decision).toBe('CREATE_NEW');
    expect(result.canonical?.id).not.toBe('p-1');
  });

  it('attaches an existing MemoVault launch quest instead of spawning another', async () => {
    const result = await withSuggestionWriteContext(
      'user-a',
      () =>
        decideSuggestionCandidate({
          userId: 'user-a',
          domain: 'quests',
          name: 'MemoVault launch',
          evidence: 'I need to finish the MemoVault launch',
          extractor: 'eval',
        }),
      {
        index: {
          projects: [project({ id: 'p-1', name: 'MemoVault' })],
          quests: [quest({ id: 'q-1', name: 'MemoVault launch' })],
        },
        status: 'ok',
      },
    );
    expect(result.outcome).toBe('ATTACHED');
    expect(result.canonical?.id).toBe('q-1');
  });

  it('rejects a failed-launch report without user intent', async () => {
    const result = await withSuggestionWriteContext(
      'user-a',
      () =>
        decideSuggestionCandidate({
          userId: 'user-a',
          domain: 'quests',
          name: 'MemoVault launch',
          evidence: 'The MemoVault launch failed',
          extractor: 'eval',
        }),
      { index: { projects: [project({ id: 'p-1', name: 'MemoVault' })], quests: [] }, status: 'ok' },
    );
    expect(result.outcome).toBe('REJECTED');
  });

  it('does not force a quest from MemoVault alone', async () => {
    const result = await withSuggestionWriteContext(
      'user-a',
      () =>
        decideSuggestionCandidate({
          userId: 'user-a',
          domain: 'quests',
          name: 'MemoVault',
          evidence: 'MemoVault',
          extractor: 'eval',
        }),
      { index: { projects: [project({ id: 'p-1', name: 'MemoVault' })], quests: [] }, status: 'ok' },
    );
    expect(result.outcome).toBe('REJECTED');
  });
});
