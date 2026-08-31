import type { CognitivePlan } from '../cognitivePlanner/cognitivePlanner';
import type { WorkingMemoryAssembly } from '../chat/workingMemoryAssembler';
import type { AnswerPlan } from '../conversationReasoning/responsePlanner';
import type { AuditedItem } from '../conversationReasoning/retrievalAuditor';
import type { ConversationGoalState } from '../conversationReasoning/goalTrackerTypes';
import type { ResponseScopePlan } from '../responseScope/responseScopeTypes';

export const COMPOSITION_PLAN_VERSION = 'composition-plan-v1' as const;

export type CompositionProfile =
  | 'recall'
  | 'character'
  | 'timeline'
  | 'reflection'
  | 'planning'
  | 'debug'
  | 'general';

export type CompositionEvidencePriority =
  | 'direct_answer'
  | 'durable_knowledge'
  | 'active_context'
  | 'chronology'
  | 'relationships'
  | 'goals'
  | 'audited_sources'
  | 'provenance';

export type CompositionNarrativeStrategy =
  | 'answer_then_support'
  | 'portrait_then_evidence'
  | 'chronological_arc'
  | 'evidence_to_pattern'
  | 'goals_to_options'
  | 'diagnostic_trace'
  | 'minimal_grounded_answer';

export type CompositionOrdering =
  | 'direct_answer'
  | 'primary_evidence'
  | 'chronology'
  | 'supporting_evidence'
  | 'pattern_or_implication'
  | 'uncertainty'
  | 'provenance'
  | 'follow_up';

export type CompositionFollowUpStrategy =
  | 'ask_one_grounding_question'
  | 'offer_targeted_next_step'
  | 'ask_for_missing_detail'
  | 'none_unless_needed'
  | 'report_blocker';

/**
 * A source shape intentionally smaller than ChatSource. The composition layer
 * only needs stable identity and evidence metadata; it must not depend on a
 * particular retrieval implementation.
 */
export type CompositionEvidenceSource = {
  id: string;
  relevanceScore?: number;
  relevanceReasons?: string[];
  usage?: 'supporting' | 'background' | 'rejected';
};

export type CompositionPlan = {
  /** Schema version, not a runtime or model version. */
  version: typeof COMPOSITION_PLAN_VERSION;
  profile: CompositionProfile;
  primaryGoal: string;
  supportingGoal: string;
  evidencePriority: CompositionEvidencePriority[];
  narrativeStrategy: CompositionNarrativeStrategy;
  ordering: CompositionOrdering[];
  /** Relative item budget used by a later composer; this task does not apply it. */
  compressionBudget: number;
  /** Relative reflection budget used by a later composer; this task does not apply it. */
  reflectionBudget: number;
  followUpStrategy: CompositionFollowUpStrategy;
  selectedEvidenceIds: string[];
  discardedEvidenceIds: string[];
  /** Short deterministic explanation suitable for diagnostics, not chain-of-thought. */
  rationale: string;
};

export type CompositionPlanInput = {
  answerPlan?: AnswerPlan | null;
  cognitivePlan?: CognitivePlan | null;
  goal?: ConversationGoalState | null;
  scopePlan?: ResponseScopePlan | null;
  auditedAssembly?: WorkingMemoryAssembly | null;
  audited?: ReadonlyArray<AuditedItem>;
  sources?: ReadonlyArray<CompositionEvidenceSource>;
  rejectedSources?: ReadonlyArray<CompositionEvidenceSource>;
};
