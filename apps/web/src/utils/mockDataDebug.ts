/**
 * Mock Data Debug Utility
 * Helps verify that the mock data toggle is working correctly
 */

import { getGlobalMockDataEnabled, subscribeToMockDataState } from '../contexts/MockDataContext';

export interface MockDataDebugInfo {
  toggleEnabled: boolean;
  timestamp: string;
  componentsUsingMock: string[];
  lastToggleTime: string | null;
}

let lastToggleTime: string | null = null;
const componentsUsingMock: Set<string> = new Set();

// Track when toggle changes
subscribeToMockDataState((enabled) => {
  lastToggleTime = new Date().toISOString();
  console.log('[MockDataDebug] Toggle changed:', { enabled, timestamp: lastToggleTime });
});

/**
 * Register a component as using mock data
 */
export function registerMockDataUsage(componentName: string) {
  componentsUsingMock.add(componentName);
  console.log('[MockDataDebug] Component using mock data:', componentName);
}

/**
 * Unregister a component
 */
export function unregisterMockDataUsage(componentName: string) {
  componentsUsingMock.delete(componentName);
}

/**
 * Get current debug info
 */
export function getMockDataDebugInfo(): MockDataDebugInfo {
  return {
    toggleEnabled: getGlobalMockDataEnabled(),
    timestamp: new Date().toISOString(),
    componentsUsingMock: Array.from(componentsUsingMock),
    lastToggleTime
  };
}

/**
 * Log debug info to console
 */
export function logMockDataDebugInfo() {
  const info = getMockDataDebugInfo();
  console.group('[MockDataDebug] Current State');
  console.log('Toggle Enabled:', info.toggleEnabled);
  console.log('Last Toggle Time:', info.lastToggleTime || 'Never');
  console.log('Components Using Mock:', info.componentsUsingMock.length);
  if (info.componentsUsingMock.length > 0) {
    console.table(info.componentsUsingMock);
  }
  console.groupEnd();
  return info;
}

/**
 * Verify toggle is working
 */
export function verifyToggleWorking(): boolean {
  const enabled = getGlobalMockDataEnabled();
  console.log('[MockDataDebug] Toggle verification:', { enabled, type: typeof enabled });
  return typeof enabled === 'boolean';
}

// Auto-log on window load in dev mode
if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
  window.addEventListener('load', () => {
    console.log('[MockDataDebug] Initial state:', getMockDataDebugInfo());
  });
  
  // Expose to window for manual testing
  (window as any).mockDataDebug = {
    getInfo: getMockDataDebugInfo,
    log: logMockDataDebugInfo,
    verify: verifyToggleWorking
  };
}

