import { describe, it, expect, vi, beforeEach } from 'vitest';

import { shouldSimulateUploadFlow } from './useShouldUseMockData';

const mockGetIsUserLoggedIn = vi.fn(() => false);
const mockGetGlobalIsGuest = vi.fn(() => false);
const mockGetGlobalMockDataEnabled = vi.fn(() => false);

vi.mock('../contexts/MockDataContext', () => ({
  getIsUserLoggedIn: () => mockGetIsUserLoggedIn(),
  getGlobalIsGuest: () => mockGetGlobalIsGuest(),
  getGlobalMockDataEnabled: () => mockGetGlobalMockDataEnabled(),
}));

vi.mock('../config/env', () => ({
  config: { dev: { allowMockData: false } },
}));

describe('shouldSimulateUploadFlow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetIsUserLoggedIn.mockReturnValue(false);
    mockGetGlobalIsGuest.mockReturnValue(false);
    mockGetGlobalMockDataEnabled.mockReturnValue(false);
  });

  it('returns false for logged-in users', () => {
    mockGetIsUserLoggedIn.mockReturnValue(true);
    expect(shouldSimulateUploadFlow()).toBe(false);
  });

  it('returns true for guest sessions even without demo mock data', () => {
    mockGetGlobalIsGuest.mockReturnValue(true);
    mockGetGlobalMockDataEnabled.mockReturnValue(false);
    expect(shouldSimulateUploadFlow()).toBe(true);
  });

  it('returns true when demo mock data is enabled', () => {
    mockGetGlobalMockDataEnabled.mockReturnValue(true);
    expect(shouldSimulateUploadFlow()).toBe(true);
  });
});
