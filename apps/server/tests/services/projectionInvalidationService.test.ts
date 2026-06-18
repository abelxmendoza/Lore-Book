import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockFrom = vi.fn();

vi.mock('../../src/services/supabaseClient', () => ({
  supabaseAdmin: { from: (...args: unknown[]) => mockFrom(...args) },
}));

import { invalidateProjectionsForSource } from '../../src/services/projectionInvalidationService';

function chain(result: { data?: unknown; error?: unknown }) {
  const builder = {
    select: vi.fn(),
    eq: vi.fn(),
    filter: vi.fn(),
    update: vi.fn(),
    then: (resolve: (value: typeof result) => void) => resolve(result),
  };
  builder.select.mockReturnValue(builder);
  builder.eq.mockReturnValue(builder);
  builder.filter.mockReturnValue(builder);
  builder.update.mockReturnValue(builder);
  return builder;
}

describe('projectionInvalidationService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('skips non-source artifact types', async () => {
    const result = await invalidateProjectionsForSource('user-1', 'c1', 'character');
    expect(result).toEqual({ biographySnapshots: 0, timelineEvents: 0 });
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('marks biography and timeline projections stale for journal_entry revisions', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'narrative_accounts') {
        return chain({
          data: [
            {
              id: 'bio-1',
              metadata: { source_entry_ids: ['entry-1', 'entry-2'] },
            },
          ],
        });
      }
      if (table === 'resolved_events') {
        return chain({
          data: [
            { id: 'evt-1', metadata: { source_entry_id: 'entry-1' } },
          ],
        });
      }
      return chain({ data: [], error: null });
    });

    const result = await invalidateProjectionsForSource('user-1', 'entry-1', 'journal_entry');

    expect(result).toEqual({ biographySnapshots: 1, timelineEvents: 1 });
    expect(mockFrom).toHaveBeenCalledWith('narrative_accounts');
    expect(mockFrom).toHaveBeenCalledWith('resolved_events');
  });
});
