/**
 * Development Banner Component
 * 
 * Shows a banner in development mode to indicate the app is running in dev.
 * Includes quick access to mock data toggle.
 */

import { config } from '../config/env';
import { useMockData } from '../contexts/MockDataContext';
import { Database, X } from 'lucide-react';
import { useState } from 'react';

export function DevBanner() {
  const [isDismissed, setIsDismissed] = useState(false);
  let useMockData = false;
  let toggleMockData = () => {};
  
  try {
    const mockData = useMockData();
    useMockData = mockData.useMockData;
    toggleMockData = mockData.toggleMockData;
  } catch {
    // Context not available, use default
  }

  // Show in development OR if mock data is enabled (for showcasing)
  if ((!config.env.isDevelopment && !useMockData) || isDismissed) {
    return null;
  }

  return (
    <div
      className="fixed bottom-4 left-4 z-50 flex items-center gap-3 bg-yellow-500/90 text-black px-4 py-2 rounded-lg shadow-lg border-2 border-yellow-600 text-sm font-medium"
      role="status"
      aria-live="polite"
      aria-label="Development mode indicator"
    >
      <div className="flex items-center gap-2">
        <span className="w-2 h-2 bg-black rounded-full animate-pulse" aria-hidden="true"></span>
        <span>{config.env.isDevelopment ? 'Development Mode' : 'Showcase Mode'}</span>
      </div>
      <button
        onClick={toggleMockData}
        className={`flex items-center gap-1.5 px-2 py-1 rounded border transition-colors ${
          useMockData
            ? 'bg-green-500/20 border-green-600 text-green-900'
            : 'bg-white/20 border-black/20 text-black/70 hover:bg-white/30'
        }`}
        aria-label={useMockData ? 'Mock data enabled - click to disable' : 'Mock data disabled - click to enable'}
        title={useMockData ? 'Mock data ON - Click to use real data' : 'Mock data OFF - Click to use mock data'}
      >
        <Database className="h-3.5 w-3.5" />
        <span className="text-xs font-semibold">{useMockData ? 'MOCK ON' : 'MOCK OFF'}</span>
      </button>
      <button
        onClick={() => setIsDismissed(true)}
        className="ml-1 p-1 rounded hover:bg-black/20 transition-colors touch-manipulation"
        aria-label="Close development mode banner"
        title="Close"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

