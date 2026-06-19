import { describe, it, expect, vi, beforeEach } from 'vitest';

import { shouldSimulateChat, shouldSimulateUploadFlow } from './useShouldUseMockData';
import { config } from '../config/env';

const mockGetIsUserLoggedIn = vi.fn(() => false);
const mockGetGlobalIsGuest = vi.fn(() => false);
const mockGetGlobalMockDataEnabled = vi.fn(() => false);

vi.mock('../contexts/MockDataContext', () => ({
  getIsUserLoggedIn: () => mockGetIsUserLoggedIn(),
  getGlobalIsGuest: () => mockGetGlobalIsGuest(),
  getGlobalMockDataEnabled: () => mockGetGlobalMockDataEnabled(),
}));

vi.mock('../config/env', () => ({
  config: {
    dev: { allowMockData: false },
    env: { isProduction: false },
  },
}));

describe('shouldSimulateUploadFlow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetIsUserLoggedIn.mockReturnValue(false);
    mockGetGlobalIsGuest.mockReturnValue(false);
    mockGetGlobalMockDataEnabled.mockReturnValue(false);
    (config.env as { isProduction: boolean }).isProduction = false;
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

describe('shouldSimulateChat', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetIsUserLoggedIn.mockReturnValue(false);
    mockGetGlobalIsGuest.mockReturnValue(false);
    mockGetGlobalMockDataEnabled.mockReturnValue(false);
    (config.env as { isProduction: boolean }).isProduction = false;
  });

  it('returns false for logged-in users', () => {
    mockGetIsUserLoggedIn.mockReturnValue(true);
    mockGetGlobalMockDataEnabled.mockReturnValue(true);
    expect(shouldSimulateChat()).toBe(false);
  });

  it('allows development guest clean-slate chat to use the guest backend stream', () => {
    mockGetGlobalIsGuest.mockReturnValue(true);
    mockGetGlobalMockDataEnabled.mockReturnValue(false);
    expect(shouldSimulateChat()).toBe(false);
  });

  it('simulates development guest demo chat', () => {
    mockGetGlobalIsGuest.mockReturnValue(true);
    mockGetGlobalMockDataEnabled.mockReturnValue(true);
    expect(shouldSimulateChat()).toBe(true);
  });

  it('forces production guest chat to simulation even when demo mock data is off', () => {
    (config.env as { isProduction: boolean }).isProduction = true;
    mockGetGlobalIsGuest.mockReturnValue(true);
    mockGetGlobalMockDataEnabled.mockReturnValue(false);
    expect(shouldSimulateChat()).toBe(true);
  });
});
