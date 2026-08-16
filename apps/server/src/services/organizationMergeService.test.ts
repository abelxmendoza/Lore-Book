import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('./supabaseClient', () => ({
  supabaseAdmin: { from: vi.fn() },
}));

import { organizationMergeService } from './organizationMergeService';
import { supabaseAdmin } from './supabaseClient';

const mockFrom = supabaseAdmin.from as ReturnType<typeof vi.fn>;

function chain(data: unknown, error: unknown = null) {
  const obj: any = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    then: (resolve: any) => resolve({ data, error }),
  };
  return obj;
}

describe('organizationMergeService.findDuplicates', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('clusters a bare acronym with the full institution name it stands for', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'organizations') {
        return chain([
          { id: 'org-usc', name: 'USC', aliases: [], importance_score: 1, created_at: '2026-01-01' },
          {
            id: 'org-full',
            name: 'University of Southern California',
            aliases: [],
            importance_score: 2,
            created_at: '2026-01-02',
          },
        ]);
      }
      if (table === 'organization_members') return chain([]);
      return chain([]);
    });

    const clusters = await organizationMergeService.findDuplicates('user-1');

    expect(clusters).toHaveLength(1);
    // Higher importance_score wins as primary.
    expect(clusters[0].primary_id).toBe('org-full');
    expect(clusters[0].duplicate_ids).toEqual(['org-usc']);
    expect(clusters[0].reason).toBe('same_name');
  });

  it('does not cluster unrelated organizations with no name or member overlap', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'organizations') {
        return chain([
          { id: 'org-1', name: 'Rivian', aliases: [], importance_score: 1, created_at: '2026-01-01' },
          { id: 'org-2', name: 'Apera', aliases: [], importance_score: 1, created_at: '2026-01-01' },
        ]);
      }
      if (table === 'organization_members') return chain([]);
      return chain([]);
    });

    const clusters = await organizationMergeService.findDuplicates('user-1');
    expect(clusters).toEqual([]);
  });
});
