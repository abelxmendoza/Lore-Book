import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/services/supabaseClient', () => ({
  supabaseAdmin: {
    from: vi.fn(),
  },
}));

vi.mock('../../../src/services/characterMergeService', () => ({
  characterMergeService: { merge: vi.fn() },
}));

vi.mock('../../../src/services/characterDeletionService', () => ({
  characterDeletionService: { deleteCharacter: vi.fn() },
}));

vi.mock('../../../src/services/characters/audit/characterCardAuditService', () => ({
  characterCardAuditService: { audit: vi.fn() },
}));

vi.mock('../../../src/services/characters/audit/characterRescanStateService', () => ({
  characterRescanStateService: { recordCardCleanup: vi.fn() },
}));

import { supabaseAdmin } from '../../../src/services/supabaseClient';
import { characterDeletionService } from '../../../src/services/characterDeletionService';
import { characterCardAuditService } from '../../../src/services/characters/audit/characterCardAuditService';
import {
  CARD_AUDIT_MAX_REVIEW_ROUNDS,
  characterCardRescanAuditService,
} from '../../../src/services/characters/audit/characterCardRescanAuditService';

function mockCharacterSelect(rows: Array<Record<string, unknown>>) {
  vi.mocked(supabaseAdmin.from).mockImplementation((table: string) => {
    if (table === 'characters') {
      const updateChain = {
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
      };
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockImplementation((_col: string, val: unknown) => {
            if (val === 'archived') {
              return {
                eq: vi.fn().mockResolvedValue({
                  data: rows.filter((r) => r.status === 'archived'),
                }),
              };
            }
            return Promise.resolve({ data: rows });
          }),
        }),
        update: vi.fn().mockReturnValue(updateChain),
      } as never;
    }
    return {} as never;
  });
}

describe('characterCardRescanAuditService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('auto-removes confident junk cards on rescan', async () => {
    vi.mocked(characterCardAuditService.audit).mockResolvedValue({
      userId: 'u1',
      generatedAt: new Date().toISOString(),
      characterCount: 1,
      summary: {} as never,
      results: [
        {
          characterId: 'c1',
          currentTitle: 'foo',
          status: 'junk_test_data',
          reason: 'Test junk',
          recommendedAction: 'delete',
        },
      ],
    });

    mockCharacterSelect([{ id: 'c1', name: 'foo', alias: [], metadata: {}, status: 'active' }]);

    const report = await characterCardRescanAuditService.applyRescanAudit('u1');
    expect(report.autoRemoved).toBe(1);
    expect(characterDeletionService.deleteCharacter).toHaveBeenCalledWith('u1', 'c1', {
      redistribute: true,
      reason: 'character_card_audit_rescan',
    });
  });

  it('queues uncertain cards for review instead of deleting immediately', async () => {
    vi.mocked(characterCardAuditService.audit).mockResolvedValue({
      userId: 'u1',
      generatedAt: new Date().toISOString(),
      characterCount: 1,
      summary: {} as never,
      results: [
        {
          characterId: 'c2',
          currentTitle: 'new guy',
          status: 'needs_context',
          reason: 'Generic label without enough context',
          recommendedAction: 'needs_review',
        },
      ],
    });

    mockCharacterSelect([{ id: 'c2', name: 'new guy', alias: [], metadata: {}, status: 'active' }]);

    const report = await characterCardRescanAuditService.applyRescanAudit('u1');
    expect(report.queuedForReview).toBe(1);
    expect(report.autoRemoved).toBe(0);
    expect(report.reviewSuggestions[0]?.reviewRound).toBe(1);
    expect(characterDeletionService.deleteCharacter).not.toHaveBeenCalled();
  });

  it('deletes after three unresolved rescan rounds', async () => {
    vi.mocked(characterCardAuditService.audit).mockResolvedValue({
      userId: 'u1',
      generatedAt: new Date().toISOString(),
      characterCount: 1,
      summary: {} as never,
      results: [
        {
          characterId: 'c3',
          currentTitle: 'Cousin',
          status: 'needs_context',
          reason: 'Still ambiguous',
          recommendedAction: 'needs_review',
        },
      ],
    });

    mockCharacterSelect([
      {
        id: 'c3',
        name: 'Cousin',
        alias: [],
        metadata: {
          card_audit_review_queue: {
            status: 'pending',
            round: CARD_AUDIT_MAX_REVIEW_ROUNDS - 1,
            maxRounds: CARD_AUDIT_MAX_REVIEW_ROUNDS,
          },
        },
        status: 'archived',
      },
    ]);

    const report = await characterCardRescanAuditService.applyRescanAudit('u1');
    expect(report.deletedAfterThreeStrikes).toBe(1);
    expect(characterDeletionService.deleteCharacter).toHaveBeenCalledWith('u1', 'c3', {
      redistribute: true,
      reason: 'character_card_audit_three_strike_cleanup',
    });
  });

  it('restores kept cards and clears review queue', async () => {
    vi.mocked(supabaseAdmin.from).mockImplementation((table: string) => {
      if (table === 'characters') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: {
                    metadata: {
                      card_audit_review_queue: { status: 'pending', round: 1 },
                      storyContext: 'My cousin from Dallas',
                    },
                  },
                }),
              }),
            }),
          }),
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ error: null }),
            }),
          }),
        } as never;
      }
      return {} as never;
    });

    const result = await characterCardRescanAuditService.resolveReviewSuggestion('u1', 'c4', 'keep');
    expect(result.success).toBe(true);
    expect(characterDeletionService.deleteCharacter).not.toHaveBeenCalled();
  });
});
