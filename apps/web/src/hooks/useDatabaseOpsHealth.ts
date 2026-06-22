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
 * Polls /api/health/db for admins only. Cached on the server (15m); client polls
 * at the same interval to avoid unnecessary egress.
 */
export function useDatabaseOpsHealth(): DatabaseOpsHealthState {
  const { authority, loading: authorityLoading } = useAccountAuthority();
  const isAdmin = authority?.canAccessAdmin === true;
  const [payload, setPayload] = useState<DbHealthPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    if (!isAdmin || getBackendUnavailable()) return;

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
  }, [isAdmin]);

  useEffect(() => {
    if (authorityLoading || !isAdmin) {
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
  }, [authorityLoading, isAdmin, load]);

  return {
    loading,
    payload,
    error,
    refresh: () => void load(),
    showBanner: shouldShowOpsBanner(payload),
  };
}

/** @deprecated use useDatabaseOpsHealth */
export const useDatabaseStorageHealth = useDatabaseOpsHealth;

export type DatabaseStorageHealthState = DatabaseOpsHealthState;
