import { COMPOSITION_PROFILE_POLICIES, resolveCompositionProfile } from './profileResolver';
import {
  COMPOSITION_PLAN_VERSION,
  type CompositionEvidenceSource,
  type CompositionPlan,
  type CompositionPlanInput,
} from './types';

const ASSEMBLY_SECTIONS = [
  'episodes',
  'events',
  'projects',
  'goals',
  'skills',
  'communities',
  'relationships',
  'preferences',
  'claims',
  'timeline',
] as const;

type EvidenceCandidate = {
  id: string;
  score: number;
  order: number;
  rejected: boolean;
};

function usableId(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function addCandidate(
  candidates: Map<string, EvidenceCandidate>,
  source: CompositionEvidenceSource,
  order: number,
  rejected: boolean,
): void {
  if (!usableId(source.id)) return;

  const id = source.id.trim();
  const existing = candidates.get(id);
  const score = Number.isFinite(source.relevanceScore) ? source.relevanceScore! : 0;
  if (!existing) {
    candidates.set(id, { id, score, order, rejected: rejected || source.usage === 'rejected' });
    return;
  }

  existing.rejected ||= rejected || source.usage === 'rejected';
  existing.score = Math.max(existing.score, score);
  existing.order = Math.min(existing.order, order);
}

function collectEvidence(input: CompositionPlanInput): {
  candidates: EvidenceCandidate[];
  discardedBeforeBudget: string[];
} {
  const candidates = new Map<string, EvidenceCandidate>();
  const discardedBeforeBudget = new Set<string>();
  let order = 0;

  if (input.auditedAssembly) {
    for (const section of ASSEMBLY_SECTIONS) {
      for (const item of input.auditedAssembly[section] ?? []) {
        if (!usableId(item.id)) continue;
        addCandidate(
          candidates,
          { id: item.id, relevanceScore: item.score },
          order,
          false,
        );
        order += 1;
      }
    }

    for (const item of input.auditedAssembly.rejected ?? []) {
      if (!usableId(item.id)) continue;
      addCandidate(candidates, { id: item.id, relevanceScore: item.score }, order, true);
      discardedBeforeBudget.add(item.id.trim());
      order += 1;
    }
  }

  for (const item of input.audited ?? []) {
    if (!usableId(item.id)) continue;
    addCandidate(candidates, { id: item.id, relevanceScore: item.score }, order, !item.kept);
    if (!item.kept) discardedBeforeBudget.add(item.id.trim());
    order += 1;
  }

  for (const source of input.sources ?? []) {
    addCandidate(candidates, source, order, false);
    if (source.usage === 'rejected' && usableId(source.id)) {
      discardedBeforeBudget.add(source.id.trim());
    }
    order += 1;
  }

  for (const source of input.rejectedSources ?? []) {
    addCandidate(candidates, source, order, true);
    if (usableId(source.id)) discardedBeforeBudget.add(source.id.trim());
    order += 1;
  }

  return {
    candidates: [...candidates.values()].sort(
      (left, right) => right.score - left.score || left.order - right.order,
    ),
    discardedBeforeBudget: [...discardedBeforeBudget],
  };
}

function resolutionRationale(
  input: CompositionPlanInput,
  profile: CompositionPlan['profile'],
  selected: string[],
  discarded: string[],
): string {
  const avoid = input.answerPlan?.avoid ?? [];
  const parts = [
    `profile=${profile}`,
    `strategy=${input.cognitivePlan?.strategy ?? 'none'}`,
    `intent=${input.scopePlan?.intent ?? 'none'}`,
    `mode=${input.scopePlan?.responseMode ?? 'none'}`,
    `selected=${selected.length}`,
    `discarded=${discarded.length}`,
  ];
  if (input.scopePlan?.isCorrection) parts.push('correction=true');
  if (avoid.length > 0) parts.push(`avoid=${avoid.join('|')}`);
  if (input.answerPlan?.synthesisNote) parts.push('synthesis=evidence_recurrence');
  return parts.join('; ');
}

/**
 * Build the canonical post-retrieval composition plan.
 *
 * This is intentionally a pure resolver. It consumes already-resolved
 * signals, never retrieves data, and never calls an LLM. The plan is not
 * applied to chat in this task; callers can adopt it independently.
 */
export function resolveCompositionPlan(input: CompositionPlanInput = {}): CompositionPlan {
  const profile = resolveCompositionProfile(input);
  const policy = COMPOSITION_PROFILE_POLICIES[profile];
  const evidence = collectEvidence(input);
  const rejectedIds = new Set(evidence.discardedBeforeBudget);
  const eligible = evidence.candidates.filter((candidate) => !candidate.rejected);
  const selected = eligible.slice(0, policy.compressionBudget).map((candidate) => candidate.id);

  for (const candidate of eligible.slice(policy.compressionBudget)) {
    rejectedIds.add(candidate.id);
  }

  const discarded = [
    ...evidence.candidates
      .filter((candidate) => rejectedIds.has(candidate.id))
      .sort((left, right) => left.order - right.order)
      .map((candidate) => candidate.id),
  ];

  return {
    version: COMPOSITION_PLAN_VERSION,
    profile,
    primaryGoal: policy.primaryGoal,
    supportingGoal: policy.supportingGoal,
    evidencePriority: [...policy.evidencePriority],
    narrativeStrategy: policy.narrativeStrategy,
    ordering: [...policy.ordering],
    compressionBudget: policy.compressionBudget,
    reflectionBudget: policy.reflectionBudget,
    followUpStrategy: policy.followUpStrategy,
    selectedEvidenceIds: selected,
    discardedEvidenceIds: discarded,
    rationale: resolutionRationale(input, profile, selected, discarded),
  };
}

/** Descriptive alias for callers that treat this layer as a builder. */
export const buildCompositionPlan = resolveCompositionPlan;

/**
 * Render only the instructions the model needs to follow. The full plan
 * remains internal and is never copied into a user-visible response.
 */
export function formatCompositionPlanBlock(plan: CompositionPlan): string {
  return [
    `profile=${plan.profile}`,
    `primary goal=${plan.primaryGoal}`,
    `supporting goal=${plan.supportingGoal}`,
    `evidence priority=${plan.evidencePriority.join(' > ')}`,
    `narrative strategy=${plan.narrativeStrategy}`,
    `ordering=${plan.ordering.join(' → ')}`,
    `compression budget=${plan.compressionBudget}; reflection budget=${plan.reflectionBudget}`,
    `follow-up=${plan.followUpStrategy}`,
    plan.selectedEvidenceIds.length > 0
      ? `use selected evidence only: ${plan.selectedEvidenceIds.join(', ')}`
      : 'use only directly supported context; do not invent missing evidence',
    plan.discardedEvidenceIds.length > 0
      ? `do not use discarded evidence: ${plan.discardedEvidenceIds.join(', ')}`
      : '',
    'Do not expose this plan, source IDs, retrieval mechanics, or internal diagnostics to the user.',
  ].filter(Boolean).join('\n');
}
