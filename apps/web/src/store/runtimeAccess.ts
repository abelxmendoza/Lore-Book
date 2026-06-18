import type { BackendHealthResult } from '../lib/backendHealth';
import type { RuntimeIdentityType } from '../lib/runtimeIdentity';

import { getAppStore } from './appStoreRef';
import {
  selectBackendHealth,
  selectBackendUnavailable,
  selectEffectiveUseMockData,
  selectIsAuthenticated,
  selectIsGuest,
  selectRuntimeDataMode,
  selectRuntimeIdentity,
} from './selectors';
import { setCachedRuntimeIdentity } from './runtimeIdentityCache';
import { setBackendStatus, setIsGuest, setUseMockData } from './slices/runtimeSlice';

function appStore() {
  return getAppStore();
}

type MockDataListener = (enabled: boolean) => void;
type BackendReachableListener = () => void;

const mockDataListeners = new Set<MockDataListener>();
const backendReachableListeners = new Set<BackendReachableListener>();

let listenersBound = false;
let lastMockData = false;
let lastBackendUnavailable = false;
let lastRuntimeIdentity: RuntimeIdentityType = 'GUEST_USER';

function bindRuntimeStoreListeners(): void {
  if (listenersBound) return;
  listenersBound = true;

  lastMockData = selectEffectiveUseMockData(appStore().getState());
  lastBackendUnavailable = selectBackendUnavailable(appStore().getState());
  lastRuntimeIdentity = selectRuntimeIdentity(appStore().getState());
  setCachedRuntimeIdentity(lastRuntimeIdentity);

  appStore().subscribe(() => {
    const state = appStore().getState();
    const mockData = selectEffectiveUseMockData(state);
    if (mockData !== lastMockData) {
      lastMockData = mockData;
      mockDataListeners.forEach((listener) => listener(mockData));
    }

    const unavailable = selectBackendUnavailable(state);
    if (lastBackendUnavailable && !unavailable) {
      backendReachableListeners.forEach((listener) => listener());
    }
    lastBackendUnavailable = unavailable;

    const identity = selectRuntimeIdentity(state);
    if (identity !== lastRuntimeIdentity) {
      lastRuntimeIdentity = identity;
      setCachedRuntimeIdentity(identity);
    }
  });
}

/** Wire store listeners — called once from ReduxProvider after the singleton store exists. */
export function bindRuntimeAccess(): void {
  bindRuntimeStoreListeners();
}

/** Non-React accessors — read the singleton app store (auth-gated mock flag). */
export function getGlobalMockDataEnabled(): boolean {
  return selectEffectiveUseMockData(appStore().getState());
}

export function setGlobalMockDataEnabled(enabled: boolean): void {
  appStore().dispatch(setUseMockData(enabled));
}

/** @deprecated Auth slice is the source of truth; kept for backward-compatible imports. */
export function setGlobalIsUserLoggedIn(_value: boolean): void {
  // no-op
}

export function getIsUserLoggedIn(): boolean {
  return selectIsAuthenticated(appStore().getState());
}

export function getGlobalIsGuest(): boolean {
  return selectIsGuest(appStore().getState());
}

export function setGlobalIsGuest(value: boolean): void {
  appStore().dispatch(setIsGuest(value));
}

export function getBackendUnavailable(): boolean {
  return selectBackendUnavailable(appStore().getState());
}

export function getGlobalBackendHealth(): BackendHealthResult | null {
  return selectBackendHealth(appStore().getState());
}

export function setGlobalBackendUnavailable(
  value: boolean,
  health: BackendHealthResult | null = null,
): void {
  appStore().dispatch(setBackendStatus({ unavailable: value, health }));
}

export function getRuntimeDataMode() {
  return selectRuntimeDataMode(appStore().getState());
}

export function notifyBackendReachable(): void {
  appStore().dispatch(setBackendStatus({ unavailable: false, health: null }));
}

export function subscribeToBackendReachable(listener: BackendReachableListener): () => void {
  bindRuntimeStoreListeners();
  backendReachableListeners.add(listener);
  return () => {
    backendReachableListeners.delete(listener);
  };
}

export function subscribeToMockDataState(listener: MockDataListener): () => void {
  bindRuntimeStoreListeners();
  mockDataListeners.add(listener);
  return () => {
    mockDataListeners.delete(listener);
  };
}

/** Test-only reset so listener wiring can be re-tested. */
export function resetRuntimeAccessForTests(): void {
  listenersBound = false;
  mockDataListeners.clear();
  backendReachableListeners.clear();
}
