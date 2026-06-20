import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

import {
  formatDemoToastMessage,
  resetDemoEffectRippleScheduler,
  shouldShowDemoToast,
  emitDemoEffect,
} from './demoMutationEffects';
import { dispatchStoryDataUpdated } from '../lib/storyRefresh';

vi.mock('../contexts/MockDataContext', () => ({
  getGlobalMockDataEnabled: () => true,
}));

vi.mock('../lib/storyRefresh', () => ({
  dispatchStoryDataUpdated: vi.fn(),
}));

describe('demoMutationEffects', () => {
  beforeEach(() => {
    resetDemoEffectRippleScheduler();
    sessionStorage.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    resetDemoEffectRippleScheduler();
  });

  it('only toasts high-signal demo actions', () => {
    expect(shouldShowDemoToast('quest_completed')).toBe(true);
    expect(shouldShowDemoToast('quest_updated')).toBe(false);
    expect(shouldShowDemoToast('skill_added')).toBe(false);
    expect(shouldShowDemoToast('memory_rejected')).toBe(false);
    expect(shouldShowDemoToast('memory_deferred')).toBe(false);
  });

  it('formats a single combined toast line', () => {
    expect(
      formatDemoToastMessage({
        kind: 'quest_completed',
        title: 'Quest complete: Run 5K',
        xp: 120,
      }),
    ).toBe('Quest complete: Run 5K · +120 XP');
  });

  it('debounces ripple refreshes', () => {
    vi.useFakeTimers();

    emitDemoEffect({
      kind: 'quest_updated',
      title: 'Paused',
      rippleScopes: ['quests'],
    });
    emitDemoEffect({
      kind: 'character_saved',
      title: 'Alex saved',
      rippleScopes: ['characters'],
    });

    expect(dispatchStoryDataUpdated).not.toHaveBeenCalled();

    vi.advanceTimersByTime(700);

    expect(dispatchStoryDataUpdated).toHaveBeenCalledTimes(1);
    expect(dispatchStoryDataUpdated).toHaveBeenCalledWith(
      expect.objectContaining({
        scopes: expect.arrayContaining(['quests', 'characters']),
      }),
    );

    vi.useRealTimers();
  });
});
