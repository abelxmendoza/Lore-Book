/**
 * Core suggestion write-authority matrix.
 * Synthetic fixtures only. No LLM, no embeddings, no live extractors.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

vi.mock('../../../logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

const mockApplyAttachPlan = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const mockLoadAttachCanon = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ index: {}, status: 'ok', successfulLoads: 1, failedLoads: 0 }),
);
const mockLoadDecisions = vi.hoisted(() =>
  vi.fn().mockResolvedValue({
    index: { byBookKey: new Map(), byNormalizedKey: new Map(), notSamePairs: new Set(), typeByCanonicalId: new Map(), loadCount: 1 },
    status: 'ok',
    successfulLoads: 4,
    failedLoads: 0,
  }),
);

vi.mock('./suggestionAttachApply', async () => {
  const actual = await vi.importActual<typeof import('./suggestionAttachApply')>('./suggestionAttachApply');
  return {
    ...actual,
    applyAttachPlan: mockApplyAttachPlan,
    loadAttachCanonResult: mockLoadAttachCanon,
  };
});

vi.mock('./suggestionDecisionStore', async () => {
  const actual = await vi.importActual<typeof import('./suggestionDecisionStore')>('./suggestionDecisionStore');
  return {
    ...actual,
    loadSuggestionDecisionResult: mockLoadDecisions,
  };
});

import { applySuggestionCandidate } from './applySuggestionCandidate';
import {
  addSuggestionDecision,
  emptySuggestionDecisionIndex,
} from './suggestionDecisionIndex';
import { notSamePairKey } from './suggestionDecisionTypes';
import {
  resetSuggestionWriteContextForTests,
  suggestionCanonIoLoadCount,
  suggestionDecisionIoLoadCount,
  suggestionWriteLoadCount,
  withSuggestionWriteContext,
} from './suggestionWriteContext';
import type { AttachCanonRecord } from './suggestionAttachTypes';

function org(partial: Partial<AttachCanonRecord> & Pick<AttachCanonRecord, 'id' | 'name'>): AttachCanonRecord {
  return { aliases: [], domain: 'organizations', userId: 'user-a', ...partial };
}

function person(partial: Partial<AttachCanonRecord> & Pick<AttachCanonRecord, 'id' | 'name'>): AttachCanonRecord {
  return { aliases: [], domain: 'characters', userId: 'user-a', ...partial };
}

describe('suggestion write-authority foundation matrix', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetSuggestionWriteContextForTests();
  });

  it('1. exact canonical attach', async () => {
    const created = vi.fn();
    const result = await withSuggestionWriteContext(
      'user-a',
      () =>
        applySuggestionCandidate({
          userId: 'user-a',
          domain: 'organizations',
          name: 'Vanguard Robotics',
          evidence: 'I work at Vanguard Robotics',
          extractor: 'organization_suggestion',
          onCreate: created,
        }),
      {
        index: { organizations: [org({ id: 'org-1', name: 'Vanguard Robotics', canonicalType: 'employer' })] },
        status: 'ok',
      },
    );
    expect(result.outcome).toBe('ATTACHED');
    expect(result.decision).toBe('ATTACH_EXACT');
    expect(result.canonical?.id).toBe('org-1');
    expect(created).not.toHaveBeenCalled();
    expect(mockApplyAttachPlan).toHaveBeenCalledOnce();
  });

  it('2. stored alias attach', async () => {
    const created = vi.fn();
    const result = await withSuggestionWriteContext(
      'user-a',
      () =>
        applySuggestionCandidate({
          userId: 'user-a',
          domain: 'organizations',
          name: 'USC',
          evidence: 'Priya graduated from USC',
          extractor: 'organization_suggestion',
          onCreate: created,
        }),
      {
        index: {
          organizations: [
            org({
              id: 'org-usc',
              name: 'University of Southern California',
              aliases: ['USC'],
              canonicalType: 'university',
            }),
          ],
        },
        status: 'ok',
      },
    );
    expect(result.outcome).toBe('ATTACHED');
    expect(result.matchBasis).toBe('existing_alias');
    expect(created).not.toHaveBeenCalled();
  });

  it('3. MERGED_INTO attach', async () => {
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
          organizations: [org({ id: 'org-usc', name: 'University of Southern California', canonicalType: 'university' })],
        },
        status: 'ok',
        decisions,
      },
    );
    expect(result.outcome).toBe('ATTACHED');
    expect(result.userDecision?.type).toBe('MERGED_INTO');
    expect(created).not.toHaveBeenCalled();
  });

  it('4. rejection suppresses machine create', async () => {
    const created = vi.fn();
    const decisions = emptySuggestionDecisionIndex();
    addSuggestionDecision(decisions, {
      type: 'REJECTED_CANDIDATE',
      domain: 'organizations',
      normalizedKey: 'failure analysis',
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
          name: 'Failure Analysis',
          evidence: 'I work in Failure Analysis at Vanguard Robotics',
          extractor: 'organization_suggestion',
          onCreate: created,
        }),
      { index: { organizations: [org({ id: 'org-v', name: 'Vanguard Robotics', canonicalType: 'employer' })] }, status: 'ok', decisions },
    );
    expect(result.outcome).toBe('REJECTED');
    expect(created).not.toHaveBeenCalled();
  });

  it('5. NOT_SAME blocks unsafe attach', async () => {
    const created = vi.fn();
    const reviewed = vi.fn();
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

  it('6. type conflict with weak identity is review, not create', async () => {
    const created = vi.fn();
    const reviewed = vi.fn();
    const result = await withSuggestionWriteContext(
      'user-a',
      () =>
        applySuggestionCandidate({
          userId: 'user-a',
          domain: 'organizations',
          name: 'Vanguard',
          incomingType: 'software',
          evidence: 'I opened Vanguard',
          extractor: 'organization_suggestion',
          onCreate: created,
          onReview: reviewed,
        }),
      {
        index: { organizations: [org({ id: 'org-1', name: 'Vanguard Robotics', canonicalType: 'employer' })] },
        status: 'ok',
      },
    );
    expect(result.outcome).toBe('REVIEW');
    expect(result.typeConflict).toBe(true);
    expect(created).not.toHaveBeenCalled();
    expect(reviewed).toHaveBeenCalledOnce();
  });

  it('7. valid new candidate creates', async () => {
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
      { index: { skills: [{ id: 'sk-py', name: 'Python', aliases: [], domain: 'skills', userId: 'user-a' }] }, status: 'ok' },
    );
    expect(result.outcome).toBe('CREATED');
    expect(created).toHaveBeenCalledOnce();
  });

  it('8a. degraded canon load never machine-creates', async () => {
    const created = vi.fn();
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
        }),
      { index: {}, status: 'degraded' },
    );
    expect(result.outcome).toBe('DEGRADED');
    expect(created).not.toHaveBeenCalled();
  });

  it('8b. degraded decision load never machine-creates', async () => {
    const created = vi.fn();
    const result = await withSuggestionWriteContext(
      'user-a',
      () =>
        applySuggestionCandidate({
          userId: 'user-a',
          domain: 'organizations',
          name: 'Northwind Hall',
          evidence: 'I volunteer at Northwind Hall',
          extractor: 'organization_suggestion',
          onCreate: created,
        }),
      { index: { organizations: [] }, status: 'ok', decisionStatus: 'degraded' },
    );
    expect(result.outcome).toBe('DEGRADED');
    expect(result.reason).toBe('decision_index_degraded');
    expect(created).not.toHaveBeenCalled();
  });

  it('9. explicit user policy can create despite rejection', async () => {
    const created = vi.fn();
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

  it('10. tenant isolation', async () => {
    const created = vi.fn();
    const result = await withSuggestionWriteContext(
      'user-b',
      () =>
        applySuggestionCandidate({
          userId: 'user-b',
          domain: 'organizations',
          name: 'Vanguard Robotics',
          evidence: 'I work at Vanguard Robotics',
          extractor: 'organization_suggestion',
          onCreate: created,
        }),
      {
        index: { organizations: [org({ id: 'org-a', name: 'Vanguard Robotics', userId: 'user-a', canonicalType: 'employer' })] },
        status: 'ok',
      },
    );
    expect(result.outcome).toBe('CREATED');
    expect(created).toHaveBeenCalledOnce();
  });

  it('11. repeated evidence is idempotent', async () => {
    const evidence = [{ quote: 'I work at Vanguard Robotics', sourceMessageId: 'msg-1' }];
    const first = await withSuggestionWriteContext(
      'user-a',
      () =>
        applySuggestionCandidate({
          userId: 'user-a',
          domain: 'organizations',
          name: 'Vanguard Robotics',
          evidence: 'I work at Vanguard Robotics',
          sourceMessageId: 'msg-1',
          extractor: 'organization_suggestion',
        }),
      {
        index: {
          organizations: [
            org({
              id: 'org-1',
              name: 'Vanguard Robotics',
              canonicalType: 'employer',
              evidence,
              mentionCount: 2,
            }),
          ],
        },
        status: 'ok',
      },
    );
    expect(first.outcome).toBe('ATTACHED');
    expect(first.attach && 'nextEvidence' in first.attach ? first.attach.nextEvidence : []).toHaveLength(1);
    expect(first.evidenceAttached).toBe(false);
  });

  it('12+13. one canon load and one decision load for N candidates', async () => {
    mockLoadAttachCanon.mockResolvedValue({
      index: { skills: [{ id: 'sk-py', name: 'Python', aliases: [], domain: 'skills', userId: 'user-a' }] },
      status: 'ok',
      successfulLoads: 1,
      failedLoads: 0,
    });
    mockLoadDecisions.mockResolvedValue({
      index: emptySuggestionDecisionIndex(),
      status: 'ok',
      successfulLoads: 4,
      failedLoads: 0,
    });

    await withSuggestionWriteContext('user-io', async () => {
      await applySuggestionCandidate({
        userId: 'user-io',
        domain: 'skills',
        name: 'Python',
        extractor: 'skill_suggestion',
      });
      await applySuggestionCandidate({
        userId: 'user-io',
        domain: 'skills',
        name: 'Django',
        evidence: 'I learned Django at Vanguard Robotics',
        extractor: 'skill_suggestion',
      });
      await applySuggestionCandidate({
        userId: 'user-io',
        domain: 'skills',
        name: 'React',
        evidence: 'I write React at Vanguard Robotics',
        extractor: 'skill_suggestion',
      });
    });

    expect(suggestionWriteLoadCount()).toBe(1);
    expect(suggestionCanonIoLoadCount()).toBe(1);
    expect(suggestionDecisionIoLoadCount()).toBe(1);
    expect(mockLoadAttachCanon).toHaveBeenCalledTimes(1);
    expect(mockLoadDecisions).toHaveBeenCalledTimes(1);
  });

  it('14. zero per-candidate DB queries on the decide path', async () => {
    const created = vi.fn();
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
          onCreate: created,
        });
      },
      { index: { skills: [{ id: 'sk-py', name: 'Python', aliases: [], domain: 'skills', userId: 'user-a' }] }, status: 'ok' },
    );
    expect(mockLoadAttachCanon).not.toHaveBeenCalled();
    expect(mockLoadDecisions).not.toHaveBeenCalled();
    expect(created).toHaveBeenCalledOnce();
  });

  it('15. suggestion package has no LLM or embedding imports', () => {
    const dir = join(process.cwd(), 'src/services/lorebook/suggestions');
    const files = readdirSync(dir).filter((name) => name.endsWith('.ts') && !name.endsWith('.test.ts'));
    const forbidden = /openai|embedding|createEmbedding|chat\.completions|responses\.create/i;
    for (const file of files) {
      const src = readFileSync(join(dir, file), 'utf8');
      expect(src, file).not.toMatch(forbidden);
    }
  });
});
