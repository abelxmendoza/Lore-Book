/**
 * Mock Data Toggle Component
 * UI component for toggling mock data on/off
 * Perfect for development and showcasing the app before launch
 */

import { Database, AlertCircle, Info } from 'lucide-react';
import { useMockData } from '../../contexts/MockDataContext';
import { Switch } from '../ui/switch';
import { Badge } from '../ui/badge';
import { config } from '../../config/env';

export function MockDataToggle() {
  const { useMockData: isMockDataEnabled, toggleMockData } = useMockData();

  return (
    <div className="space-y-3 p-4 border border-border/60 rounded-lg bg-black/40">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Database className="h-5 w-5 text-primary" />
          <div>
            <h3 className="text-sm font-semibold text-white">Mock Data Mode</h3>
            <p className="text-xs text-white/60">
              {isMockDataEnabled 
                ? 'Using mock data for demonstration'
                : 'Using real data from backend'}
            </p>
          </div>
        </div>
        <Switch
          checked={isMockDataEnabled}
          onCheckedChange={toggleMockData}
          aria-label="Toggle mock data"
        />
      </div>
      
      {isMockDataEnabled && (
        <div className="flex items-start gap-2 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
          <AlertCircle className="h-4 w-4 text-yellow-400 mt-0.5 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-xs text-yellow-200 font-medium mb-1">
              Mock Data Active
            </p>
            <p className="text-xs text-yellow-200/80">
              All API calls will use sample data. Perfect for showcasing the app before launch.
            </p>
          </div>
        </div>
      )}

      {!isMockDataEnabled && config.dev.allowMockData && (
        <div className="flex items-start gap-2 p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg">
          <Info className="h-4 w-4 text-blue-400 mt-0.5 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-xs text-blue-200 font-medium mb-1">
              Real Data Mode
            </p>
            <p className="text-xs text-blue-200/80">
              Using real backend data. Toggle on to use mock data for development or showcasing.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

