import { useCallback, useEffect, useState } from 'react';

import { fetchContinuity, fetchMergeSuggestions, type ContinuitySnapshot } from '../api/continuity';
import { fetchJson } from '../lib/api';

export type CanonicalFact = {
  subject: string;
  attribute: string;
  value: string | number | string[];
  confidence: number;
  scope: string;
  tags?: string[];
  permanent?: boolean;
};

export type ContinuityConflict = {
  conflict_type: string;
  description: string;
  severity: string;
  subjects: string[];
  attributes?: string[];
  evidence: string[];
};

export type DriftSignal = {
  subject: string;
  attribute: string;
  drift_score: number;
  segments: string[];
  notes: string;
};

export type ContinuityStatePayload = {
  registry: { facts: CanonicalFact[] };
  driftSummary: Record<string, number>;
  driftSignals: DriftSignal[];
  score: number;
  conflicts: ContinuityConflict[];
};

export const useContinuity = () => {
  const [snapshot, setSnapshot] = useState<ContinuitySnapshot | null>(null);
  const [mergeSuggestions, setMergeSuggestions] = useState<{ id: string; title: string; rationale: string }[]>([]);
  const [state, setState] = useState<ContinuityStatePayload | null>(null);
  const [conflicts, setConflicts] = useState<ContinuityConflict[]>([]);
  const [report, setReport] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [
        { continuity },
        { suggestions },
        stateResponse,
        conflictResponse,
        reportResponse
      ] = await Promise.all([
        fetchContinuity(),
        fetchMergeSuggestions(),
        fetchJson<{ state: ContinuityStatePayload }>('/api/continuity/state').catch(() => ({ state: null })),
        fetchJson<{ conflicts: ContinuityConflict[] }>('/api/continuity/conflicts').catch(() => ({ conflicts: [] })),
        fetchJson<{ report: string }>('/api/continuity/report').catch(() => ({ report: '' }))
      ]);

      setSnapshot(continuity);
      setMergeSuggestions(suggestions);
      setState(stateResponse?.state ?? null);
      setConflicts(conflictResponse?.conflicts ?? stateResponse?.state?.conflicts ?? []);
      setReport(reportResponse?.report ?? '');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load continuity data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { snapshot, mergeSuggestions, state, conflicts, report, loading, error, refresh };
};
