import { fetchJson } from '../lib/api';

export type CanonFact = { id: string; description: string; confidence: number };
export type ContinuityConflict = {
  id: string;
  title: string;
  severity: 'low' | 'medium' | 'high';
  details?: string;
};

export type ContinuitySnapshot = {
  stability: number;
  facts: CanonFact[];
  conflicts: ContinuityConflict[];
};

export type ContinuityStatePayload = {
  registry: { facts: Array<{ subject: string; attribute: string; value: string | number | string[]; confidence: number; scope: string; permanent?: boolean }> };
  driftSummary: Record<string, number>;
  driftSignals: Array<{ subject: string; attribute: string; drift_score: number; segments: string[]; notes: string }>;
  score: number;
  conflicts: Array<{ conflict_type: string; description: string; severity: string; subjects: string[]; attributes?: string[]; evidence: string[] }>;
};

// Fetch continuity state from backend
export const fetchContinuity = async () => {
  try {
    const state = await fetchJson<{ state: ContinuityStatePayload }>('/api/continuity/state');
    return {
      continuity: {
        stability: state.state?.score ? state.state.score / 100 : 0.85,
        facts: state.state?.registry?.facts?.map(f => ({
          id: `${f.subject}-${f.attribute}`,
          description: `${f.subject}::${f.attribute} → ${Array.isArray(f.value) ? f.value.join(', ') : f.value}`,
          confidence: f.confidence
        })) || [],
        conflicts: state.state?.conflicts?.map(c => ({
          id: c.conflict_type,
          title: c.description,
          severity: c.severity as 'low' | 'medium' | 'high',
          details: c.subjects?.join(', ')
        })) || []
      }
    };
  } catch (error) {
    // Return a default snapshot if endpoint doesn't exist yet
    return {
      continuity: {
        stability: 0.85,
        facts: [],
        conflicts: []
      }
    };
  }
};

export const fetchMergeSuggestions = () =>
  fetchJson<{ suggestions: { id: string; title: string; rationale: string }[] }>('/api/continuity/merge').catch(() => ({ suggestions: [] }));
