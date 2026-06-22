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

vi.mock('../../../src/services/omegaMemoryService', () => ({
  omegaMemoryService: { resolveEntities: vi.fn().mockResolvedValue([]) },
}));

vi.mock('../../../src/services/characterFoundationService', () => ({
  characterFoundationService: { promoteOmegaEntityToCharacter: vi.fn() },
}));

vi.mock('../../../src/services/entityRejectionRegistry', () => ({
  isUserRejectedEntityCard: vi.fn().mockResolvedValue(false),
}));

import { supabaseAdmin } from '../../../src/services/supabaseClient';
import { characterRescanStateService } from '../../../src/services/characters/audit/characterRescanStateService';

describe('characterRescanStateService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(supabaseAdmin.auth.admin.getUserById).mockResolvedValue({
      data: {
        user: {
          user_metadata: {
            character_rescan: {
              validatedPersonKeys: ['bryan', 'sam', 'foo'],
              watermarkAt: '2026-01-01T00:00:00Z',
            },
          },
        },
      },
    } as never);
    vi.mocked(supabaseAdmin.auth.admin.updateUserById).mockResolvedValue({ data: {}, error: null } as never);
  });

  it('removeValidatedKeys drops deleted entity keys from validated set', async () => {
    await characterRescanStateService.removeValidatedKeys('u1', ['foo', 'FOO']);
    expect(supabaseAdmin.auth.admin.updateUserById).toHaveBeenCalledWith(
      'u1',
      expect.objectContaining({
        user_metadata: expect.objectContaining({
          character_rescan: expect.objectContaining({
            validatedPersonKeys: ['bryan', 'sam'],
          }),
        }),
      }),
    );
  });
});
