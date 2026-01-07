/**
 * Utility to enable mock data programmatically
 * Useful for demos, showcases, and development
 */

import { getGlobalMockDataEnabled, setGlobalMockDataEnabled } from '../contexts/MockDataContext';

/**
 * Enable mock data programmatically
 * This will update the global state and localStorage
 */
export function enableMockData() {
  setGlobalMockDataEnabled(true);
  if (typeof window !== 'undefined') {
    localStorage.setItem('lorebook_use_mock_data', 'true');
    // Dispatch event to notify components
    window.dispatchEvent(new CustomEvent('mockDataToggled', { 
      detail: { enabled: true } 
    }));
  }
  console.log('[MockData] Mock data enabled');
}

/**
 * Disable mock data programmatically
 */
export function disableMockData() {
  setGlobalMockDataEnabled(false);
  if (typeof window !== 'undefined') {
    localStorage.setItem('lorebook_use_mock_data', 'false');
    // Dispatch event to notify components
    window.dispatchEvent(new CustomEvent('mockDataToggled', { 
      detail: { enabled: false } 
    }));
  }
  console.log('[MockData] Mock data disabled');
}

/**
 * Check if mock data is currently enabled
 */
export function isMockDataEnabled(): boolean {
  return getGlobalMockDataEnabled();
}

/**
 * Toggle mock data on/off
 */
export function toggleMockData() {
  const current = getGlobalMockDataEnabled();
  if (current) {
    disableMockData();
  } else {
    enableMockData();
  }
}

// Expose to window for easy access in console
if (typeof window !== 'undefined') {
  (window as any).enableMockData = enableMockData;
  (window as any).disableMockData = disableMockData;
  (window as any).toggleMockData = toggleMockData;
  (window as any).isMockDataEnabled = isMockDataEnabled;
  
  console.log('%c[MockData] Console helpers available:', 'color: #7c3aed; font-weight: bold');
  console.log('  - window.enableMockData() - Enable mock data');
  console.log('  - window.disableMockData() - Disable mock data');
  console.log('  - window.toggleMockData() - Toggle mock data');
  console.log('  - window.isMockDataEnabled() - Check current state');
}

