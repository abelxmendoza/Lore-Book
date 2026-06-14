import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./supabaseClient', () => ({
  supabaseAdmin: { from: vi.fn() },
}));

import { characterIdentityIndexService } from './characterIdentityIndexService';
import { supabaseAdmin } from './supabaseClient';

const mockFrom = supabaseAdmin.from as ReturnType<typeof vi.fn>;

function chain(data: unknown = [], error: unknown = null) {
  const obj: any = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    or: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    upsert: vi.fn().mockResolvedValue({ data, error }),
    then: (resolve: any) => resolve({ data, error }),
  };
  return obj;
}

describe('characterIdentityIndexService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rebuilds primary names and aliases into normalized index rows', async () => {
    const upsert = vi.fn().mockResolvedValue({ data: [], error: null });
    mockFrom.mockImplementation((table: string) => {
      if (table === 'characters') {
        return chain([
          {
            id: 'char-1',
            user_id: 'user-1',
            name: 'Mr. Chino',
            alias: ['Chino', 'Mr Chino', 'Chino'],
            metadata: { mention_count: 4 },
          },
        ]);
      }
      if (table === 'character_identity_index') {
        return { ...chain([]), upsert };
      }
      return chain([]);
    });

    const result = await characterIdentityIndexService.rebuild('user-1');

    expect(result).toEqual({ indexed: 3 });
    expect(upsert).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ mention: 'Mr. Chino', mention_key: 'mr. chino', source: 'primary_name' }),
        expect.objectContaining({ mention: 'Chino', mention_key: 'chino', source: 'alias' }),
        expect.objectContaining({ mention: 'Mr Chino', mention_key: 'mr chino', source: 'alias' }),
      ]),
      { onConflict: 'user_id,character_id,mention_key' }
    );
  });
});
