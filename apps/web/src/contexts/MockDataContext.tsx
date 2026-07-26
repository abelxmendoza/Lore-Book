/**
 * Mock Data Context
 * React adapter over the Redux `runtime` slice — single write path for demo/mock
 * mode, backend health, and derived runtime identity.
 */

import { createContext, useContext, useEffect, useRef, ReactNode, useCallback, useMemo } from 'react';
import { config } from '../config/env';
import { isDemoRuntimeActive } from '../lib/demoRuntime';
import { useAuth } from '../lib/supabase';
import {
  checkBackendHealth,
  describeBackendHealthFailure,
  type BackendHealthResult,
} from '../lib/backendHealth';
import { type RuntimeIdentityType, resolveRuntimeIdentity } from '../lib/runtimeIdentity';
import { useAppDispatch, useAppSelector, useAppStore } from '../store/hooks';
import { computeInitialMockDataToggle, MOCK_DATA_STORAGE_KEY } from '../store/mockDataInit';
import {
  setBackendStatus,
  setIsGuest,
  setIsMockDataActive,
  setRuntimeDataMode,
  setRuntimeIdentity,
  setUseMockData,
  type RuntimeDataMode,
} from '../store/slices/runtimeSlice';
import {
  selectBackendHealth,
  selectBackendUnavailable,
  selectEffectiveUseMockData,
  selectIsMockDataActive,
  selectRuntimeDataMode,
  selectRuntimeIdentity,
} from '../store/selectors';

export type { RuntimeIdentityType };
export type { RuntimeDataMode };

// Re-export non-React accessors for fetchJson, mockDataService, etc.
export {
  getGlobalMockDataEnabled,
  setGlobalMockDataEnabled,
  getIsUserLoggedIn,
  setGlobalIsUserLoggedIn,
  getGlobalIsGuest,
  setGlobalIsGuest,
  getBackendUnavailable,
  getGlobalBackendHealth,
  setGlobalBackendUnavailable,
  getRuntimeDataMode,
  notifyBackendReachable,
  subscribeToBackendReachable,
  subscribeToMockDataState,
} from '../store/runtimeAccess';

interface MockDataContextType {
  useMockData: boolean;
  toggleMockData: () => void;
  setUseMockData: (value: boolean) => void;
  isMockDataActive: boolean;
  setIsMockDataActive: (value: boolean) => void;
  backendUnavailable: boolean;
  backendHealth: BackendHealthResult | null;
  runtimeDataMode: RuntimeDataMode;
  runtimeIdentity: RuntimeIdentityType;
}

const MockDataContext = createContext<MockDataContextType | undefined>(undefined);

const HEALTH_CHECK_TIMEOUT_MS = 3000;
const HEALTH_RETRY_MS = 30_000;

