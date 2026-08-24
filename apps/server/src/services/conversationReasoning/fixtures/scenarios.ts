import type { WorkingMemoryAssembly, WorkingMemoryItem } from '../../chat/workingMemoryAssembler';
import type { ActiveConversationContext, ResponseScopePlan } from '../../responseScope/responseScopeTypes';
import type { DiscourseReferentKind } from '../discourseReasonerTypes';
import type { ConversationGoal, ConversationGoalState } from '../goalTrackerTypes';
import type { ConversationMilestoneType } from '../milestoneTypes';

export type GoalPersistenceScenario = {
  id: string;
  title: string;
  kind: 'goal_persistence';
  message: string;
  priorGoal: ConversationGoal | null;
  isCorrection?: boolean;
  isRetry?: boolean;
  expectedGoal: ConversationGoal;
  expectedChanged: boolean;
};

export type RetrievalAuditScenario = {
  id: string;
  title: string;
  kind: 'retrieval_audit';
  message: string;
  items: Array<Pick<WorkingMemoryItem, 'id' | 'type' | 'title' | 'content'> & { score?: number }>;
  scopePlanOverrides?: Partial<ResponseScopePlan>;
  expectDiscardedIds: string[];
  expectKeptIds: string[];
};

export type DiscourseResolutionScenario = {
  id: string;
  title: string;
  kind: 'discourse_resolution';
  message: string;
  activeContext?: ActiveConversationContext;
  expectedKind: DiscourseReferentKind;
  expectedEntityName?: string;
  expectedTopicContains?: string;
};

export type MemoryTierGateScenario = {
  id: string;
  title: string;
  kind: 'memory_tier_gate';
  message: string;
  activeContext?: ActiveConversationContext;
  conversationHistory: Array<{ role: string; content: string }>;
  expectShortCircuit: boolean;
};

export type MilestoneDetectionScenario = {
  id: string;
  title: string;
  kind: 'milestone_detection';
  message: string;
  expectedType: ConversationMilestoneType | null;
};

export type ReasoningCoreScenario =
  | GoalPersistenceScenario
  | RetrievalAuditScenario
  | DiscourseResolutionScenario
  | MemoryTierGateScenario
  | MilestoneDetectionScenario;

function goalState(goal: ConversationGoal): ConversationGoalState {
  return { goal, setAt: new Date().toISOString(), setFromMessage: 'prior message', turnsSinceSet: 2, confidence: 0.75 };
}

export const GOAL_PERSISTENCE_FIXTURES: Record<ConversationGoal, ConversationGoalState | null> = {
  learning_about_character: goalState('learning_about_character'),
  debugging_lorebook: goalState('debugging_lorebook'),
  reflecting_on_life: goalState('reflecting_on_life'),
  planning: goalState('planning'),
  testing_memory: goalState('testing_memory'),
  receiving_advice: goalState('receiving_advice'),
  giving_corrections: goalState('giving_corrections'),
  general: goalState('general'),
};

