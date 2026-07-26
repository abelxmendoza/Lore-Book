import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import {
  shouldSimulateChat,
  shouldSimulateUploadFlow,
  shouldUseMockData,
} from './useShouldUseMockData';
import { config } from '../config/env';
import { clearDemoSession, enterDemoRuntime } from '../lib/demoRuntime';

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

describe('shouldUseMockData — demo sandbox', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearDemoSession();
    window.history.replaceState({}, '', '/');
    mockGetIsUserLoggedIn.mockReturnValue(false);
    mockGetGlobalIsGuest.mockReturnValue(false);
    mockGetGlobalMockDataEnabled.mockReturnValue(false);
  });

  afterEach(() => {
    clearDemoSession();
    window.history.replaceState({}, '', '/');
  });

  it('forces mock data on /demo even when the user is logged in', () => {
    mockGetIsUserLoggedIn.mockReturnValue(true);
    window.history.replaceState({}, '', '/demo');
    expect(shouldUseMockData()).toBe(true);
  });

  it('forces mock data when the demo session flag is set', () => {
    mockGetIsUserLoggedIn.mockReturnValue(true);
    enterDemoRuntime();
    window.history.replaceState({}, '', '/chat');
    expect(shouldUseMockData()).toBe(true);
  });
});

describe('shouldSimulateUploadFlow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearDemoSession();
    window.history.replaceState({}, '', '/');
    mockGetIsUserLoggedIn.mockReturnValue(false);
    mockGetGlobalIsGuest.mockReturnValue(false);
    mockGetGlobalMockDataEnabled.mockReturnValue(false);
    (config.env as { isProduction: boolean }).isProduction = false;
  });

  afterEach(() => {
    clearDemoSession();
    window.history.replaceState({}, '', '/');
  });

  it('returns false for logged-in users', () => {
    mockGetIsUserLoggedIn.mockReturnValue(true);
    expect(shouldSimulateUploadFlow()).toBe(false);
  });

  it('simulates uploads on /demo even when logged in', () => {
    mockGetIsUserLoggedIn.mockReturnValue(true);
    window.history.replaceState({}, '', '/demo');
    expect(shouldSimulateUploadFlow()).toBe(true);
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
    clearDemoSession();
    window.history.replaceState({}, '', '/');
    mockGetIsUserLoggedIn.mockReturnValue(false);
    mockGetGlobalIsGuest.mockReturnValue(false);
    mockGetGlobalMockDataEnabled.mockReturnValue(false);
    (config.env as { isProduction: boolean }).isProduction = false;
  });

  afterEach(() => {
    clearDemoSession();
    window.history.replaceState({}, '', '/');
  });

  it('returns false for logged-in users', () => {
    mockGetIsUserLoggedIn.mockReturnValue(true);
    mockGetGlobalMockDataEnabled.mockReturnValue(true);
    expect(shouldSimulateChat()).toBe(false);
  });

  it('simulates chat on /demo even when logged in', () => {
    mockGetIsUserLoggedIn.mockReturnValue(true);
    window.history.replaceState({}, '', '/demo');
    expect(shouldSimulateChat()).toBe(true);
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
