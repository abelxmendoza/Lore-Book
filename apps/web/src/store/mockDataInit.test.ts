import { describe, it, expect, beforeEach, vi } from 'vitest';

import { computeInitialMockDataToggle, MOCK_DATA_STORAGE_KEY } from './mockDataInit';

describe('computeInitialMockDataToggle', () => {
  beforeEach(() => {
    vi.stubGlobal('window', {
      location: { pathname: '/', search: '' },
      sessionStorage: { getItem: vi.fn(() => null) },
    });
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
      keys: [],
    });
    Object.defineProperty(globalThis, 'localStorage', {
      value: {
        getItem: vi.fn(() => null),
        setItem: vi.fn(),
      },
      configurable: true,
    });
    Object.defineProperty(Object, 'keys', {
      value: () => [],
      configurable: true,
    });
  });

  it('honors ?mockData=true URL param', () => {
    window.location.search = '?mockData=true';
    expect(computeInitialMockDataToggle()).toBe(true);
  });

  it('honors ?mockData=false URL param', () => {
    window.location.search = '?mockData=false';
    expect(computeInitialMockDataToggle()).toBe(false);
  });

  it('defaults to false when no saved preference', () => {
    window.location.search = '';
    expect(computeInitialMockDataToggle()).toBe(false);
  });

  it('exports storage key constant', () => {
    expect(MOCK_DATA_STORAGE_KEY).toBe('lorebook_use_mock_data');
  });
});