export const REASONING_CORE_SCENARIOS: ReasoningCoreScenario[] = [
  // ── Goal persistence ──────────────────────────────────────────────────
  {
    id: 'goal_kiley_new_noun_does_not_switch',
    title: "the blueprint's own example: a new name mid-reflection must not read as a new goal",
    kind: 'goal_persistence',
    message: 'I just told you about Kiley.',
    priorGoal: 'reflecting_on_life',
    expectedGoal: 'reflecting_on_life',
    expectedChanged: false,
  },
  {
    id: 'goal_planning_strong_signal_switches',
    title: 'an explicit planning request switches an unset goal',
    kind: 'goal_persistence',
    message: "Let's actually plan out my next three months.",
    priorGoal: null,
    expectedGoal: 'planning',
    expectedChanged: true,
  },
  {
    id: 'goal_correction_does_not_overwrite',
    title: 'a correction critiques the previous answer, not the conversation goal',
    kind: 'goal_persistence',
    message: "That's wrong, you forgot Wren.",
    priorGoal: 'reflecting_on_life',
    isCorrection: true,
    expectedGoal: 'reflecting_on_life',
    expectedChanged: false,
  },
  {
    id: 'goal_testing_memory_strong_signal',
    title: 'an explicit memory test switches an unset goal',
    kind: 'goal_persistence',
    message: "I'm testing whether you remember what I told you last week.",
    priorGoal: null,
    expectedGoal: 'testing_memory',
    expectedChanged: true,
  },
  {
    id: 'goal_debugging_strong_signal',
    title: 'an explicit bug report switches an unset goal',
    kind: 'goal_persistence',
    message: 'Why does LoreBook keep forgetting this?',
    priorGoal: null,
    expectedGoal: 'debugging_lorebook',
    expectedChanged: true,
  },
  {
    id: 'goal_advice_strong_signal',
    title: 'an explicit advice request switches an unset goal',
    kind: 'goal_persistence',
    message: 'Give me advice on what should I do about this.',
    priorGoal: null,
    expectedGoal: 'receiving_advice',
    expectedChanged: true,
  },
  {
    id: 'goal_retry_holds_current_goal',
    title: 'a retry request never reclassifies the goal',
    kind: 'goal_persistence',
    message: 'try again',
    priorGoal: 'planning',
    isRetry: true,
    expectedGoal: 'planning',
    expectedChanged: false,
  },
  {
    id: 'goal_reinforcement_same_goal_not_marked_changed',
    title: 'repeating the same goal-shaped signal reinforces, not "changes"',
    kind: 'goal_persistence',
    message: "Let's plan out the rest of this week too.",
    priorGoal: 'planning',
    expectedGoal: 'planning',
    expectedChanged: false,
  },

  // ── Retrieval audit ───────────────────────────────────────────────────
  {
    id: 'audit_unrelated_domain_discarded',
    title: "the blueprint's own example: a retrieved item from an unrelated domain is discarded with a reason",
    kind: 'retrieval_audit',
    message: 'what am i building lately',
    items: [
      { id: 'romance-1', type: 'event', title: 'Date night', content: 'Went on a romantic date night with my girlfriend downtown.' },
    ],
    expectDiscardedIds: ['romance-1'],
    expectKeptIds: [],
  },
  {
    id: 'audit_well_scored_item_survives',
    title: 'a topically supporting item must not be over-pruned',
    kind: 'retrieval_audit',
    message: 'what is my job like these days',
    items: [
      { id: 'work-1', type: 'event', title: 'Promotion', content: 'Got promoted at work after the big project shipped.' },
    ],
    expectDiscardedIds: [],
    expectKeptIds: ['work-1'],
  },
  {
    id: 'audit_closed_scope_unlinked_item_discarded',
    title: 'closed-scope query discards an item with no entity/subject link',
    kind: 'retrieval_audit',
    message: 'who is new and returning in this story?',
    items: [{ id: 'unlinked-1', type: 'episode', title: 'Random note', content: 'Something unrelated happened once.' }],
    scopePlanOverrides: { closedScope: true },
    expectDiscardedIds: ['unlinked-1'],
    expectKeptIds: [],
  },
  {
    id: 'audit_family_topic_forbidden_kind_discarded',
    title: 'a work-shaped item never answers a family question',
    kind: 'retrieval_audit',
    message: 'tell me about my mom',
    items: [{ id: 'sprint-1', type: 'event', title: 'Sprint deploy', content: 'Deployed a new feature during the sprint onboarding.' }],
    expectDiscardedIds: ['sprint-1'],
    expectKeptIds: [],
  },
  {
    id: 'audit_conflict_topic_supporting_item_survives',
    title: 'a conflict-supporting item survives a conflict question',
    kind: 'retrieval_audit',
    message: 'who have I had conflict with recently',
    items: [{ id: 'conflict-1', type: 'event', title: 'Falling out', content: 'We had a falling out after an argument at the show.' }],
    expectDiscardedIds: [],
    expectKeptIds: ['conflict-1'],
  },
  {
    id: 'audit_debug_inspector_mode_passes_everything',
    title: 'audit/debug_inspector response modes see everything unfiltered',
    kind: 'retrieval_audit',
    message: 'show me the debug inspector',
    items: [{ id: 'raw-1', type: 'episode', title: 'Anything', content: 'Anything at all, unscored.' }],
    scopePlanOverrides: { responseMode: 'debug_inspector' },
    expectDiscardedIds: [],
    expectKeptIds: ['raw-1'],
  },
  {
    id: 'audit_empty_assembly_is_a_noop',
    title: 'an empty assembly audits to zero discards without erroring',
    kind: 'retrieval_audit',
    message: 'what am i building lately',
    items: [],
    expectDiscardedIds: [],
    expectKeptIds: [],
  },

  // ── Discourse resolution ──────────────────────────────────────────────
  {
    id: 'discourse_that_resolves_to_exchange_not_entity',
    title: "the blueprint's own example: \"that\" must resolve to the exchange, not the entity",
    kind: 'discourse_resolution',
    message: 'Do you remember when that was?',
    activeContext: { intent: 'general', entities: [{ name: 'Jerry' }], userTurnsSinceAnchor: 1 },
    expectedKind: 'exchange',
    expectedTopicContains: 'Jerry',
  },
  {
    id: 'discourse_bare_pronoun_resolves_to_entity',
    title: 'a bare pronoun with a live entity anchor resolves to that entity',
    kind: 'discourse_resolution',
    message: 'How old is she?',
    activeContext: { intent: 'general', entities: [{ name: 'Wren' }], userTurnsSinceAnchor: 0 },
    expectedKind: 'entity',
    expectedEntityName: 'Wren',
  },
  {
    id: 'discourse_no_active_context_stays_unresolved',
    title: 'a pronoun with no active context to anchor to is never force-resolved',
    kind: 'discourse_resolution',
    message: 'How old is she?',
    activeContext: undefined,
    expectedKind: 'unresolved',
  },
  {
    id: 'discourse_exchange_never_classified_as_entity',
    title: 'regression guard: an exchange-shaped message never triggers the entity-rewrite path',
    kind: 'discourse_resolution',
    message: 'Our first breakthrough was incredible.',
    activeContext: { intent: 'general', entities: [{ name: 'Jerry' }], userTurnsSinceAnchor: 1 },
    expectedKind: 'exchange',
  },

  // ── Memory tier gate ──────────────────────────────────────────────────
  {
    id: 'tier_genuine_follow_up_short_circuits',
    title: 'a genuine in-conversation follow-up with real overlap short-circuits retrieval',
    kind: 'memory_tier_gate',
    message: 'How old is she?',
    activeContext: { intent: 'general', entities: [{ name: 'Wren' }], userTurnsSinceAnchor: 1 },
    conversationHistory: [
      { role: 'user', content: 'Tell me about my friend Wren.' },
      { role: 'assistant', content: 'Wren is your best friend. She is 29 years old and lives in Austin.' },
    ],
    expectShortCircuit: true,
  },
  {
    id: 'tier_standalone_question_never_short_circuits',
    title: 'a full standalone question is never follow-up-shaped and must not short-circuit',
    kind: 'memory_tier_gate',
    message: 'What is my job like these days?',
    activeContext: { intent: 'general', entities: [{ name: 'Wren' }], userTurnsSinceAnchor: 1 },
    conversationHistory: [{ role: 'assistant', content: 'Your job these days sounds demanding and busy.' }],
    expectShortCircuit: false,
  },
  {
    id: 'tier_stale_context_never_short_circuits',
    title: 'a decayed active context (past MAX_ACTIVE_CONTEXT_TURNS) never short-circuits',
    kind: 'memory_tier_gate',
    message: 'How old is she?',
    activeContext: { intent: 'general', entities: [{ name: 'Wren' }], userTurnsSinceAnchor: 6 },
    conversationHistory: [
      { role: 'user', content: 'Tell me about my friend Wren.' },
      { role: 'assistant', content: 'Wren is your best friend. She is 29 years old and lives in Austin.' },
    ],
    expectShortCircuit: false,
  },
  {
    id: 'tier_no_vocabulary_overlap_never_short_circuits',
    title: 'a follow-up-shaped message with no real overlap falls through to full retrieval',
    kind: 'memory_tier_gate',
    message: 'How old is she?',
    activeContext: { intent: 'general', entities: [{ name: 'Wren' }], userTurnsSinceAnchor: 1 },
    conversationHistory: [{ role: 'assistant', content: 'We discussed groceries and weekend plans.' }],
    expectShortCircuit: false,
  },

  // ── Milestone detection ───────────────────────────────────────────────
  {
    id: 'milestone_memory_recognition',
    title: 'detects memory_recognition',
    kind: 'milestone_detection',
    message: 'Wow, you actually remembered that!',
    expectedType: 'memory_recognition',
  },
  {
    id: 'milestone_first_time_felt_alive',
    title: 'detects first_time_felt_alive',
    kind: 'milestone_detection',
    message: 'This was the first time LoreBook felt alive to me.',
    expectedType: 'first_time_felt_alive',
  },
  {
    id: 'milestone_exceeded_expectation_with_app_referent',
    title: 'detects exceeded_expectation when the app is the explicit referent',
    kind: 'milestone_detection',
    message: "That's exactly what I hoped you'd remember.",
    expectedType: 'exceeded_expectation',
  },
  {
    id: 'milestone_app_gratitude',
    title: 'detects app_gratitude',
    kind: 'milestone_detection',
    message: 'Thank you for remembering that about me.',
    expectedType: 'app_gratitude',
  },
  {
    id: 'milestone_life_event_scores_below_floor',
    title: "disambiguation from narrative/milestoneClassifier.ts: a life-event 'exactly what I hoped' must not fire",
    kind: 'milestone_detection',
    message: "That's exactly what I hoped for in a new job.",
    expectedType: null,
  },
  {
    id: 'milestone_ordinary_thanks_does_not_fire',
    title: 'a bare "thanks" greeting is not precise enough to count as a milestone',
    kind: 'milestone_detection',
    message: 'Thanks!',
    expectedType: null,
  },
  {
    id: 'milestone_unrelated_chat_does_not_fire',
    title: 'ordinary chat with no milestone-shaped language never fires',
    kind: 'milestone_detection',
    message: 'What is my job like these days?',
    expectedType: null,
  },
];
