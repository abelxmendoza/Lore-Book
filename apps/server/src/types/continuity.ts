/**
 * LORE-KEEPER EXPLAINABILITY & META CONTINUITY LAYER
 * TypeScript Types
 */

export type ContinuityEventType =
  | 'CLAIM_CREATED'
  | 'CLAIM_UPDATED'
  | 'CLAIM_ENDED'
  | 'CLAIM_REJECTED'
  | 'ENTITY_RESOLVED'
  | 'ENTITY_MERGED'
  | 'CONTRADICTION_FOUND'
  | 'CONTINUITY_ALERT'
  | 'TIMELINE_SEGMENTED'
  | 'NARRATIVE_TRANSITION'
  | 'DECISION_RECORDED'
  | 'DECISION_OUTCOME_RECORDED';

export type InitiatedBy = 'SYSTEM' | 'USER' | 'AI';
export type Severity = 'INFO' | 'WARNING' | 'ALERT';
export type ReversedBy = 'USER' | 'SYSTEM';

export interface ContinuityEvent {
  id: string;
  user_id: string;
  type: ContinuityEventType;
  timestamp: string;
  context: Record<string, any>;
  explanation: string;
  related_claim_ids: string[];
  related_entity_ids: string[];
  related_location_ids: string[];
  initiated_by: InitiatedBy;
  severity: Severity;
  reversible: boolean;
  reversal_id?: string | null;
  created_at: string;
  metadata?: Record<string, any>;
}

export interface ReversalLog {
  id: string;
  user_id: string;
  event_id: string;
  reversal_timestamp: string;
  reversed_by: ReversedBy;
  reason?: string;
  snapshot_before: Record<string, any>;
  snapshot_after: Record<string, any>;
  created_at: string;
  metadata?: Record<string, any>;
}

export interface EventExplanation {
  id: string;
  timestamp: string;
  type: ContinuityEventType;
  explanation: string;
  context: Record<string, any>;
  reversible: boolean;
  severity: Severity;
  initiated_by: InitiatedBy;
  related_claim_ids: string[];
  related_entity_ids: string[];
  related_location_ids: string[];
  related_context?: {
    claims?: any[];
    entities?: any[];
    locations?: any[];
  };
}

export interface ContinuityEventInput {
  type: ContinuityEventType;
  context: Record<string, any>;
  explanation: string;
  related_claim_ids?: string[];
  related_entity_ids?: string[];
  related_location_ids?: string[];
  initiated_by?: InitiatedBy;
  severity?: Severity;
  reversible?: boolean;
}

export interface EntityMergeData {
  source_entity_id: string;
  target_entity_id: string;
  merged_claim_ids: string[];
  source_entity: any;
  target_entity: any;
}

export interface TimelineSegmentData {
  entity_id: string;
  segments: Array<{
    start_time: string;
    end_time?: string;
    description: string;
  }>;
}

export interface NarrativeTransitionData {
  entity_id: string;
  arc_change: {
    from: string;
    to: string;
    description: string;
  };
}

