/**
 * LORE-KEEPER PERSPECTIVE-AWARE MEMORY LAYER
 * TypeScript Types
 */

export type PerspectiveType =
  | 'SELF'
  | 'OTHER_PERSON'
  | 'GROUP'
  | 'SYSTEM'
  | 'FICTIONAL'
  | 'HISTORICAL';

export type Sentiment = 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL' | 'MIXED';

export interface Perspective {
  id: string;
  user_id: string;
  type: PerspectiveType;
  owner_entity_id?: string | null;
  label: string; // e.g. "Abel (self)", "Coach Felipe", "System inference"
  reliability_modifier: number; // 0.0 - 2.0, multiplies evidence reliability
  created_at: string;
  updated_at: string;
  metadata?: Record<string, any>;
}

export interface PerspectiveClaim {
  id: string;
  user_id: string;
  base_claim_id: string;
  perspective_id: string;
  text: string;
  confidence: number; // 0.0 - 1.0
  sentiment?: Sentiment;
  temporal_context?: Record<string, any>;
  is_active: boolean;
  created_at: string;
  ended_at?: string | null;
  metadata?: Record<string, any>;
}

export interface PerspectiveDispute {
  id: string;
  user_id: string;
  base_claim_id: string;
  perspective_claim_a_id: string;
  perspective_claim_b_id: string;
  reason?: string;
  detected_at: string;
  resolved_at?: string | null;
  is_resolved: boolean;
  created_at: string;
  metadata?: Record<string, any>;
}

export interface RankedPerspectiveClaim {
  claim_id: string;
  perspective_id: string;
  perspective_label: string;
  perspective_type: PerspectiveType;
  score: number;
  text: string;
  confidence: number;
  sentiment?: Sentiment;
}

export interface PerspectiveContradiction {
  perspective_claim_a: PerspectiveClaim;
  perspective_claim_b: PerspectiveClaim;
  similarity_score: number;
}

export interface EntitySummaryWithPerspectives {
  entity_id: string;
  summary: string;
  perspectives: Array<{
    perspective_id: string;
    perspective_label: string;
    perspective_type: PerspectiveType;
    claims: RankedPerspectiveClaim[];
  }>;
  disputes: PerspectiveDispute[];
  agreements: Array<{
    claim_id: string;
    perspectives: string[];
  }>;
  uncertainties: string[];
}

export interface PerspectiveClaimInput {
  base_claim_id: string;
  perspective_id: string;
  text: string;
  confidence?: number;
  sentiment?: Sentiment;
  temporal_context?: Record<string, any>;
}

export interface PerspectiveInput {
  type: PerspectiveType;
  owner_entity_id?: string;
  label: string;
  reliability_modifier?: number;
}

