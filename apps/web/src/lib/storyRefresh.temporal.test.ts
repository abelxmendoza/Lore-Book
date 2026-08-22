import { describe, expect, it, vi } from 'vitest';

import {
  dispatchStoryDataUpdated,
  dispatchTemporalViewsUpdated,
  subscribeTemporalRefresh,
} from './storyRefresh';

describe('temporal view refresh', () => {
  it('14. timeline mutation signal refetches Omni and Calendar subscribers', () => {
    const omni = vi.fn();
    const calendar = vi.fn();
    const family = vi.fn();
    const stopOmni = subscribeTemporalRefresh(omni);
    const stopCalendar = subscribeTemporalRefresh(calendar);
    const stopFamily = subscribeTemporalRefresh(family);

    dispatchStoryDataUpdated({ scopes: ['family'] });
    expect(omni).not.toHaveBeenCalled();
    expect(calendar).not.toHaveBeenCalled();

    dispatchTemporalViewsUpdated();
    expect(omni).toHaveBeenCalledTimes(1);
    expect(calendar).toHaveBeenCalledTimes(1);

    const modal = vi.fn();
    const stopModal = subscribeTemporalRefresh(modal);
    dispatchTemporalViewsUpdated();
    expect(omni).toHaveBeenCalledTimes(2);
    expect(calendar).toHaveBeenCalledTimes(2);
    expect(modal).toHaveBeenCalledTimes(1);

    dispatchStoryDataUpdated({ scopes: ['all'] });
    expect(omni).toHaveBeenCalledTimes(3);
    expect(calendar).toHaveBeenCalledTimes(3);
    expect(modal).toHaveBeenCalledTimes(2);

    stopOmni();
    stopCalendar();
    stopFamily();
    stopModal();
  });
});
