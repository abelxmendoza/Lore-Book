import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/services/supabaseClient', () => ({
  supabaseAdmin: {
    from: vi.fn(),
  },
}));

import { supabaseAdmin } from '../../src/services/supabaseClient';
import { correctionTracker } from '../../src/services/activeLearning/correctionTracker';

describe('correctionTracker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('recordCorrection returns synthetic row when user_corrections table is missing', async () => {
    vi.mocked(supabaseAdmin.from).mockReturnValue({
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: null,
            error: {
              code: 'PGRST205',
              message: "Could not find the table 'public.user_corrections' in the schema cache",
            },
          }),
        }),
      }),
    } as never);

    const result = await correctionTracker.recordCorrection('00000000-0000-4000-8000-000000000001', {
      correction_type: 'entity',
      original_value: 'projects:Hell Fairy',
      corrected_value: 'characters:Hell Fairy',
      context: 'redirect test',
    });

    expect(result.original_value).toBe('projects:Hell Fairy');
    expect(result.corrected_value).toBe('characters:Hell Fairy');
    expect(result.id).toMatch(/^local-correction:/);
  });
});
