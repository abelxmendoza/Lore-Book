import { fetchJson } from '../lib/api';
import type { LifeHistoryReport } from './lifeHistory';
import type { NarrativeProvenanceReport } from './narrativeProvenance';

export type EpistemicState =
  | 'UNKNOWN'
  | 'POSSIBLE'
  | 'LIKELY'
  | 'VERIFIED'
  | 'CONTRADICTED'
  | 'DEPRECATED';

export type GraphNode = {
  id: string;
  node_kind: string;
  root_type: string;
  display_name: string;
  epistemic_state: EpistemicState;
  confidence: number;
  source_table: string | null;
  source_id: string | null;
  meta: Record<string, unknown>;
};

export type GraphEdge = {
  id: string;
  from_node_id: string;
  to_node_id: string;
  relation_kind: string;
  confidence: number;
  epistemic_state: EpistemicState;
};

export type SalienceItem = {
  target_kind: string;
  target_id: string;
  score: number;
  components: Record<string, number>;
};

export type AutobiographyOutline = {
  mode: 'autobiography';
  generatedAt: string;
  currentChapter: unknown;
  lifeChapters: LifeHistoryReport['chapters'];
  turningPoints: LifeHistoryReport['turningPoints'];
  interpretationClaims: unknown[];
  themes: string[];
  voice: 'first_person';
  evidenceRequired: boolean;
};

export const cognitionApi = {
  listGraphNodes: (opts?: { kind?: string; limit?: number }) => {
    const qs = new URLSearchParams();
    if (opts?.kind) qs.set('kind', opts.kind);
    if (opts?.limit) qs.set('limit', String(opts.limit));
    const suffix = qs.size ? `?${qs}` : '';
    return fetchJson<{ success: boolean; nodes: GraphNode[] }>(`/api/cognition/graph/nodes${suffix}`);
  },

  listEdgesFromNode: (nodeId: string) =>
    fetchJson<{ success: boolean; edges: GraphEdge[] }>(`/api/cognition/graph/edges/${nodeId}`),

  getAssertionProvenance: (targetKind: string, targetId: string) =>
    fetchJson<{ success: boolean; report?: NarrativeProvenanceReport; evidence?: unknown[] }>(
      `/api/cognition/assertions/${targetKind}/${targetId}/provenance`,
    ),

  getSalience: (limit = 20) =>
    fetchJson<{ success: boolean; items: SalienceItem[] }>(`/api/cognition/salience?limit=${limit}`),

  recomputeSalience: () =>
    fetchJson<{ success: boolean; count: number }>('/api/cognition/salience/recompute', {
      method: 'POST',
    }),

  getLifeHistory: () =>
    fetchJson<{ success: boolean; history: LifeHistoryReport }>('/api/cognition/life-history'),

  getCausalChain: (eventId: string) =>
    fetchJson<{ success: boolean; eventId: string; provenance: NarrativeProvenanceReport | null; causalLinks: unknown[] }>(
      `/api/cognition/causal-chain/${eventId}`,
    ),

  getAutobiographyOutline: () =>
    fetchJson<{ success: boolean; outline: AutobiographyOutline }>('/api/cognition/autobiography-outline'),
};
