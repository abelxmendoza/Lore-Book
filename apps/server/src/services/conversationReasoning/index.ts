/**
 * Conversation Reasoning Core (Blueprint 21, Phases 1-2).
 *
 * Seven "plan"/state concepts now sit adjacent to each other in this
 * codebase. Each owns a different axis — read this before adding an eighth:
 *
 *   CognitivePlan        (cognitivePlanner/)      — PRE-retrieval strategy: how to think about the question shape.
 *   LoreResponsePlan     (contextualLore/)        — WRITE-side: how to acknowledge new facts the user just told LoreBook.
 *   EpistemicAssessment  (cognitivePlanner/epistemicCalibration.ts) — how confidently to phrase the answer (hedging tier).
 *   ConversationGoalState (this module)           — WHY the user is talking to LoreBook at all; persisted, rarely changes.
 *   AnswerPlan            (this module)           — POST-retrieval focus: what the answer should actually address, given audited evidence.
 *   DiscourseResolution   (this module)           — PRE-retrieval reference resolution: what "that"/"she"/"our first breakthrough" points at, entity vs. prior exchange.
 *   ConversationMilestoneRecord (this module)     — moments where the user marks the conversation-with-the-app itself as meaningful; distinct from narrative/milestoneClassifier.ts's life-event milestones.
 */

export * from './goalTrackerTypes';
export { resolveConversationGoal, loadConversationGoal, persistConversationGoal } from './goalTracker';
export { auditWorkingMemoryAssembly, AUDIT_MIN_SCORE } from './retrievalAuditor';
export type { AuditedItem } from './retrievalAuditor';
export { planAnswer, formatAnswerPlanBlock } from './responsePlanner';
export type { AnswerPlan } from './responsePlanner';
export * from './discourseReasonerTypes';
export {
  resolveDiscourseReferents,
  applyEntityReferentRewrite,
  DISCOURSE_ENTITY_REWRITE_MIN_CONFIDENCE,
  DISCOURSE_EXCHANGE_MIN_CONFIDENCE,
} from './discourseReasoner';
export {
  evaluateConversationTierGate,
  MEMORY_TIER_MIN_OVERLAP,
  MEMORY_TIER_MIN_CONFIDENCE,
} from './memoryTierGate';
export type { ConversationTierDecision } from './memoryTierGate';
export * from './milestoneTypes';
export {
  detectConversationMilestone,
  loadConversationMilestones,
  appendConversationMilestone,
  MILESTONE_MIN_COMPOSITE,
} from './milestoneDetector';
