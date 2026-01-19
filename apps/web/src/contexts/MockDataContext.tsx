/**
 * Mock Data Context
 * Global state management for mock data toggle
 * Allows users to switch between mock and real data in dev and production
 */

import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { config } from '../config/env';

interface MockDataContextType {
  useMockData: boolean;
  toggleMockData: () => void;
  setUseMockData: (value: boolean) => void;
  isMockDataActive: boolean; // True if mock data is actually being used
  setIsMockDataActive: (value: boolean) => void;
}

const MockDataContext = createContext<MockDataContextType | undefined>(undefined);

const STORAGE_KEY = 'lorebook_use_mock_data';

// Global state for use outside React components (e.g., in fetchJson)
let globalMockDataEnabled = false;
const mockDataStateListeners: Set<(enabled: boolean) => void> = new Set();

export function setGlobalMockDataEnabled(enabled: boolean) {
  globalMockDataEnabled = enabled;
  // Notify all listeners
  mockDataStateListeners.forEach(listener => listener(enabled));
}

export function getGlobalMockDataEnabled(): boolean {
  return globalMockDataEnabled;
}

export function subscribeToMockDataState(listener: (enabled: boolean) => void) {
  mockDataStateListeners.add(listener);
  return () => {
    mockDataStateListeners.delete(listener);
  };
}

export function MockDataProvider({ children }: { children: ReactNode }) {
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
      setIsMockDataActive
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