export function MockDataProvider({ children }: { children: ReactNode }) {
  const dispatch = useAppDispatch();
  const store = useAppStore();
  const { user } = useAuth();

  const useMockData = useAppSelector(selectEffectiveUseMockData);
  const rawUseMockData = useAppSelector((s) => s.runtime.useMockData);
  const isMockDataActive = useAppSelector(selectIsMockDataActive);
  const backendUnavailable = useAppSelector(selectBackendUnavailable);
  const backendHealth = useAppSelector(selectBackendHealth);
  const runtimeIdentity = useAppSelector(selectRuntimeIdentity);
  const runtimeDataMode = useAppSelector(selectRuntimeDataMode);

  const didInit = useRef(false);
  if (!didInit.current) {
    didInit.current = true;
    dispatch(setUseMockData(computeInitialMockDataToggle()));
  }

  const healthCheckInFlight = useRef(false);
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setBackendUnavailable = useCallback(
    (value: boolean, health: BackendHealthResult | null = null) => {
      dispatch(setBackendStatus({ unavailable: value, health }));
      if (typeof window !== 'undefined') {
        (window as unknown as Record<string, unknown>).__lk_backend_health = health;
      }
      if (health && !health.ok) {
        console.warn('[BackendHealth]', describeBackendHealthFailure(health), {
          url: health.url,
          kind: health.kind,
          status: health.status,
          checkedAt: health.checkedAt,
        });
      }
    },
    [dispatch],
  );

  const checkHealth = useCallback(() => {
    if (!config.dev.allowMockData) return;
    if (healthCheckInFlight.current) return;
    healthCheckInFlight.current = true;
    const base = config.api.url || '';
    checkBackendHealth(base, { timeoutMs: HEALTH_CHECK_TIMEOUT_MS })
      .then((health) => {
        if (health.ok) {
          setBackendUnavailable(false, null);
          return;
        }

        setBackendUnavailable(true, health);
        const loggedIn = !!store.getState().auth.user;
        if (!loggedIn) {
          dispatch(setUseMockData(true));
        }
      })
      .finally(() => {
        healthCheckInFlight.current = false;
      });
  }, [dispatch, setBackendUnavailable, store]);

  useEffect(() => {
    checkHealth();
  }, [checkHealth]);

  useEffect(() => {
    if (!backendUnavailable) return;
    const schedule = () => {
      retryTimeoutRef.current = setTimeout(() => {
        retryTimeoutRef.current = null;
        checkHealth();
        schedule();
      }, HEALTH_RETRY_MS);
    };
    schedule();
    return () => {
      if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);
    };
  }, [backendUnavailable, checkHealth]);

  useEffect(() => {
    // Authenticated users leave mock/guest mode — unless they opened the public
    // /demo sandbox, which must stay fully isolated from their real account.
    if (user && !isDemoRuntimeActive()) {
      dispatch(setUseMockData(false));
      dispatch(setIsGuest(false));
    }
    if (user && isDemoRuntimeActive()) {
      dispatch(setUseMockData(true));
    }
  }, [user?.id, dispatch]);

  useEffect(() => {
    if (typeof window !== 'undefined' && (!user || isDemoRuntimeActive())) {
      localStorage.setItem(MOCK_DATA_STORAGE_KEY, String(rawUseMockData));
    }
  }, [rawUseMockData, user]);

  const toggleMockData = useCallback(() => {
    if (user && !isDemoRuntimeActive()) return;
    dispatch(setUseMockData(!rawUseMockData));
  }, [dispatch, rawUseMockData, user]);

  const setUseMockDataValue = useCallback(
    (value: boolean) => {
      if (user && !isDemoRuntimeActive()) return;
      dispatch(setUseMockData(value));
    },
    [dispatch, user],
  );

  const setIsMockDataActiveValue = useCallback(
    (value: boolean) => {
      dispatch(setIsMockDataActive(value));
    },
    [dispatch],
  );

  const derivedIdentity = useMemo<RuntimeIdentityType>(() => {
    const demo = isDemoRuntimeActive();
    return resolveRuntimeIdentity({
      // Demo sandbox must never resolve as REAL_USER even with a live session.
      isAuthenticated: !!user && !demo,
      isGuest: demo,
      isMockDataEnabled: demo || (!user && rawUseMockData),
      backendUnavailable,
    });
  }, [rawUseMockData, user, backendUnavailable]);

  const derivedDataMode = useMemo<RuntimeDataMode>(() => {
    if (derivedIdentity === 'DEMO_RUNTIME') return 'DEMO';
    if (derivedIdentity === 'DEGRADED_RUNTIME') return 'DEGRADED';
    return 'REAL';
  }, [derivedIdentity]);

  useEffect(() => {
    dispatch(setRuntimeIdentity(derivedIdentity));
  }, [derivedIdentity, dispatch]);

  useEffect(() => {
    dispatch(setRuntimeDataMode(derivedDataMode));
  }, [derivedDataMode, dispatch]);

  return (
    <MockDataContext.Provider
      value={{
        useMockData,
        toggleMockData,
        setUseMockData: setUseMockDataValue,
        isMockDataActive,
        setIsMockDataActive: setIsMockDataActiveValue,
        backendUnavailable,
        backendHealth,
        runtimeDataMode,
        runtimeIdentity,
      }}
    >
      {children}
    </MockDataContext.Provider>
  );
}

export function useMockData() {
  const context = useContext(MockDataContext);
  if (!context) {
    throw new Error('useMockData must be used within MockDataProvider');
  }
  return context;
}
