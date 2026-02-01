/**
 * Mock Data Context
 * Global state management for mock data toggle
 * Allows users to switch between mock and real data in dev and production.
 * When backend is unreachable, mock is auto-enabled so the app stays usable.
 */

import { createContext, useContext, useState, useEffect, useRef, ReactNode, useCallback } from 'react';
import { config } from '../config/env';
import { useAuth } from '../lib/supabase';

const HEALTH_CHECK_TIMEOUT_MS = 3000; // Match ConnectionStatus so we don't mark backend down when it's just slow
// Retry less often when backend is down to reduce console/network spam (was 5s)
const HEALTH_RETRY_MS = 30_000;

interface MockDataContextType {
  useMockData: boolean;
  toggleMockData: () => void;
  setUseMockData: (value: boolean) => void;
  isMockDataActive: boolean; // True if mock data is actually being used
  setIsMockDataActive: (value: boolean) => void;
  /** True when /api/health failed on load; mock is auto-enabled so the app works without the server */
  backendUnavailable: boolean;
}

const MockDataContext = createContext<MockDataContextType | undefined>(undefined);

const STORAGE_KEY = 'lorebook_use_mock_data';

// Global state for use outside React components (e.g., in fetchJson)
let globalMockDataEnabled = false;
const mockDataStateListeners = new Set<(enabled: boolean) => void>();

export function setGlobalMockDataEnabled(enabled: boolean) {
  globalMockDataEnabled = enabled;
  // Notify all listeners
  mockDataStateListeners.forEach(listener => listener(enabled));
}

export function getGlobalMockDataEnabled(): boolean {
  return globalMockDataEnabled;
}

// Global "user is logged in" — when true, shouldUseMockData() must return false everywhere
let globalIsUserLoggedIn = false;
export function getIsUserLoggedIn(): boolean {
  return globalIsUserLoggedIn;
}
export function setGlobalIsUserLoggedIn(value: boolean) {
  globalIsUserLoggedIn = value;
}

// Global backend-unavailable flag so fetchJson can short-circuit without hitting the proxy (used outside React).
let globalBackendUnavailable = false;
export function getBackendUnavailable(): boolean {
  return globalBackendUnavailable;
}
export function setGlobalBackendUnavailable(value: boolean) {
  globalBackendUnavailable = value;
}

// When any API request succeeds (e.g. Entities), we can clear "backend unavailable" so the banner goes away.
const backendReachableListeners = new Set<() => void>();
export function notifyBackendReachable() {
  globalBackendUnavailable = false;
  backendReachableListeners.forEach((fn) => fn());
}
export function subscribeToBackendReachable(listener: () => void) {
  backendReachableListeners.add(listener);
  return () => {
    backendReachableListeners.delete(listener);
  };
}

export function subscribeToMockDataState(listener: (enabled: boolean) => void) {
  mockDataStateListeners.add(listener);
  return () => {
    mockDataStateListeners.delete(listener);
  };
}

export function MockDataProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();

  const [useMockData, setUseMockDataState] = useState(() => {
    // Check URL parameter first (for easy enabling: ?mockData=true)
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      const urlMockData = urlParams.get('mockData');
      if (urlMockData === 'true') {
        setGlobalMockDataEnabled(true);
        return true;
      } else if (urlMockData === 'false') {
        setGlobalMockDataEnabled(false);
        return false;
      }
      
      // Check localStorage second
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved !== null) {
        const value = saved === 'true';
        setGlobalMockDataEnabled(value);
        return value;
      }
    }
    // Default: use env var or dev mode (default to true in dev for showcasing)
    const defaultValue = config.dev.allowMockData ?? config.env.isDevelopment;
    setGlobalMockDataEnabled(defaultValue);
    return defaultValue;
  });

  const [isMockDataActive, setIsMockDataActive] = useState(false);
  const [backendUnavailable, setBackendUnavailableState] = useState(false);
  const healthCheckInFlight = useRef(false);
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setBackendUnavailable = useCallback((value: boolean) => {
    setBackendUnavailableState(value);
    setGlobalBackendUnavailable(value);
  }, []);

  // checkHealth: single flight, 2s timeout; on success clear backendUnavailable; on failure set it and schedule retry in 5s
  const checkHealth = useCallback(() => {
    if (!config.dev.allowMockData) return;
    if (healthCheckInFlight.current) return;
    healthCheckInFlight.current = true;
    const base = config.api.url || '';
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), HEALTH_CHECK_TIMEOUT_MS);
    fetch(`${base}/api/health`, { method: 'GET', signal: controller.signal })
      .then((res) => {
        clearTimeout(timeoutId);
        if (res.ok) {
          setBackendUnavailable(false);
        } else {
          setBackendUnavailable(true);
          setUseMockDataState(true);
          setGlobalMockDataEnabled(true);
        }
      })
      .catch(() => {
        clearTimeout(timeoutId);
        setBackendUnavailable(true);
        setUseMockDataState(true);
        setGlobalMockDataEnabled(true);
      })
      .finally(() => {
        healthCheckInFlight.current = false;
      });
  }, [setBackendUnavailable]);

  // On mount: run initial health check
  useEffect(() => {
    checkHealth();
  }, [checkHealth]);

  // When backend is unavailable, re-check every 30s so we clear the banner when backend comes back
  useEffect(() => {
    if (!backendUnavailable) return;
    const schedule = () => {
      retryTimeoutRef.current = setTimeout(() => {
        retryTimeoutRef.current = null;
        checkHealth();
        schedule(); // next retry; cleanup clears when backendUnavailable becomes false
      }, HEALTH_RETRY_MS);
    };
    schedule();
    return () => {
      if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);
    };
  }, [backendUnavailable, checkHealth]);

  // When any API request succeeds (e.g. Entities), clear the banner
  useEffect(() => {
    const clearBanner = () => setBackendUnavailableState(false);
    return subscribeToBackendReachable(clearBanner);
  }, []);

  // When user logs in, turn off mock data and set global so all components see "no mock"
  useEffect(() => {
    const loggedIn = !!user;
    setGlobalIsUserLoggedIn(loggedIn);
    if (loggedIn) {
      setUseMockDataState(false);
      setGlobalMockDataEnabled(false);
    }
  }, [user?.id]);

  // Sync with global state
  useEffect(() => {
    setGlobalMockDataEnabled(useMockData);
  }, [useMockData]);

  // Save to localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, String(useMockData));
    }
  }, [useMockData]);

  const toggleMockData = useCallback(() => {
    setUseMockDataState(prev => {
      const newValue = !prev;
      setGlobalMockDataEnabled(newValue);
      return newValue;
    });
  }, []);

  const setUseMockData = useCallback((value: boolean) => {
    setUseMockDataState(value);
    setGlobalMockDataEnabled(value);
  }, []);

  return (
    <MockDataContext.Provider value={{
      useMockData,
      toggleMockData,
      setUseMockData,
      isMockDataActive,
      setIsMockDataActive,
      backendUnavailable,
    }}>
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

