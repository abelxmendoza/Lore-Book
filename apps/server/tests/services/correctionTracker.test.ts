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
      original_value: 'projects:Moth Queen',
      corrected_value: 'characters:Moth Queen',
      context: 'redirect test',
    });

    expect(result.original_value).toBe('projects:Moth Queen');
    expect(result.corrected_value).toBe('characters:Moth Queen');
    expect(result.id).toMatch(/^local-correction:/);
  });
});
