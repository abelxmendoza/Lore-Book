import { fetchJson } from '../lib/api';

export type InferenceDomain =
  | 'graph_recovery'
  | 'locations'
  | 'organizations'
  | 'public_figures'
  | 'social_standing'
  | 'character_importance'
  | 'character_rescan'
  | 'relationship_classify';

export type InferenceTier = 't1' | 't2';

export type InferenceSyncReport = {
  tier: InferenceTier;
  ran: InferenceDomain[];
  skipped: InferenceDomain[];
  durationMs: number;
  ranAt: string;
};

export type InferenceSyncResponse = {
  success: boolean;
  report: InferenceSyncReport;
};

export const inferenceApi = {
  sync: (opts?: { tier?: InferenceTier; force?: boolean; domains?: InferenceDomain[] }) =>
    fetchJson<InferenceSyncResponse>('/api/inference/sync', {
      method: 'POST',
      body: JSON.stringify(opts ?? {}),
    }),

  status: () =>
    fetchJson<{
      success: boolean;
      state: { last_t1_run_at?: string | null; last_t2_run_at?: string | null };
      lastReport: InferenceSyncReport | null;
    }>('/api/inference/status'),

  schedule: (reason: string) =>
    fetchJson<{ success: boolean }>('/api/inference/schedule', {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }),
};
