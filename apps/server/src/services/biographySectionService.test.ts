import { describe, it, expect, vi, beforeEach } from 'vitest';

import { supabaseAdmin } from './supabaseClient';
import { updateBiographySection, EditionImmutableError } from './biographySectionService';

vi.mock('./supabaseClient', () => ({
  supabaseAdmin: {
    from: vi.fn(),
  },
}));

vi.mock('./mainLifestoryService', () => ({
  mainLifestoryService: { getMainLifestory: vi.fn() },
}));

const baseChapter = { id: 'ch-1', title: 'Chapter One', text: 'Original text.' };

/** Mocks the getBiographyRow SELECT, then (if reached) the write-back UPDATE. */
function mockBiographyRow(row: Record<string, unknown> | null) {
  const selectSingle = vi.fn().mockResolvedValue({ data: row, error: row ? null : new Error('not found') });
  const selectEq2 = vi.fn().mockReturnValue({ single: selectSingle });
  const selectEq1 = vi.fn().mockReturnValue({ eq: selectEq2 });
  const select = vi.fn().mockReturnValue({ eq: selectEq1 });

  const updateEq2 = vi.fn().mockResolvedValue({ error: null });
  const updateEq1 = vi.fn().mockReturnValue({ eq: updateEq2 });
  const update = vi.fn().mockReturnValue({ eq: updateEq1 });

  (supabaseAdmin.from as any).mockReturnValue({ select, update });
  return { update, updateEq1 };
}

describe('biographySectionService — historical immutability (acceptance test #4)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('refuses to edit a section on a published Core Lorebook edition', async () => {
    mockBiographyRow({
      id: 'edition-v1',
      biography_data: { chapters: [baseChapter] },
      is_core_lorebook: true,
      lorebook_version: 1,
    });

    await expect(
      updateBiographySection('user-1', 'ch-1', { content: 'Sneaky rewrite.' }, 'edition-v1'),
    ).rejects.toThrow(EditionImmutableError);
  });

  it('still allows editing a non-core (ephemeral / draft) biography by explicit id', async () => {
    const { update } = mockBiographyRow({
      id: 'draft-1',
      biography_data: { chapters: [baseChapter] },
      is_core_lorebook: false,
      lorebook_version: null,
    });

    await updateBiographySection('user-1', 'ch-1', { content: 'Fine to edit.' }, 'draft-1');

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        biography_data: expect.objectContaining({
          chapters: [expect.objectContaining({ id: 'ch-1', text: 'Fine to edit.' })],
        }),
      }),
    );
  });
});
