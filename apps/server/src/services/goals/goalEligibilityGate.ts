import type {
  AgencyLevel,
  GoalDurability,
  GoalEligibilityResult,
  GoalKind,
  TemporalGoalState,
} from './goalTypes';

const NEVER_QUEST = new Set<GoalKind>([
  'WISH', 'HOPE', 'WAITING_STATE', 'OBLIGATION', 'IDEA', 'COMPLETED_ACTION',
  'PAST_EVENT', 'FEEDBACK', 'HYPOTHETICAL', 'NON_GOAL', 'AVOIDANCE_GOAL',
]);

export function evaluateGoalEligibility(input: {
  kind: GoalKind;
  temporalState: TemporalGoalState;
  agency: AgencyLevel;
  durability: GoalDurability;
  semanticallyComplete: boolean;
  sourceAllowed: boolean;
  negated: boolean;
  intendedByUser: boolean;
}): GoalEligibilityResult {
  const futureOrOngoing = ['PRESENT_ACTIVE', 'FUTURE_PLANNED', 'ONGOING'].includes(input.temporalState);
  const unresolved = !['PAST_COMPLETED'].includes(input.temporalState);
  const notCompleted = input.kind !== 'COMPLETED_ACTION' && input.temporalState !== 'PAST_COMPLETED';
  const userHasAgency = input.agency === 'USER' || input.agency === 'SHARED';
  const sufficientlyDurable = input.durability !== 'MOMENTARY';
  const notNegated = !input.negated;
  const reasons: string[] = [];

  if (!input.sourceAllowed) reasons.push('source_not_user_authored');
  if (!input.intendedByUser) reasons.push('no_explicit_user_intent');
  if (!futureOrOngoing) reasons.push('not_current_or_future');
  if (!userHasAgency) reasons.push(input.agency === 'THIRD_PARTY' ? 'third_party_agency' : 'no_user_agency');
  if (!unresolved || !notCompleted) reasons.push('already_completed_or_historical');
  if (!notNegated) reasons.push('negated_or_avoidance_outcome');
  if (!sufficientlyDurable) reasons.push('momentary_or_trivial');
  if (!input.semanticallyComplete) reasons.push('fragment_or_incomplete_title');
  if (NEVER_QUEST.has(input.kind)) reasons.push(`kind_not_quest_eligible:${input.kind.toLowerCase()}`);

  return {
    eligible: reasons.length === 0,
    intendedByUser: input.intendedByUser,
    futureOrOngoing,
    userHasAgency,
    unresolved,
    notNegated,
    notCompleted,
    sufficientlyDurable,
    semanticallyComplete: input.semanticallyComplete,
    sourceAllowed: input.sourceAllowed,
    reasons,
  };
}
