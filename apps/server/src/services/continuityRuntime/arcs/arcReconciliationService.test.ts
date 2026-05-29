import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../../supabaseClient', () => ({
  supabaseAdmin: { from: vi.fn() },
}));

vi.mock('./arcService', () => ({
  arcService: { listForUser: vi.fn(), upsert: vi.fn(), update: vi.fn() },
}));

import { supabaseAdmin } from '../../supabaseClient';
import { arcService } from './arcService';
import { ArcReconciliationService } from './arcReconciliationService';

const mockFrom = supabaseAdmin.from as ReturnType<typeof vi.fn>;
const mockListForUser = arcService.listForUser as ReturnType<typeof vi.fn>;
const mockUpsert = arcService.upsert as ReturnType<typeof vi.fn>;
const mockUpdate = arcService.update as ReturnType<typeof vi.fn>;

function buildChain(data: unknown, error: unknown = null) {
  const c: any = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data, error }),
    then: (resolve: any) => resolve({ data, error }),
  };
  return c;
}

describe('ArcReconciliationService', () => {
  let service: ArcReconciliationService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new ArcReconciliationService();
  });

  it('returns zeros when user has no legacy arcs', async () => {
    mockFrom.mockReturnValue(buildChain([]));
    mockListForUser.mockResolvedValue([]);

    const result = await service.runForUser('user-1');
    expect(result).toEqual({ matched: 0, adopted: 0, skipped: 0 });
  });

  it('returns zeros when supabase returns an error', async () => {
    mockFrom.mockReturnValue(buildChain(null, { message: 'DB error' }));

    const result = await service.runForUser('user-1');
    expect(result).toEqual({ matched: 0, adopted: 0, skipped: 0 });
  });

  it('marks a legacy arc as matched when it overlaps a life_arc above threshold', async () => {
    const legacyArc = {
      id: 'leg-1',
      user_id: 'user-1',
      label: 'College years',
      summary: null,
      start_date: '2020-01-01',
      end_date: '2024-01-01',
    };

    mockFrom.mockReturnValue(buildChain([legacyArc]));
    mockListForUser.mockResolvedValue([
      {
        id: 'life-1',
        start_date: '2020-01-01',
        end_date: '2024-06-01',
        label: 'University era',
        metadata: {},
      },
    ]);
    mockUpdate.mockResolvedValue({ id: 'life-1' });

    const result = await service.runForUser('user-1');
    expect(result.matched).toBe(1);
    expect(result.adopted).toBe(0);
  });

  it('adopts a long orphan legacy arc that has no matching life_arc', async () => {
    const legacyArc = {
      id: 'leg-orphan',
      user_id: 'user-1',
      label: 'Backpacking years',
      summary: 'Travelled SE Asia',
      start_date: '2018-01-01',
      end_date: '2020-01-01',
    };

    mockFrom.mockReturnValue(buildChain([legacyArc]));
    mockListForUser.mockResolvedValue([]);
    mockUpsert.mockResolvedValue({ id: 'new-arc', label: 'Backpacking years' });

    const result = await service.runForUser('user-1');
    expect(result.adopted).toBe(1);
    expect(mockUpsert).toHaveBeenCalledOnce();
  });

  it('skips a short orphan legacy arc below ADOPT_MIN_DAYS', async () => {
    const shortArc = {
      id: 'leg-short',
      user_id: 'user-1',
      label: 'Brief stint',
      summary: null,
      start_date: '2022-01-01',
      end_date: '2022-01-10', // only 9 days
    };

    mockFrom.mockReturnValue(buildChain([shortArc]));
    mockListForUser.mockResolvedValue([]);

    const result = await service.runForUser('user-1');
    expect(result.skipped).toBe(1);
    expect(result.adopted).toBe(0);
  });
});
