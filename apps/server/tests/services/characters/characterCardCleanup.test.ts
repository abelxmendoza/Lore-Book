import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/services/supabaseClient', () => ({
  supabaseAdmin: {
    auth: {
      admin: {
        getUserById: vi.fn(),
        updateUserById: vi.fn(),
      },
    },
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

import { supabaseAdmin } from '../../../src/services/supabaseClient';
import { characterDeletionService } from '../../../src/services/characterDeletionService';
import { characterCardAuditService } from '../../../src/services/characters/audit/characterCardAuditService';
import { characterCardCleanupService } from '../../../src/services/characters/audit/characterCardCleanupService';

describe('characterCardCleanupService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(supabaseAdmin.auth.admin.getUserById).mockResolvedValue({
      data: { user: { user_metadata: {} } },
    } as never);
    vi.mocked(supabaseAdmin.auth.admin.updateUserById).mockResolvedValue({ data: {}, error: null } as never);

    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
    };
    chain.update.mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }) });
    vi.mocked(supabaseAdmin.from).mockReturnValue(chain as never);
  });

  it('deletes junk cards with redistribution', async () => {
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

    vi.mocked(supabaseAdmin.from).mockImplementation((table: string) => {
      if (table === 'characters') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({
              data: [{ id: 'c1', name: 'foo', alias: [], metadata: {} }],
            }),
          }),
        } as never;
      }
      return {} as never;
    });

    const report = await characterCardCleanupService.applySafeFixes('u1');
    expect(report.applied).toBe(1);
    expect(characterDeletionService.deleteCharacter).toHaveBeenCalledWith('u1', 'c1', {
      redistribute: true,
      reason: 'character_card_audit_cleanup',
    });
  });

  it('skips cards the user already reviewed', async () => {
    vi.mocked(characterCardAuditService.audit).mockResolvedValue({
      userId: 'u1',
      generatedAt: new Date().toISOString(),
      characterCount: 1,
      summary: {} as never,
      results: [
        {
          characterId: 'c1',
          currentTitle: 'Mr',
          status: 'bare_title_invalid',
          reason: 'Bare title',
          recommendedAction: 'delete',
        },
      ],
    });

    vi.mocked(supabaseAdmin.from).mockImplementation((table: string) => {
      if (table === 'characters') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({
              data: [{ id: 'c1', name: 'Mr', alias: [], metadata: { card_audit_review: { action: 'keep' } } }],
            }),
          }),
        } as never;
      }
      return {} as never;
    });

    const report = await characterCardCleanupService.applySafeFixes('u1');
    expect(report.applied).toBe(0);
    expect(report.skipped).toBe(1);
    expect(characterDeletionService.deleteCharacter).not.toHaveBeenCalled();
  });
});
