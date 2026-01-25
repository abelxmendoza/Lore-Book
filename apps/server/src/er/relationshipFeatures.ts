/**
 * ML-ready feature extraction for temporal edges. Phase 3.1
 */

import { daysBetween } from './timeUtils';

export type RelationshipFeatures = {
  relationship_type: string;
  scope: string;
  phase: string;
  confidence: number;
  age_days: number | null;
  recency_days: number | null;
  evidence_count: number;
};

export function extractRelationshipFeatures(edge: {
  relationship_type: string;
  scope?: string | null;
  phase: string;
  confidence: number;
  start_time: string | null;
  last_evidence_at?: string | null;
  evidence_source_ids?: string[] | null;
}): RelationshipFeatures {
  const now = new Date();
  return {
    relationship_type: edge.relationship_type,
    scope: edge.scope ?? 'global',
    phase: edge.phase,
    confidence: edge.confidence,
    age_days: edge.start_time ? daysBetween(edge.start_time, now) : null,
    recency_days: edge.last_evidence_at ? daysBetween(edge.last_evidence_at, now) : null,
    evidence_count: edge.evidence_source_ids?.length ?? 0,
  };
}
