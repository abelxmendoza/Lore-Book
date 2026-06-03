import { fetchJson } from '../lib/api';

export type KnowledgeClaim = {
  id: string;
  user_id: string;
  machine_claim: string;
  human_readable_claim: string;
  knowledge_type: string;
  status: 'PENDING' | 'ACTIVE' | 'DORMANT' | 'HISTORICAL' | 'SUPERSEDED';
  confidence: number;
  confidence_breakdown: {
    base_evidence: number;
    temporal_stability: number;
    cross_context: number;
    recency_factor: number;
    contradiction_penalty: number;
    computed_at: string;
  };
  trigger_type: string;
  first_evidenced_at: string;
  last_reinforced_at: string;
  superseded_by_id: string | null;
  evidence_links?: EvidenceLink[];
  supersedence_chain?: KnowledgeClaim[];
  created_at: string;
  updated_at: string;
};

export type EvidenceLink = {
  id: string;
  knowledge_id: string;
  user_id: string;
  evidence_type: string;
  evidence_id: string;
  evidence_weight: number;
  evidence_summary: string;
  created_at: string;
};

export type KnowledgeSummary = {
  total: number;
  by_type: Record<string, { count: number; avg_confidence: number }>;
  by_status: Record<string, number>;
};

export const knowledgeApi = {
  getClaims: (params?: {
    status?: 'PENDING' | 'ACTIVE' | 'DORMANT' | 'HISTORICAL' | 'SUPERSEDED' | 'ALL';
    knowledge_type?: string;
    include_evidence?: boolean;
    min_confidence?: number;
  }) => {
    const qs = new URLSearchParams();
    if (params?.status) qs.set('status', params.status);
    if (params?.knowledge_type) qs.set('knowledge_type', params.knowledge_type);
    if (params?.include_evidence !== undefined) qs.set('include_evidence', String(params.include_evidence));
    if (params?.min_confidence !== undefined) qs.set('min_confidence', String(params.min_confidence));
    const query = qs.toString();
    return fetchJson<{ success: boolean; claims: KnowledgeClaim[]; total: number }>(
      `/api/knowledge/claims${query ? `?${query}` : ''}`
    );
  },

  getClaim: (id: string) =>
    fetchJson<{ success: boolean; claim: KnowledgeClaim & { evidence_links: EvidenceLink[]; supersedence_chain: KnowledgeClaim[] } }>(
      `/api/knowledge/claims/${id}`
    ),

  getSummary: () =>
    fetchJson<{ success: boolean; summary: KnowledgeSummary }>('/api/knowledge/summary'),
};

export const KNOWLEDGE_TYPE_LABELS: Record<string, string> = {
  behavioral_pattern: 'Behavioral Pattern',
  value: 'Core Value',
  belief: 'Belief',
  skill: 'Skill',
  relationship: 'Relationship',
  lesson: 'Life Lesson',
  preference: 'Preference',
  career: 'Career',
  creative: 'Creative',
  identity: 'Identity',
  health: 'Health',
  location: 'Location',
};

export const KNOWLEDGE_TYPE_COLORS: Record<string, string> = {
  behavioral_pattern: 'text-blue-400 bg-blue-500/10 border-blue-500/30',
  value: 'text-purple-400 bg-purple-500/10 border-purple-500/30',
  belief: 'text-violet-400 bg-violet-500/10 border-violet-500/30',
  skill: 'text-green-400 bg-green-500/10 border-green-500/30',
  relationship: 'text-pink-400 bg-pink-500/10 border-pink-500/30',
  lesson: 'text-amber-400 bg-amber-500/10 border-amber-500/30',
  preference: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/30',
  career: 'text-orange-400 bg-orange-500/10 border-orange-500/30',
  creative: 'text-rose-400 bg-rose-500/10 border-rose-500/30',
  identity: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/30',
  health: 'text-teal-400 bg-teal-500/10 border-teal-500/30',
  location: 'text-lime-400 bg-lime-500/10 border-lime-500/30',
};
