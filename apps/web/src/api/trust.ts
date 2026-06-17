import { fetchJson } from '../lib/api';
import { shouldUseMockData } from '../hooks/useShouldUseMockData';
import { getMockDomainTrust, getMockTrustOverview } from '../mocks/trustOverview';

export type KnowledgeState = 'known' | 'suggested' | 'unverified' | 'conflicted' | 'archived';

export type TrustDomain =
  | 'characters'
  | 'locations'
  | 'organizations'
  | 'projects'
  | 'goals'
  | 'skills'
  | 'communities'
  | 'relationships'
  | 'events'
  | 'households';

export type DomainCoverage = {
  domain: TrustDomain;
  entity_count: number;
  evidence_count: number;
  coverage_score: number;
  states: Record<KnowledgeState, number>;
};

export type UnknownGap = {
  id: string;
  kind: string;
  label: string;
  prompt: string;
  domain: TrustDomain;
  priority: number;
};

export type ReviewQueueItem = {
  id: string;
  kind: string;
  title: string;
  reason: string;
  domain: TrustDomain;
  priority: number;
  action?: string;
};

export type TrustOverview = {
  generated_at: string;
  overall_coverage_score: number;
  coverage: DomainCoverage[];
  confidence: { average: number };
  unknowns: UnknownGap[];
  conflicts: ReviewQueueItem[];
  review_queue: ReviewQueueItem[];
  state_totals: Record<KnowledgeState, number>;
};

export async function fetchTrustOverview(): Promise<TrustOverview> {
  const res = await fetchJson<TrustOverview & { data?: TrustOverview }>('/api/trust/overview', undefined, {
    useMockData: shouldUseMockData(),
    mockData: getMockTrustOverview(),
  });
  return (res as TrustOverview & { data?: TrustOverview }).data ?? res;
}

export async function fetchDomainTrust(domain: TrustDomain): Promise<DomainCoverage & { unknowns?: UnknownGap[] }> {
  if (shouldUseMockData()) {
    return getMockDomainTrust(domain);
  }
  const res = await fetchJson<DomainCoverage & { data?: DomainCoverage }>(`/api/trust/domains/${domain}`);
  return (res as { data?: DomainCoverage }).data ?? res;
}
