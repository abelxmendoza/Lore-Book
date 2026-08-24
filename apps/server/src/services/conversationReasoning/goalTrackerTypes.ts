/** Why the user is talking to LoreBook right now — a coarse, persisted axis, distinct from responseScope's topic/entity anchoring. */
export type ConversationGoal =
  | 'learning_about_character'
  | 'debugging_lorebook'
  | 'reflecting_on_life'
  | 'planning'
  | 'testing_memory'
  | 'receiving_advice'
  | 'giving_corrections'
  | 'general';

export type ConversationGoalState = {
  goal: ConversationGoal;
  /** ISO timestamp of when this goal was last set (not merely reinforced). */
  setAt: string;
  /** Truncated excerpt of the message that set the goal — for the observatory trace, never full raw text. */
  setFromMessage: string;
  turnsSinceSet: number;
  /** 0-1 deterministic signal strength. */
  confidence: number;
};
