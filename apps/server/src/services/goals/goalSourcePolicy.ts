import type { GoalCognitionInput, GoalSourceType } from './goalTypes';

const DISALLOWED = new Set<GoalSourceType>([
  'assistant', 'system', 'generated', 'developer', 'ui', 'test',
]);

export function isGoalSourceAllowed(input: GoalCognitionInput): boolean {
  if (input.authorRole && input.authorRole !== 'user') return false;
  return !DISALLOWED.has(input.sourceType ?? 'chat');
}
