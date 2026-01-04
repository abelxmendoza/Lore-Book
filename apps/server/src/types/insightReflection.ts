/**
 * LORE-KEEPER INSIGHT & REFLECTION ENGINE (IRE)
 * TypeScript Types
 */

export type InsightType =
  | 'PATTERN'
  | 'TREND'
  | 'DIVERGENCE'
  | 'SHIFT'
  | 'RECURRING_THEME';

export type InsightScope = 'ENTITY' | 'TIME' | 'RELATIONSHIP' | 'SELF';

export interface Insight {
  id: string;
  user_id: string;
  type: InsightType;
  title: string;
  description: string;
  confidence: number; // 0.0 - 1.0
  scope: InsightScope;
  related_entity_ids: string[];
  related_claim_ids: string[];
  related_perspective_ids: string[];
  time_window?: {
    start?: string;
    end?: string;
    rolling_window_days?: number;
  };
  generated_at: string;
  dismissed: boolean;
  metadata?: Record<string, any>;
}

export interface InsightEvidence {
  id: string;
  user_id: string;
  insight_id: string;
  claim_id: string;
  explanation: string;
  created_at: string;
  metadata?: Record<string, any>;
}

export interface InsightWithEvidence {
  insight: Insight;
  evidence: InsightEvidence[];
  disclaimer: string;
}

export interface PatternGroup {
  attribute: string;
  value: string;
  claim_ids: string[];
  frequency: number;
  claims: any[];
}

export interface TemporalShift {
  from: string;
  to: string;
  claim_ids: string[];
  strength: number;
}

export interface PerspectiveDivergence {
  claim_id: string;
  perspective_claims: Array<{
    perspective_id: string;
    perspective_label: string;
    text: string;
    confidence: number;
  }>;
  divergence_strength: number;
}

export interface RecurringTheme {
  topic: string;
  claim_ids: string[];
  frequency: number;
  claims: any[];
}

