import type {
  CompositionEvidencePriority,
  CompositionFollowUpStrategy,
  CompositionNarrativeStrategy,
  CompositionOrdering,
  CompositionProfile,
  CompositionPlanInput,
} from './types';

export type CompositionProfilePolicy = {
  primaryGoal: string;
  supportingGoal: string;
  evidencePriority: CompositionEvidencePriority[];
  narrativeStrategy: CompositionNarrativeStrategy;
  ordering: CompositionOrdering[];
  compressionBudget: number;
  reflectionBudget: number;
  followUpStrategy: CompositionFollowUpStrategy;
};

/** Canonical, typed profile policies shared by every composition plan. */
export const COMPOSITION_PROFILE_POLICIES: Readonly<
  Record<CompositionProfile, CompositionProfilePolicy>
> = {
  recall: {
    primaryGoal: 'Answer the user’s recall question from the strongest available evidence.',
    supportingGoal: 'Stay within the requested scope and state uncertainty when the record is thin.',
    evidencePriority: ['direct_answer', 'durable_knowledge', 'audited_sources', 'provenance'],
    narrativeStrategy: 'answer_then_support',
    ordering: ['direct_answer', 'primary_evidence', 'supporting_evidence', 'uncertainty', 'follow_up'],
    compressionBudget: 6,
    reflectionBudget: 0,
    followUpStrategy: 'ask_for_missing_detail',
  },
  character: {
    primaryGoal: 'Build a grounded portrait of the requested person or cast.',
    supportingGoal: 'Keep unrelated people and domains out of the portrait.',
    evidencePriority: ['direct_answer', 'relationships', 'durable_knowledge', 'audited_sources'],
    narrativeStrategy: 'portrait_then_evidence',
    ordering: ['direct_answer', 'primary_evidence', 'supporting_evidence', 'uncertainty', 'follow_up'],
    compressionBudget: 7,
    reflectionBudget: 1,
    followUpStrategy: 'ask_one_grounding_question',
  },
  timeline: {
    primaryGoal: 'Give the requested period or subject a chronological shape.',
    supportingGoal: 'Prefer dated, significant evidence and preserve temporal uncertainty.',
    evidencePriority: ['chronology', 'direct_answer', 'audited_sources', 'provenance'],
    narrativeStrategy: 'chronological_arc',
    ordering: ['direct_answer', 'chronology', 'supporting_evidence', 'uncertainty', 'follow_up'],
    compressionBudget: 10,
    reflectionBudget: 1,
    followUpStrategy: 'ask_for_missing_detail',
  },
  reflection: {
    primaryGoal: 'Synthesize a supported pattern without inventing a lesson or diagnosis.',
    supportingGoal: 'Use durable claims and recurring audited evidence to calibrate the reflection.',
    evidencePriority: ['durable_knowledge', 'active_context', 'relationships', 'audited_sources'],
    narrativeStrategy: 'evidence_to_pattern',
    ordering: ['direct_answer', 'primary_evidence', 'pattern_or_implication', 'uncertainty', 'follow_up'],
    compressionBudget: 8,
    reflectionBudget: 5,
    followUpStrategy: 'ask_one_grounding_question',
  },
  planning: {
    primaryGoal: 'Turn the user’s stated goals and live context into grounded options.',
    supportingGoal: 'Make trade-offs explicit and avoid generic advice unsupported by the record.',
    evidencePriority: ['goals', 'active_context', 'durable_knowledge', 'audited_sources'],
    narrativeStrategy: 'goals_to_options',
    ordering: ['direct_answer', 'primary_evidence', 'supporting_evidence', 'uncertainty', 'follow_up'],
    compressionBudget: 7,
    reflectionBudget: 2,
    followUpStrategy: 'offer_targeted_next_step',
  },
  debug: {
    primaryGoal: 'Explain the response decision using auditable retrieval and scope signals.',
    supportingGoal: 'Expose provenance and discarded evidence without presenting diagnostics as lore.',
    evidencePriority: ['audited_sources', 'provenance', 'direct_answer', 'chronology'],
    narrativeStrategy: 'diagnostic_trace',
    ordering: ['direct_answer', 'provenance', 'primary_evidence', 'supporting_evidence', 'follow_up'],
    compressionBudget: 20,
    reflectionBudget: 0,
    followUpStrategy: 'report_blocker',
  },
  general: {
    primaryGoal: 'Provide the smallest useful answer supported by the available evidence.',
    supportingGoal: 'Avoid over-interpreting sparse or out-of-scope evidence.',
    evidencePriority: ['direct_answer', 'audited_sources', 'durable_knowledge', 'provenance'],
    narrativeStrategy: 'minimal_grounded_answer',
    ordering: ['direct_answer', 'supporting_evidence', 'uncertainty', 'follow_up'],
    compressionBudget: 4,
    reflectionBudget: 0,
    followUpStrategy: 'none_unless_needed',
  },
};

function hasGoal(input: CompositionPlanInput, goal: string): boolean {
  return input.goal?.goal === goal;
}

/**
 * Resolve the profile with explicit safety precedence:
 * corrections remain conversational, while explicit debug/audit modes may
 * inspect internals only when they were not superseded by a correction.
 */
export function resolveCompositionProfile(input: CompositionPlanInput): CompositionProfile {
  const { answerPlan, cognitivePlan, scopePlan } = input;

  if (scopePlan?.isCorrection) return 'recall';
  if (scopePlan?.responseMode === 'debug_inspector' || scopePlan?.responseMode === 'audit') {
    return 'debug';
  }

  if (
    cognitivePlan?.strategy === 'planning' ||
    cognitivePlan?.expectedAnswer === 'plan' ||
    hasGoal(input, 'planning') ||
    hasGoal(input, 'receiving_advice')
  ) {
    return 'planning';
  }

  if (
    cognitivePlan?.strategy === 'reflect_patterns' ||
    cognitivePlan?.strategy === 'emotional_reflection' ||
    cognitivePlan?.strategy === 'why' ||
    cognitivePlan?.expectedAnswer === 'reflection' ||
    hasGoal(input, 'reflecting_on_life')
  ) {
    return 'reflection';
  }

  if (
    cognitivePlan?.strategy === 'timeline' ||
    scopePlan?.intent === 'timeline' ||
    (cognitivePlan?.expectedAnswer === 'narrative' && scopePlan?.intent === 'event')
  ) {
    return 'timeline';
  }

  if (
    cognitivePlan?.strategy === 'identity' ||
    cognitivePlan?.strategy === 'relationship' ||
    cognitivePlan?.strategy === 'cast_roster' ||
    scopePlan?.intent === 'relationship' ||
    hasGoal(input, 'learning_about_character')
  ) {
    return 'character';
  }

  if (
    scopePlan?.responseMode === 'focused_recall' ||
    scopePlan?.responseMode === 'summary' ||
    answerPlan != null ||
    hasGoal(input, 'testing_memory') ||
    hasGoal(input, 'giving_corrections')
  ) {
    return 'recall';
  }

  return 'general';
}
