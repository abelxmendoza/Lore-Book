import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../../supabaseClient', () => ({
  supabaseAdmin: { from: vi.fn() },
}));

vi.mock('./arcService', () => ({
  arcService: { listForUser: vi.fn() },
}));

vi.mock('./arcMembershipService', () => ({
  arcMembershipService: { setMany: vi.fn() },
}));

import { supabaseAdmin } from '../../supabaseClient';
import { arcService } from './arcService';
import { arcMembershipService } from './arcMembershipService';
import { ArcMembershipSuggestionService } from './arcMembershipSuggestionService';

const mockFrom = supabaseAdmin.from as ReturnType<typeof vi.fn>;
const mockListForUser = arcService.listForUser as ReturnType<typeof vi.fn>;
const mockSetMany = arcMembershipService.setMany as ReturnType<typeof vi.fn>;

function chainFor(data: unknown, error: unknown = null) {
  const obj: any = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    then: (resolve: any) => resolve({ data, error }),
  };
  return obj;
}

describe('ArcMembershipSuggestionService', () => {
  let service: ArcMembershipSuggestionService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new ArcMembershipSuggestionService();
  });

  it('returns early when no event_candidates exist', async () => {
    mockFrom.mockReturnValue(chainFor([]));
    mockListForUser.mockResolvedValue([]);

    await service.runForUser('user-1');
    expect(mockSetMany).not.toHaveBeenCalled();
  });

  it('returns early when all candidates are already linked', async () => {
    const candidate = {
      id: 'cand-1',
      first_seen_at: '2022-01-01',
      last_seen_at: '2022-06-01',
      occurrence_count: 5,
      continuity_strength: 0.8,
    };

    mockFrom
      .mockReturnValueOnce(chainFor([candidate]))      // event_candidates
      .mockReturnValueOnce(chainFor([{ event_candidate_id: 'cand-1' }])); // arc_memberships

    await service.runForUser('user-1');
    expect(mockSetMany).not.toHaveBeenCalled();
  });

  it('creates a membership for an unlinked candidate that fits a life_arc', async () => {
    const candidate = {
      id: 'cand-2',
      first_seen_at: '2022-01-01',
      last_seen_at: '2022-09-01',
      occurrence_count: 6,
      continuity_strength: 0.9,
    };

    const arc = {
      id: 'arc-1',
      start_date: '2021-06-01',
      end_date: '2023-01-01',
      label: 'Test Arc',
    };

    mockFrom
      .mockReturnValueOnce(chainFor([candidate]))  // event_candidates
      .mockReturnValueOnce(chainFor([]));           // arc_memberships (none)

    mockListForUser.mockResolvedValue([arc]);
    mockSetMany.mockResolvedValue(undefined);

    await service.runForUser('user-1');
    expect(mockSetMany).toHaveBeenCalledOnce();
    expect(mockSetMany).toHaveBeenCalledWith(
      'user-1',
      expect.arrayContaining([
        expect.objectContaining({ event_candidate_id: 'cand-2', arc_id: 'arc-1' }),
      ])
    );
  });

  it('skips a candidate whose span falls outside all arcs', async () => {
    const candidate = {
      id: 'cand-3',
      first_seen_at: '2015-01-01',
      last_seen_at: '2015-06-01',
      occurrence_count: 3,
      continuity_strength: 0.5,
    };

    const arc = {
      id: 'arc-1',
      start_date: '2022-01-01',
      end_date: '2023-01-01',
      label: 'Recent Arc',
    };

    mockFrom
      .mockReturnValueOnce(chainFor([candidate]))
      .mockReturnValueOnce(chainFor([]));

    mockListForUser.mockResolvedValue([arc]);

    await service.runForUser('user-1');
    expect(mockSetMany).not.toHaveBeenCalled();
  });
});
