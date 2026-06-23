import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  listProjects: vi.fn(),
}));

vi.mock('../../src/services/supabaseClient', () => ({
  supabaseAdmin: { from: mocks.from },
}));

vi.mock('../../src/services/projectService', () => ({
  projectService: { listProjects: mocks.listProjects },
}));

import { buildRedirectMergeNotification, evaluateRedirectTargetMatch } from '../../src/services/suggestionRedirectMatchService';

describe('suggestionRedirectMatchService', () => {
  beforeEach(() => {
    mocks.from.mockReset();
    mocks.listProjects.mockReset();
  });

  it('buildRedirectMergeNotification explains exact match', () => {
    const message = buildRedirectMergeNotification('Hell Fairy', 'characters', {
      disposition: 'auto_merged',
      matchedId: 'char-1',
      matchedName: 'Hell Fairy',
      confidence: 1,
      method: 'exact',
    });
    expect(message).toContain('Already in Characters');
  });

  it('evaluateRedirectTargetMatch returns suggested when no candidates', async () => {
    mocks.listProjects.mockResolvedValue([]);

    const result = await evaluateRedirectTargetMatch(
      '00000000-0000-4000-8000-000000000099',
      'Totally Unique Redirect Name XYZ',
      'projects'
    );
    expect(result.disposition).toBe('suggested');
    expect(result.identityTier).toBe('distinct');
  });

  it('does not redirect third-party character suggestions to the self card', async () => {
    mocks.from.mockImplementation((table: string) => {
      if (table !== 'characters') throw new Error(`Unexpected table ${table}`);
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({
            data: [
              {
                id: 'self-1',
                name: 'Me',
                alias: ['Tio Juan'],
                aliases: [],
                metadata: { is_self: true, is_user: true },
              },
            ],
          }),
        }),
      };
    });

    const result = await evaluateRedirectTargetMatch('user-1', 'Tio Juan', 'characters');

    expect(result.disposition).toBe('suggested');
    expect(result.matchedName).toBeUndefined();
    expect(result.identityTier).toBe('distinct');
  });
});
