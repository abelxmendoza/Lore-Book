import type { GoalDiagnosticTrace } from './goalTypes';

export function serializeGoalDiagnostic(trace: GoalDiagnosticTrace): Record<string, unknown> {
  return {
    ...trace,
    eligibility: { ...trace.eligibility, reasons: [...trace.eligibility.reasons] },
    reasons: [...trace.reasons],
  };
}
