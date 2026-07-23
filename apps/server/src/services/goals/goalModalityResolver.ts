export interface GoalModality {
  label: 'COMMITTED' | 'INTENDED' | 'OBLIGATED' | 'POSSIBLE' | 'WISHED' | 'NONE';
  weight: number;
}

export function resolveGoalModality(text: string): GoalModality {
  if (/\b(?:will|I'?m going to|committed to|decided to)\b/i.test(text)) return { label: 'COMMITTED', weight: 1 };
  if (/\b(?:want to|trying to|plan to|my goal)\b/i.test(text)) return { label: 'INTENDED', weight: 0.9 };
  if (/\b(?:have to|must|told me to|asked me to)\b/i.test(text)) return { label: 'OBLIGATED', weight: 0.62 };
  if (/\b(?:wish|hope)\b/i.test(text)) return { label: 'WISHED', weight: 0.45 };
  if (/\b(?:maybe|might|could|if)\b/i.test(text)) return { label: 'POSSIBLE', weight: 0.35 };
  return { label: 'NONE', weight: 0.25 };
}
