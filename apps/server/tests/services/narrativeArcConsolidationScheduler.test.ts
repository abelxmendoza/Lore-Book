import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import { scheduleNarrativeArcConsolidation } from '../../src/services/narrative/narrativeArcConsolidationScheduler';

const runForUser = vi.fn().mockResolvedValue({ arcs: 1, memberships: 2 });

vi.mock('../../src/services/narrative/narrativeArcConsolidationService', () => ({
  narrativeArcConsolidationService: {
    runForUser: (...args: unknown[]) => runForUser(...args),
  },
}));

describe('narrativeArcConsolidationScheduler', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    runForUser.mockClear();
    process.env.NARRATIVE_ARC_LIVE = '1';
    process.env.NARRATIVE_ARC_DEBOUNCE_MS = '1000';
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('debounces consolidation per user', async () => {
    scheduleNarrativeArcConsolidation('user-1');
    scheduleNarrativeArcConsolidation('user-1');
    expect(runForUser).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1000);
    expect(runForUser).toHaveBeenCalledTimes(1);
    expect(runForUser).toHaveBeenCalledWith('user-1');
  });

  it('no-ops when live consolidation disabled', async () => {
    process.env.NARRATIVE_ARC_LIVE = '0';
    scheduleNarrativeArcConsolidation('user-1');
    await vi.advanceTimersByTimeAsync(5000);
    expect(runForUser).not.toHaveBeenCalled();
  });
});
