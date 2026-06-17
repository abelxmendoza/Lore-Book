/** Knowledge states exposed in the Trust Center (Phase 2). */
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

export const TRUST_DOMAINS: TrustDomain[] = [
  'characters',
  'locations',
  'organizations',
  'projects',
  'goals',
  'skills',
  'communities',
  'relationships',
  'events',
  'households',
];

export type ConfidenceBucket = 'high' | 'medium' | 'low' | 'none';

export type ConfidenceDistribution = Record<ConfidenceBucket, number>;

export type DomainCoverageMetrics = {
  domain: TrustDomain;
  entity_count: number;
  evidence_count: number;
  confidence_distribution: ConfidenceDistribution;
  coverage_score: number;
  states: Record<KnowledgeState, number>;
};

export type EntityTrustRow = {
  id: string;
  name: string;
  domain: TrustDomain;
  state: KnowledgeState;
  confidence: number;
  evidence_count: number;
  coverage_score: number;
  reason?: string;
};

export type UnknownGap = {
  id: string;
  kind:
    | 'mentioned_person_no_profile'
    | 'mentioned_place_no_location'
    | 'mentioned_project_no_card'
    | 'mentioned_org_no_group'
    | 'no_relationship'
    | 'sparse_entity'
    | 'timeline_void';
  label: string;
  prompt: string;
  domain: TrustDomain;
  priority: number;
  metadata?: Record<string, unknown>;
};

export type ReviewQueueItem = {
  id: string;
  kind: string;
  title: string;
  reason: string;
  domain: TrustDomain;
  priority: number;
  action?: string;
  metadata?: Record<string, unknown>;
};

export type TrustOverview = {
  generated_at: string;
  user_id: string;
  coverage: DomainCoverageMetrics[];
  overall_coverage_score: number;
  confidence: {
    average: number;
    distribution: ConfidenceDistribution;
  };
  unknowns: UnknownGap[];
  conflicts: ReviewQueueItem[];
  review_queue: ReviewQueueItem[];
  state_totals: Record<KnowledgeState, number>;
};
