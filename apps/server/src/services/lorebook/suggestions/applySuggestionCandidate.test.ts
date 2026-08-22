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

import { applySuggestionCandidate } from './applySuggestionCandidate';
import {
  resetSuggestionWriteContextForTests,
  suggestionWriteLoadCount,
  withSuggestionWriteContext,
} from './suggestionWriteContext';
import type { AttachCanonRecord } from './suggestionAttachTypes';

function skill(partial: Partial<AttachCanonRecord> & Pick<AttachCanonRecord, 'id' | 'name'>): AttachCanonRecord {
  return {
    aliases: [],
    domain: 'skills',
    userId: 'user-a',
    mentionCount: 1,
    evidence: [],
    ...partial,
  };
}

describe('applySuggestionCandidate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetSuggestionWriteContextForTests();
  });

  it('attaches a skill synonym and does not create', async () => {
    const created = vi.fn();
    const result = await withSuggestionWriteContext(
      'user-a',
      () =>
        applySuggestionCandidate({
          userId: 'user-a',
          domain: 'skills',
          name: 'debugging',
          evidence: 'I have been practicing debugging at Vanguard Robotics',
          extractor: 'skill_suggestion',
          onCreate: created,
        }),
      {
        index: { skills: [skill({ id: 'sk-py', name: 'Software Debugging' })] },
        status: 'ok',
      },
    );

    expect(result.outcome).toBe('ATTACHED');
    expect(result.canonical?.id).toBe('sk-py');
    expect(result.suggestionCreated).toBe(false);
    expect(result.canonicalCreated).toBe(false);
    expect(created).not.toHaveBeenCalled();
    expect(mockApplyAttachPlan).toHaveBeenCalledOnce();
  });

  it('creates a distinct skill', async () => {
    const created = vi.fn();
    const result = await withSuggestionWriteContext(
      'user-a',
      () =>
        applySuggestionCandidate({
          userId: 'user-a',
          domain: 'skills',
          name: 'Django',
          evidence: 'I learned Django at Vanguard Robotics this year',
          extractor: 'skill_suggestion',
          onCreate: created,
        }),
      {
        index: { skills: [skill({ id: 'sk-py', name: 'Python' })] },
        status: 'ok',
      },
    );

    expect(result.outcome).toBe('CREATED');
    expect(created).toHaveBeenCalledOnce();
  });

  it('does not spawn when the canonical index is degraded', async () => {
    const created = vi.fn();
    const reviewed = vi.fn();
    const result = await withSuggestionWriteContext(
      'user-a',
      () =>
        applySuggestionCandidate({
          userId: 'user-a',
          domain: 'projects',
          name: 'MemoVault',
          evidence: 'I am building MemoVault',
          extractor: 'project_suggestion',
          onCreate: created,
          onReview: reviewed,
        }),
      { index: {}, status: 'degraded' },
    );

    expect(result.outcome).toBe('DEGRADED');
    expect(result.degraded).toBe(true);
    expect(created).not.toHaveBeenCalled();
    expect(reviewed).not.toHaveBeenCalled();
    expect(result.canonicalCreated).toBe(false);
  });

  it('first-name-only character is review, not create', async () => {
    const created = vi.fn();
    const result = await withSuggestionWriteContext(
      'user-a',
      () =>
        applySuggestionCandidate({
          userId: 'user-a',
          domain: 'characters',
          name: 'Maya',
          evidence: 'Maya said hello',
          extractor: 'character_rescan',
          onCreate: created,
        }),
      {
        index: {
          characters: [
            {
              id: 'c-1',
              name: 'Maya Chen',
              aliases: [],
              domain: 'characters',
              userId: 'user-a',
            },
          ],
        },
        status: 'ok',
      },
    );

    expect(result.outcome).toBe('REVIEW');
    expect(created).not.toHaveBeenCalled();
    expect(result.canonicalCreated).toBe(false);
  });

  it('wrong-book rescan does not create a Place from an institution', async () => {
    const created = vi.fn();
    const result = await withSuggestionWriteContext(
      'user-a',
      () =>
        applySuggestionCandidate({
          userId: 'user-a',
          domain: 'locations',
          name: 'USC',
          evidence: 'Priya graduated from USC.',
          extractor: 'location_suggestion',
          applyDomains: ['locations'],
          onCreate: created,
        }),
      {
        index: {
          organizations: [
            {
              id: 'org-usc',
              name: 'University of Southern California',
              aliases: ['USC'],
              domain: 'organizations',
              canonicalType: 'university',
              userId: 'user-a',
            },
          ],
        },
        status: 'ok',
      },
    );

    expect(result.outcome).toBe('ATTACHED');
    expect(result.canonical?.id).toBe('org-usc');
    expect(created).not.toHaveBeenCalled();
  });

  it('book isolation blocks CREATE_NEW for an unselected book', async () => {
    const created = vi.fn();
    const result = await withSuggestionWriteContext(
      'user-a',
      () =>
        applySuggestionCandidate({
          userId: 'user-a',
          domain: 'projects',
          name: 'Omega1',
          evidence: 'I shipped Omega1 last week at Vanguard Robotics',
          extractor: 'skill_suggestion',
          applyDomains: ['skills'],
          onCreate: created,
        }),
      { index: { skills: [skill({ id: 'sk-py', name: 'Python' })] }, status: 'ok' },
    );

    expect(result.outcome).toBe('REJECTED');
    expect(result.reason).toBe('book_isolation');
    expect(created).not.toHaveBeenCalled();
  });

  it('loads the canonical index once for N candidates', async () => {
    resetSuggestionWriteContextForTests();
    await withSuggestionWriteContext(
      'user-a',
      async () => {
        await applySuggestionCandidate({
          userId: 'user-a',
          domain: 'skills',
          name: 'Python',
          extractor: 'skill_suggestion',
        });
        await applySuggestionCandidate({
          userId: 'user-a',
          domain: 'skills',
          name: 'Django',
          evidence: 'I learned Django at Vanguard Robotics',
          extractor: 'skill_suggestion',
        });
      },
      { index: { skills: [skill({ id: 'sk-py', name: 'Python' })] }, status: 'ok' },
    );
    expect(suggestionWriteLoadCount()).toBe(1);
  });

  it('keeps tenant isolation', async () => {
    const created = vi.fn();
    const result = await withSuggestionWriteContext(
      'user-b',
      () =>
        applySuggestionCandidate({
          userId: 'user-b',
          domain: 'skills',
          name: 'Python',
          evidence: 'I write Python at Vanguard Robotics',
          extractor: 'skill_suggestion',
          onCreate: created,
        }),
      {
        index: { skills: [skill({ id: 'sk-a', name: 'Python', userId: 'user-a' })] },
        status: 'ok',
      },
    );

    expect(result.outcome).toBe('CREATED');
    expect(created).toHaveBeenCalledOnce();
  });

  it('10. trusted import does not create when the canonical index is degraded', async () => {
    const created = vi.fn();
    const result = await withSuggestionWriteContext(
      'user-a',
      () =>
        applySuggestionCandidate({
          userId: 'user-a',
          domain: 'organizations',
          name: 'Vanguard Robotics',
          evidence: 'Software Engineer, Vanguard Robotics',
          extractor: 'resume_import',
          writePolicy: 'trusted_import',
          onCreate: created,
        }),
      { index: {}, status: 'degraded' },
    );
    expect(result.outcome).toBe('DEGRADED');
    expect(created).not.toHaveBeenCalled();
  });

  it('trusted import attaches USC to an existing university', async () => {
    const created = vi.fn();
    const result = await withSuggestionWriteContext(
      'user-a',
      () =>
        applySuggestionCandidate({
          userId: 'user-a',
          domain: 'organizations',
          name: 'USC',
          incomingType: 'company',
          evidence: 'B.S. Computer Science, University of Southern California',
          extractor: 'resume_import',
          writePolicy: 'trusted_import',
          onCreate: created,
        }),
      {
        index: {
          organizations: [
            {
              id: 'org-usc',
              name: 'University of Southern California',
              aliases: ['USC'],
              domain: 'organizations',
              canonicalType: 'university',
              userId: 'user-a',
            },
          ],
        },
        status: 'ok',
      },
    );
    expect(result.outcome).toBe('ATTACHED');
    expect(result.canonical?.id).toBe('org-usc');
    expect(created).not.toHaveBeenCalled();
  });

  it('explicit user create still works despite a prior rejection', async () => {
    const created = vi.fn();
    const { addSuggestionDecision, emptySuggestionDecisionIndex } = await import('./suggestionDecisionIndex');
    const decisions = emptySuggestionDecisionIndex();
    addSuggestionDecision(decisions, {
      type: 'REJECTED_CANDIDATE',
      domain: 'organizations',
      normalizedKey: 'northwind crew',
      scope: 'book',
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
          name: 'Northwind Crew',
          evidence: 'Create a group called Northwind Crew',
          extractor: 'group_write_chat',
          writePolicy: 'user',
          onCreate: created,
        }),
      { index: { organizations: [] }, status: 'ok', decisions },
    );
    expect(result.outcome).toBe('CREATED');
    expect(created).toHaveBeenCalledOnce();
  });
});
