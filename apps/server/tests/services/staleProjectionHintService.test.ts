import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/services/artifactRegistry', () => ({
  artifactRegistry: {
    list: vi.fn(),
  },
}));

import { artifactRegistry } from '../../src/services/artifactRegistry';
import { collectStaleProjectionHints } from '../../src/services/staleProjectionHintService';

describe('staleProjectionHintService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns no hints when nothing is stale', async () => {
    vi.mocked(artifactRegistry.list).mockResolvedValue([
      {
        id: 'bio-1',
        type: 'biography_snapshot',
        createdAt: '2026-01-01',
        sourceTable: 'narrative_accounts',
        stale: false,
      },
    ]);

    const result = await collectStaleProjectionHints('user-1', {
      message: 'who am I?',
    });

    expect(result.hints).toEqual([]);
    expect(result.summary).toBeNull();
  });

  it('surfaces stale biography when message asks identity questions', async () => {
    vi.mocked(artifactRegistry.list).mockImplementation(async (_userId, opts) => {
      if (opts?.type === 'biography_snapshot') {
        return [{
          id: 'bio-1',
          type: 'biography_snapshot',
          title: 'Biography snapshot',
          createdAt: '2026-01-01',
          sourceTable: 'narrative_accounts',
          stale: true,
        }];
      }
      return [];
    });

    const result = await collectStaleProjectionHints('user-1', {
      message: 'what do you know about me?',
    });

    expect(result.hints).toHaveLength(1);
    expect(result.summary).toContain('life summary may be outdated');
  });

  it('hides stale biography when context does not use derived summaries', async () => {
    vi.mocked(artifactRegistry.list).mockImplementation(async (_userId, opts) => {
      if (opts?.type === 'biography_snapshot') {
        return [{
          id: 'bio-1',
          type: 'biography_snapshot',
          createdAt: '2026-01-01',
          sourceTable: 'narrative_accounts',
          stale: true,
        }];
      }
      return [];
    });

    const result = await collectStaleProjectionHints('user-1', {
      message: 'help me draft an email to my landlord',
    });

    expect(result.hints).toEqual([]);
  });
});
