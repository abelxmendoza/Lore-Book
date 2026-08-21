import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import type { StitchedTimelineResult } from '../api/stitchedTimeline';

const get = vi.fn();

vi.mock('../api/stitchedTimeline', () => ({
  stitchedTimelineApi: {
    get: (...args: unknown[]) => get(...args),
  },
}));

import { useLifeArc } from './useLifeArc';

function emptyStitched(): StitchedTimelineResult {
  return {
    scope_type: 'global',
    scope_id: '00000000-0000-0000-0000-000000000000',
    scope_label: null,
    items: [],
    has_user_order: false,
  };
}

describe('useLifeArc', () => {
  beforeEach(() => {
    get.mockReset();
    get.mockResolvedValue(emptyStitched());
  });

  it('reads chronology/stitched windows instead of /api/life-arc/recent', async () => {
    const { result } = renderHook(() => useLifeArc('LAST_7_DAYS'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(get).toHaveBeenCalledTimes(2);
    expect(get.mock.calls[0][0]).toMatchObject({ scope_type: 'global' });
    expect(get.mock.calls[0][0]).toHaveProperty('start_time');
    expect(get.mock.calls[0][0]).toHaveProperty('end_time');
    expect(result.current.data?.is_silence).toBe(true);
    expect(result.current.data?.stability_state).toBe('STABLE_EMPTY');
  });
});
