/**
 * LORE-KEEPER MEMORY REVIEW QUEUE (MRQ)
 * TypeScript Types
 */

export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH';
export type ProposalStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'EDITED' | 'DEFERRED';
export type DecisionType = 'APPROVE' | 'REJECT' | 'EDIT' | 'DEFER';
export type DecidedBy = 'USER' | 'SYSTEM';

export interface MemoryProposal {
  id: string;
  user_id: string;
  entity_id: string;
  claim_text: string;
  perspective_id?: string | null;
  confidence: number; // 0.0 - 1.0
  temporal_context?: Record<string, any>;
  source_excerpt?: string;
  reasoning?: string;
  affected_claim_ids: string[];
  risk_level: RiskLevel;
  status: ProposalStatus;
  created_at: string;
  resolved_at?: string | null;
  metadata?: Record<string, any>;
}

export interface MemoryDecision {
  id: string;
  user_id: string;
  proposal_id: string;
  decision: DecisionType;
  edited_text?: string | null;
  edited_confidence?: number | null;
  decided_by: DecidedBy;
  reason?: string | null;
  timestamp: string;
  metadata?: Record<string, any>;
}

export interface MemoryProposalInput {
  entity_id: string;
  claim_text: string;
  perspective_id?: string;
  confidence?: number;
  temporal_context?: Record<string, any>;
  source_excerpt?: string;
  reasoning?: string;
  affected_claim_ids?: string[];
}

export interface ProposalDecisionInput {
  decision: DecisionType;
  edited_text?: string;
  edited_confidence?: number;
  reason?: string;
}

export interface PendingMRQItem {
  id: string;
  entity_id: string;
  claim_text: string;
  perspective_id?: string | null;
  confidence: number;
  risk_level: RiskLevel;
  created_at: string;
  reasoning?: string;
  source_excerpt?: string;
}

