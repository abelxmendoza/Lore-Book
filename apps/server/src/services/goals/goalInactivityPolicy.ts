export interface GoalInactivityContext {
  silentDays: number;
  appOutageDays?: number;
  workIntensity?: 'LOW' | 'NORMAL' | 'HIGH';
  explicitlyCancelled?: boolean;
}

export function goalInactivityAdjustment(context: GoalInactivityContext): number {
  if (context.explicitlyCancelled) return -1;
  const observableDays = Math.max(0, context.silentDays - (context.appOutageDays ?? 0));
  if (observableDays === 0) return 0;
  if (context.workIntensity === 'HIGH') return -Math.min(0.08, observableDays * 0.002);
  return -Math.min(0.25, observableDays * 0.006);
}

export function shouldAbandonFromSilence(): false {
  return false;
}
