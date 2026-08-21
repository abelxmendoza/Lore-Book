import { useCallback, useEffect, useRef, useState } from 'react';

import { getBackendUnavailable } from '../contexts/MockDataContext';
import { useAccountAuthority } from './useAccountAuthority';
import {
  fetchDbHealth,
  shouldShowOpsBanner,
  type DbHealthPayload,
} from '../lib/dbHealth';

const POLL_MS = 15 * 60 * 1000;

export type DatabaseOpsHealthState = {
  loading: boolean;
  payload: DbHealthPayload | null;
  error: string | null;
  refresh: () => void;
  showBanner: boolean;
};

/**
 * Polls /api/health/db for signed-in users. Admins see storage/upgrade warnings;
 * everyone sees a banner when Spend Cap or a quota has blocked writes.
 * Cached on the server (15m); client polls at the same interval.
 */
export function useDatabaseOpsHealth(): DatabaseOpsHealthState {
  const { authority, loading: authorityLoading } = useAccountAuthority();
  const isAdmin = authority?.canAccessAdmin === true;
  const [payload, setPayload] = useState<DbHealthPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    if (!authority || getBackendUnavailable()) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);
    try {
      const next = await fetchDbHealth(controller.signal);
      if (!controller.signal.aborted) {
        setPayload(next);
      }
    } catch (err) {
      if (controller.signal.aborted) return;
      setError(err instanceof Error ? err.message : 'Failed to load database health');
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  }, [authority]);

  useEffect(() => {
    if (authorityLoading || !authority) {
      setPayload(null);
      setError(null);
      return;
    }
    void load();
    const id = window.setInterval(() => void load(), POLL_MS);
    return () => {
      window.clearInterval(id);
      abortRef.current?.abort();
    };
  }, [authorityLoading, authority, load]);

  return {
    loading,
    payload,
    error,
    refresh: () => void load(),
    showBanner: shouldShowOpsBanner(payload, { isAdmin }),
  };
}

/** @deprecated use useDatabaseOpsHealth */
export const useDatabaseStorageHealth = useDatabaseOpsHealth;

export type DatabaseStorageHealthState = DatabaseOpsHealthState;
