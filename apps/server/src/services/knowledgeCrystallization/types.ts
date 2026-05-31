// ============================================================================
// Knowledge Crystallization — Shared Types
//
// These types mirror the crystallized_knowledge and knowledge_evidence_links
// DB schema. All business logic that touches these types lives in the sibling
// service files — this file is pure type definitions only.
// ============================================================================

// ─── Knowledge taxonomy ──────────────────────────────────────────────────────

export type KnowledgeType =
  | 'behavioral_pattern'
  | 'value'
  | 'belief'
  | 'skill'
  | 'relationship'
  | 'lesson'
  | 'preference'
  | 'career'
  | 'creative'
  | 'identity'
  | 'health'
  | 'location';

// ─── Lifecycle ───────────────────────────────────────────────────────────────

export type ClaimStatus =
  | 'PENDING'    // Awaiting evidence maturation (reflection trigger only)
  | 'ACTIVE'     // Supported by evidence, eligible for prompt injection
  | 'DORMANT'    // Evidence aged, confidence degraded, not shown in prompt
  | 'HISTORICAL' // Arc closed, user superseded, or correction applied
  | 'SUPERSEDED'; // Replaced by a newer stronger claim on the same subject

export type TriggerType =
  | 'pattern_threshold'
  | 'arc_close'
  | 'user_reflection';

// ─── Evidence ────────────────────────────────────────────────────────────────

export type EvidenceType =
  | 'event_candidate'
  | 'life_arc'
  | 'arc_membership'
  | 'event_interpretation'
  | 'resolved_event'
  | 'omega_claim'
  | 'correction';

export interface EvidenceLink {
  id: string;
  knowledge_id: string;
  user_id: string;
  evidence_type: EvidenceType;
  evidence_id: string;
  evidence_weight: number;
  evidence_summary: string | null;
  created_at: string;
}

// ─── Confidence breakdown ────────────────────────────────────────────────────

export interface ConfidenceBreakdown {
  base_evidence: number;
  temporal_stability: number;
  cross_context: number;
  recency_factor: number;
  contradiction_penalty: number;
  final: number;
  computed_at: string;
}

// ─── Evidence bundle (input to confidence engine) ────────────────────────────
//
// Assembled by evidenceCollector.buildBundle() from multiple source tables.
// The confidence engine receives this and returns a ConfidenceBreakdown.
// The bundle is never written to the DB — it's an in-memory computation input.

export interface EvidenceBundleItem {
  evidence_type: EvidenceType;
  evidence_id: string;
  // Raw weight contribution before normalization cap
  raw_weight: number;
  // Denormalized text for display in the evidence view
  summary: string;
  // Date of the underlying event, used for temporal_stability calculation
  event_date?: string | null;
  // Which life arc this evidence belongs to (for cross_context calculation)
  arc_id?: string | null;
}

export interface EvidenceBundle {
  user_id: string;
  items: EvidenceBundleItem[];
  // Earliest event date across all items
  first_seen_at: string | null;
  // Most recent event date across all items
  last_seen_at: string | null;
  // Distinct life arc IDs across all items
  unique_arc_ids: string[];
  // True if any item is a correction (negative signal)
  has_contradiction: boolean;
}

// ─── Crystallized knowledge claim ────────────────────────────────────────────

export interface CrystallizedKnowledge {
  id: string;
  user_id: string;
  machine_claim: string;
  human_readable_claim: string;
  knowledge_type: KnowledgeType;
  status: ClaimStatus;
  superseded_by_id: string | null;
  crystallize_after: string | null;
  confidence: number;
  confidence_breakdown: ConfidenceBreakdown;
  trigger_type: TriggerType;
  trigger_id: string | null;
  first_evidenced_at: string | null;
  last_reinforced_at: string | null;
  principle_eligible: boolean;
  biography_eligible: boolean;
  arc_close_eligible: boolean;
  created_at: string;
  updated_at: string;
}

export interface CrystallizedKnowledgeWithEvidence extends CrystallizedKnowledge {
  evidence_links: EvidenceLink[];
}

// ─── Upsert payload (written by claimLifecycleManager) ───────────────────────

export interface UpsertClaimPayload {
  machine_claim: string;
  human_readable_claim: string;
  knowledge_type: KnowledgeType;
  status: ClaimStatus;
  confidence: number;
  confidence_breakdown: ConfidenceBreakdown;
  trigger_type: TriggerType;
  trigger_id: string | null;
  first_evidenced_at: string | null;
  last_reinforced_at: string | null;
  arc_close_eligible?: boolean;
  crystallize_after?: string | null;
}

// ─── Prompt-ready claim (subset used in systemPromptBuilder) ─────────────────

export interface PromptReadyClaim {
  knowledge_type: KnowledgeType;
  human_readable_claim: string;
  confidence: number;
}

// ─── Pattern threshold trigger context ───────────────────────────────────────

export interface PatternThresholdContext {
  eventCandidateId: string;
  userId: string;
  continuityStrength: number;
  occurrenceCount: number;
  firstSeenAt: string | null;
  lastSeenAt: string | null;
}
