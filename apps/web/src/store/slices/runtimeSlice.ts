import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import type { BackendHealthResult } from '../../lib/backendHealth';
import type { RuntimeIdentityType } from '../../lib/runtimeIdentity';

export type RuntimeDataMode = 'REAL' | 'DEMO' | 'DEGRADED';

export interface RuntimeState {
  /** User-facing mock/demo toggle (already auth-gated by the provider). */
  useMockData: boolean;
  /** True once a surface has actually rendered mock data. */
  isMockDataActive: boolean;
  /** True when /api/health failed; mock auto-enabled for unauthenticated users. */
  backendUnavailable: boolean;
  backendHealth: BackendHealthResult | null;
  /** Guest session flag — synced from GuestContext. */
  isGuest: boolean;
  /** Canonical runtime identity — single source of truth for capability decisions. */
  runtimeIdentity: RuntimeIdentityType;
  /** Legacy 3-way mode, derived from identity for backward compat. */
  runtimeDataMode: RuntimeDataMode;
}

const initialState: RuntimeState = {
  useMockData: false,
  isMockDataActive: false,
  backendUnavailable: false,
  backendHealth: null,
  isGuest: false,
  runtimeIdentity: 'GUEST_USER',
  runtimeDataMode: 'REAL',
};

const runtimeSlice = createSlice({
  name: 'runtime',
  initialState,
  reducers: {
    setUseMockData(state, action: PayloadAction<boolean>) {
      state.useMockData = action.payload;
    },
    setIsMockDataActive(state, action: PayloadAction<boolean>) {
      state.isMockDataActive = action.payload;
    },
    setBackendStatus(
      state,
      action: PayloadAction<{ unavailable: boolean; health: BackendHealthResult | null }>
    ) {
      state.backendUnavailable = action.payload.unavailable;
      state.backendHealth = action.payload.health;
    },
    setRuntimeIdentity(state, action: PayloadAction<RuntimeIdentityType>) {
      state.runtimeIdentity = action.payload;
    },
    setRuntimeDataMode(state, action: PayloadAction<RuntimeDataMode>) {
      state.runtimeDataMode = action.payload;
    },
    setIsGuest(state, action: PayloadAction<boolean>) {
      state.isGuest = action.payload;
    },
    markBackendReachable(state) {
      state.backendUnavailable = false;
      state.backendHealth = null;
    },
  },
});

export const {
  setUseMockData,
  setIsMockDataActive,
  setBackendStatus,
  setRuntimeIdentity,
  setRuntimeDataMode,
  setIsGuest,
  markBackendReachable,
} = runtimeSlice.actions;

export const runtimeReducer = runtimeSlice.reducer;
