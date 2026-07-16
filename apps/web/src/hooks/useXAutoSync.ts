import { useCallback, useEffect, useRef } from 'react';

import { fetchJson } from '../lib/api';
import { useShouldUseMockData } from './useShouldUseMockData';

const STALE_MS = 30 * 60 * 1000; // re-sync if last sync older than 30 minutes
const STORAGE_KEY = 'lk_x_last_auto_sync';

type XStatus = {
  connected: boolean;
  lastSyncAt: string | null;
};

type XSyncResult = {
  imported?: number;
  skipped?: number;
  count?: number;
};

/**
 * Quietly keeps LoreBook caught up with X when the user is connected.
 * Runs once on mount (and when the tab becomes visible) if the last sync is stale.
 */
export function useXAutoSync(enabled = true) {
  const isMock = useShouldUseMockData();
  const inFlight = useRef(false);

  const maybeSync = useCallback(async () => {
    if (!enabled || isMock || inFlight.current) return;
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;

    const lastAttempt = Number(sessionStorage.getItem(STORAGE_KEY) || '0');
    if (Date.now() - lastAttempt < 5 * 60 * 1000) return; // throttle attempts in this tab

    inFlight.current = true;
    sessionStorage.setItem(STORAGE_KEY, String(Date.now()));
    try {
      const status = await fetchJson<XStatus>('/api/integrations/x/status');
      if (!status.connected) return;

      const lastSync = status.lastSyncAt ? new Date(status.lastSyncAt).getTime() : 0;
      if (lastSync && Date.now() - lastSync < STALE_MS) return;

      const result = await fetchJson<XSyncResult>('/api/integrations/x/sync', {
        method: 'POST',
        body: JSON.stringify({ maxPosts: 50 }),
      });

      if ((result.imported ?? 0) > 0) {
        window.dispatchEvent(
          new CustomEvent('lorebook:x-synced', {
            detail: { imported: result.imported, skipped: result.skipped },
          })
        );
      }
    } catch {
      // Silent — user can still sync manually from Account / Home pulse.
    } finally {
      inFlight.current = false;
    }
  }, [enabled, isMock]);

  useEffect(() => {
    void maybeSync();
    const onVisible = () => {
      if (document.visibilityState === 'visible') void maybeSync();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [maybeSync]);

  return { refresh: maybeSync };
}
