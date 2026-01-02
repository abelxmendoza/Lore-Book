import { useState, useEffect, useCallback } from 'react';
import {
  getVerificationStatus,
  verifyEntry,
  getContradictions,
  resolveContradiction,
  getVerificationStats,
  type VerificationStatus,
  type VerificationResult,
  type EntryVerification,
  type VerificationStats
} from '../api/verification';

export const useVerificationStatus = (entryId: string | null) => {
  const [status, setStatus] = useState<VerificationStatus | null>(null);
  const [verification, setVerification] = useState<EntryVerification | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    if (!entryId) return;

    setLoading(true);
    setError(null);
    try {
      const result = await getVerificationStatus(entryId);
      setStatus(result.status);
      setVerification(result.verification);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch verification status');
      setStatus('unverified');
    } finally {
      setLoading(false);
    }
  }, [entryId]);

  useEffect(() => {
    void fetchStatus();
  }, [fetchStatus]);

  const refresh = useCallback(() => {
    void fetchStatus();
  }, [fetchStatus]);

  return { status, verification, loading, error, refresh };
};

export const useManualVerification = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const verify = useCallback(async (entryId: string): Promise<VerificationResult | null> => {
    setLoading(true);
    setError(null);
    try {
      const result = await verifyEntry(entryId);
      return result;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to verify entry');
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  return { verify, loading, error };
};

export const useContradictions = () => {
  const [contradictions, setContradictions] = useState<EntryVerification[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchContradictions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await getContradictions();
      setContradictions(result.contradictions);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch contradictions');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchContradictions();
  }, [fetchContradictions]);

  const resolve = useCallback(async (verificationId: string, notes?: string) => {
    try {
      await resolveContradiction(verificationId, notes);
      await fetchContradictions();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to resolve contradiction');
      throw err;
    }
  }, [fetchContradictions]);

  return { contradictions, loading, error, refresh: fetchContradictions, resolve };
};

export const useVerificationStats = () => {
  const [stats, setStats] = useState<VerificationStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await getVerificationStats();
      setStats(result.stats);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch verification stats');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchStats();
  }, [fetchStats]);

  return { stats, loading, error, refresh: fetchStats };
};

