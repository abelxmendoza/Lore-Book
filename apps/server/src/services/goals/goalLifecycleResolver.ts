import type { GoalDecision, GoalKind, GoalStatus, TemporalGoalState } from './goalTypes';

export function resolveGoalLifecycle(input: {
  text: string;
  kind: GoalKind;
  temporalState: TemporalGoalState;
}): { status: GoalStatus; lifecycleDecision?: GoalDecision } {
  if (/\b(?:no longer want|cancel|give up|abandon|never was a goal)\b/i.test(input.text)) {
    return { status: 'CANCELLED', lifecycleDecision: 'CANCEL_EXISTING' };
  }
  if (input.kind === 'COMPLETED_ACTION' || input.temporalState === 'PAST_COMPLETED') {
    return { status: 'COMPLETED', lifecycleDecision: 'COMPLETE_EXISTING' };
  }
  if (input.kind === 'WAITING_STATE') return { status: 'WAITING' };
  if (input.temporalState === 'PAST_UNRESOLVED') return { status: 'HISTORICAL' };
  return { status: 'CANDIDATE' };
}
