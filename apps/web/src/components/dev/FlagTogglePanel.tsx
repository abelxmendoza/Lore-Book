import { useState } from 'react';
import { fetchJson } from '../../lib/api';
import { featureFlags, type FeatureFlag } from '../../config/featureFlags';

export const FlagTogglePanel = () => {
  const [flags, setFlags] = useState<Record<FeatureFlag, boolean>>(featureFlags);
  const [loading, setLoading] = useState(false);

  const toggleFlag = async (flag: FeatureFlag, enabled: boolean) => {
    try {
      setLoading(true);
      await fetchJson('/api/dev/toggle-flag', {
        method: 'POST',
        body: JSON.stringify({ flag, enabled }),
      });
      setFlags(prev => ({ ...prev, [flag]: enabled }));
    } catch (err) {
      console.error('Failed to toggle flag:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-lg border border-orange-500/30 bg-black/40 p-4">
      <h2 className="text-xl font-semibold mb-4">Feature Flag Toggles</h2>
      
      <div className="space-y-3">
        {(Object.keys(flags) as FeatureFlag[]).map((flag) => {
          const enabled = flags[flag];
          
          return (
            <div
              key={flag}
              className="flex items-center justify-between rounded-lg border border-orange-500/20 bg-black/60 p-3"
            >
              <div>
                <div className="font-medium text-white">{flag}</div>
                <div className="text-xs text-white/50">
                  Status: {enabled ? 'Enabled' : 'Disabled'}
                </div>
              </div>
              <label className="flex items-center gap-2">
                <span className="text-sm text-white/70">Off</span>
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={(e) => toggleFlag(flag, e.target.checked)}
                  disabled={loading}
                  className="rounded"
                />
                <span className="text-sm text-white/70">On</span>
              </label>
            </div>
          );
        })}
      </div>
    </div>
  );
};

