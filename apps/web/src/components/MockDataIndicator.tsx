/**
 * Mock Data Indicator
 * Shows a banner when mock data is active
 * Can be dismissed but will reappear if mock data is toggled again
 */

import { Database, X } from 'lucide-react';
import { useMockData } from '../contexts/MockDataContext';
import { useState, useEffect } from 'react';

export function MockDataIndicator() {
  const { useMockData: isMockDataEnabled } = useMockData();
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('lorebook_mock_data_indicator_dismissed') === 'true';
    }
    return false;
  });

  // Reset dismissed state when mock data is toggled off
  useEffect(() => {
    if (!isMockDataEnabled && dismissed) {
      setDismissed(false);
      localStorage.removeItem('lorebook_mock_data_indicator_dismissed');
    }
  }, [isMockDataEnabled, dismissed]);

  const handleDismiss = () => {
    setDismissed(true);
    localStorage.setItem('lorebook_mock_data_indicator_dismissed', 'true');
  };

  if (!isMockDataEnabled || dismissed) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-sm animate-in slide-in-from-bottom-5 fade-in duration-300">
      <div className="bg-yellow-500/20 border border-yellow-500/50 rounded-lg p-3 shadow-lg backdrop-blur-sm">
        <div className="flex items-start gap-2">
          <Database className="h-4 w-4 text-yellow-400 mt-0.5 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-yellow-200 mb-1">
              Mock Data Mode Active
            </p>
            <p className="text-xs text-yellow-200/80">
              Using sample data for demonstration. Toggle off in settings to use real data.
            </p>
          </div>
          <button
            onClick={handleDismiss}
            className="text-yellow-400/60 hover:text-yellow-400 transition-colors flex-shrink-0 p-1 rounded hover:bg-yellow-500/10"
            aria-label="Dismiss mock data indicator"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      </div>
    </div>
  );
}

