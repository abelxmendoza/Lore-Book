import { describe, it, expect } from 'vitest';

import type { BackendHealthResult } from '../../lib/backendHealth';

import {
  runtimeReducer,
  setUseMockData,
  setIsMockDataActive,
  setBackendStatus,
  setRuntimeIdentity,
  setRuntimeDataMode,
  setIsGuest,
  markBackendReachable,
  type RuntimeState,
} from './runtimeSlice';

const initial: RuntimeState = {
  useMockData: false,
  isMockDataActive: false,
  backendUnavailable: false,
  backendHealth: null,
  isGuest: false,
  runtimeIdentity: 'GUEST_USER',
  runtimeDataMode: 'REAL',
};

describe('runtimeSlice', () => {
  it('sets the mock data toggle and active flag', () => {
    expect(runtimeReducer(initial, setUseMockData(true)).useMockData).toBe(true);
    expect(runtimeReducer(initial, setIsMockDataActive(true)).isMockDataActive).toBe(true);
  });

  it('records backend status with health diagnostics', () => {
    const health: BackendHealthResult = {
      ok: false,
      url: 'https://api.example.com/api/health',
      kind: 'http_error',
      status: 502,
      message: 'Bad Gateway',
      checkedAt: new Date().toISOString(),
    };
    const next = runtimeReducer(initial, setBackendStatus({ unavailable: true, health }));
    expect(next.backendUnavailable).toBe(true);
    expect(next.backendHealth).toEqual(health);
  });

  it('updates the runtime identity', () => {
    const next = runtimeReducer(initial, setRuntimeIdentity('REAL_USER'));
    expect(next.runtimeIdentity).toBe('REAL_USER');
  });

  it('updates the runtime data mode', () => {
    expect(runtimeReducer(initial, setRuntimeDataMode('DEMO')).runtimeDataMode).toBe('DEMO');
  });

  it('tracks guest session flag', () => {
    expect(runtimeReducer(initial, setIsGuest(true)).isGuest).toBe(true);
  });

  it('clears backend status with markBackendReachable', () => {
    const down = runtimeReducer(
      initial,
      setBackendStatus({ unavailable: true, health: { ok: false } as never }),
    );
    const up = runtimeReducer(down, markBackendReachable());
    expect(up.backendUnavailable).toBe(false);
    expect(up.backendHealth).toBeNull();
  });
});
