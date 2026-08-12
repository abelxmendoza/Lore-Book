import { describe, it, expect, vi, beforeEach } from 'vitest';

import { supabaseAdmin } from '../supabaseClient';
import { loadAllAtoms, filterAtoms } from '../loreReadiness/atomIndexService';
import { getRecompileHint } from './recompileHint';
import type { NarrativeAtom } from './types';

vi.mock('../supabaseClient', () => ({
  supabaseAdmin: {
    from: vi.fn(),
  },
}));

vi.mock('../loreReadiness/atomIndexService', () => ({
  loadAllAtoms: vi.fn(),
  filterAtoms: vi.fn(),
}));

function mockLatestRow(row: { lorebook_version: number; biography_data: unknown } | null) {
  const maybeSingle = vi.fn().mockResolvedValue({ data: row, error: row ? null : { message: 'not found' } });
  const limit = vi.fn().mockReturnValue({ maybeSingle });
  const order = vi.fn().mockReturnValue({ limit });
  const eq3 = vi.fn().mockReturnValue({ order });
  const eq2 = vi.fn().mockReturnValue({ eq: eq3 });
  const eq1 = vi.fn().mockReturnValue({ eq: eq2 });
  const select = vi.fn().mockReturnValue({ eq: eq1 });
  (supabaseAdmin.from as any).mockReturnValue({ select });
}

function atom(id: string): NarrativeAtom {
  return { id } as NarrativeAtom;
}

describe('getRecompileHint', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns null when no core lorebook exists for the given name', async () => {
    mockLatestRow(null);

    const hint = await getRecompileHint('user-1', 'Never Saved');
    expect(hint).toBeNull();
  });

  it('returns null when the current atom count matches the stored snapshot', async () => {
    mockLatestRow({
      lorebook_version: 2,
      biography_data: { metadata: { atomCount: 3, spec: { scope: 'full_life' } } },
    });
    (loadAllAtoms as any).mockResolvedValue([atom('a1'), atom('a2'), atom('a3')]);
    (filterAtoms as any).mockReturnValue([atom('a1'), atom('a2'), atom('a3')]);

    const hint = await getRecompileHint('user-1', 'My Life Story');
    expect(hint).toBeNull();
  });

  it('reports the new atom count and next version when content has grown', async () => {
    mockLatestRow({
      lorebook_version: 2,
      biography_data: { metadata: { atomCount: 3, spec: { scope: 'full_life' } } },
    });
    (loadAllAtoms as any).mockResolvedValue([atom('a1'), atom('a2'), atom('a3'), atom('a4'), atom('a5')]);
    (filterAtoms as any).mockReturnValue([atom('a1'), atom('a2'), atom('a3'), atom('a4'), atom('a5')]);

    const hint = await getRecompileHint('user-1', 'My Life Story');
    expect(hint).toEqual({ available: true, nextVersion: 3, newAtoms: 2 });
  });
});
