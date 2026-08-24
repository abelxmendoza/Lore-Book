/** Moments where the USER marks the conversation-with-the-app itself as meaningful — distinct from the user's life milestones (narrative/milestoneClassifier.ts). */
export type ConversationMilestoneType =
  | 'memory_recognition' // "You finally remembered"
  | 'first_time_felt_alive' // "This was the first time LoreBook felt alive"
  | 'exceeded_expectation' // "That's exactly what I hoped"
  | 'app_gratitude'; // "Thank you for remembering that"

export type ConversationMilestoneRecord = {
  id: string;
  detectedAt: string;
  turnIndex: number;
  milestoneType: ConversationMilestoneType;
  /** Truncated, same discipline as goalTrackerTypes.setFromMessage — never full raw text. */
  messageExcerpt: string;
  triggerPhrase: string;
  score: number;
};
