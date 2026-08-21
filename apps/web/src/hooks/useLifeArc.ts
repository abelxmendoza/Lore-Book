import { useCallback, useEffect, useState } from 'react';
import { stitchedTimelineApi } from '../api/stitchedTimeline';
import {
  priorTimeframeWindow,
  stitchedResultToLifeArcData,
  timeframeWindow,
  type LifeArcData,
  type Timeframe,
} from '../lib/lifeArcRecentFromStitched';

export type { LifeArcData, Timeframe } from '../lib/lifeArcRecentFromStitched';

/**
 * Recent-moments contract for Discovery → LifeArcPanel.
 * Reads `/api/chronology/stitched` (CanonicalTemporalModel). Does not call
 * `/api/life-arc/recent`.
 */
export function useLifeArc(timeframe: Timeframe = 'LAST_30_DAYS') {
  const [data, setData] = useState<LifeArcData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadLifeArc = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const window = timeframeWindow(timeframe);
      const prior = priorTimeframeWindow(timeframe);
      const [current, previous] = await Promise.all([
        stitchedTimelineApi.get({
          scope_type: 'global',
          start_time: window.start,
          end_time: window.end,
        }),
        stitchedTimelineApi
          .get({
            scope_type: 'global',
            start_time: prior.start,
            end_time: prior.end,
          })
          .catch(() => null),
      ]);
      setData(stitchedResultToLifeArcData(current, timeframe, previous));
    } catch (err: unknown) {
      console.error('Failed to load life arc:', err);
      setError(err instanceof Error ? err.message : 'Failed to load life arc');
    } finally {
      setLoading(false);
    }
  }, [timeframe]);

  useEffect(() => {
    void loadLifeArc();
  }, [loadLifeArc]);

  return {
    data,
    loading,
    error,
    refresh: loadLifeArc,
  };
}
