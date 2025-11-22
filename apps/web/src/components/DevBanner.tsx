/**
 * Development Banner Component
 * 
 * Shows a banner in development mode to indicate the app is running in dev.
 * Completely removed from production builds.
 */

import { config } from '../config/env';

export function DevBanner() {
  // Don't render in production
  if (!config.isDevelopment) {
    return null;
  }

  return (
    <div
      className="fixed bottom-4 right-4 z-50 bg-yellow-500/90 text-black px-4 py-2 rounded-lg shadow-lg border-2 border-yellow-600 text-sm font-medium"
      role="status"
      aria-live="polite"
      aria-label="Development mode indicator"
    >
      <div className="flex items-center gap-2">
        <span className="w-2 h-2 bg-black rounded-full animate-pulse" aria-hidden="true"></span>
        <span>Development Mode</span>
      </div>
    </div>
  );
}

