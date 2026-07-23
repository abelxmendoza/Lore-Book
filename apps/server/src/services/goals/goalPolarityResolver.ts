export interface GoalPolarity {
  negated: boolean;
  avoidance: boolean;
  nestedContinuation: boolean;
  scopes: string[];
}

export function resolveGoalPolarity(text: string): GoalPolarity {
  const nested = /\b(?:don'?t|do not)\s+want\s+to\s+stop\s+(.+)/i.exec(text);
  if (nested) {
    return { negated: false, avoidance: false, nestedContinuation: true, scopes: [nested[0]] };
  }
  const avoidance = /\b(?:don'?t|do not|never)\s+want\s+to\b/i.test(text);
  const negated = avoidance || /\b(?:won'?t|can'?t|not going to|no longer want to)\b/i.test(text);
  return {
    negated,
    avoidance,
    nestedContinuation: false,
    scopes: negated ? [text.trim()] : [],
  };
}
