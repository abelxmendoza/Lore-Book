/**
 * Cognitive Planner — decide how to think before deciding what to retrieve.
 *
 * Every question gets a reasoning strategy BEFORE evidence selection:
 *
 *   User question → Cognitive Planner → strategy + evidence plan
 *     → Evidence Contract → retrieval → synthesis → answer
 *
 * Retrieval is a consequence of planning, not the planner itself. The
 * strategies map onto capabilities that already exist as layers:
 *
 *   current_focus        → Active Narrative Threads (inspect, don't search)
 *   identity             → crystallized Knowledge + profile
 *   timeline             → Chapters / Events / Scenes
 *   relationship         → relationship knowledge + shared history
 *   emotional_reflection → threads + conflicts + emotional context
 *   why                  → explanation synthesis across threads + knowledge
 *   compare              → two temporal snapshots, then contrast
 *   planning             → goals + active threads + commitments
 *   reflect_patterns     → durable pattern/lesson claims (never invented)
 *   general              → ordinary contract-scored retrieval
 *
 * Pure and deterministic — runs on every turn before retrieval.
 */

export type CognitiveStrategy =
  | 'identity'
  | 'current_focus'
  | 'timeline'
  | 'relationship'
  | 'emotional_reflection'
  | 'why'
  | 'compare'
  | 'planning'
  | 'reflect_patterns'
  | 'general';

export type EvidenceClass =
  | 'knowledge'
  | 'active_threads'
  | 'chapters'
  | 'events'
  | 'relationship_history'
  | 'emotional_context'
  | 'goals'
  | 'observations';

export type ReasoningMode =
  | 'inspect'      // read structured state directly, no search
  | 'narrate'      // order evidence in time and tell it
  | 'explain'      // walk connections across domains
  | 'contrast'     // build two snapshots, diff them
  | 'synthesize'   // combine several domains into one interpretation
  | 'retrieve';    // ordinary scored retrieval

export type CognitivePlan = {
  strategy: CognitiveStrategy;
  /** Evidence classes this strategy needs — retrieval loads nothing else eagerly. */
  retrieve: EvidenceClass[];
  reasoning: ReasoningMode;
  expectedAnswer:
    | 'summary'
    | 'narrative'
    | 'explanation'
    | 'comparison'
    | 'reflection'
    | 'list'
    | 'plan'
    | 'chat';
  /** Whether broad observation search is permitted at all for this question. */
  allowObservationSearch: boolean;
  /** Rendered into the system prompt: how to think about this question. */
  directive: string;
};

type StrategyRule = {
  strategy: CognitiveStrategy;
  pattern: RegExp;
  plan: Omit<CognitivePlan, 'strategy'>;
};

/**
 * Order matters: more specific cognitive shapes first. "Why did I stop going
 * to shows?" must hit `why` before `timeline` sees "did".
 */
const STRATEGY_RULES: StrategyRule[] = [
  {
    strategy: 'compare',
    pattern:
      /\b(?:what(?:'s| has| have)? changed|changed since|how (?:has|have) (?:my|i|things)? ?\w* ?(?:changed|grown|evolved)|am i (?:happier|better|worse|different)|how have i grown|compared? (?:to|with) (?:last|before|a year|a month))\b/i,
    plan: {
      retrieve: ['knowledge', 'active_threads', 'chapters', 'events'],
      reasoning: 'contrast',
      expectedAnswer: 'comparison',
      allowObservationSearch: false,
      directive:
        'This is a COMPARISON question. Build two snapshots — then vs now — from chapters, knowledge, and threads, and answer by contrasting them. Name what changed, what stayed constant, and the direction of change. Do not answer with a flat list of memories.',
    },
  },
  {
    strategy: 'why',
    pattern:
      /\b(?:why (?:do|did|am|have|was|is|are)|what(?:'s| is) (?:driving|behind)|what made me|how come i)\b/i,
    plan: {
      retrieve: ['knowledge', 'active_threads', 'emotional_context', 'events'],
      reasoning: 'explain',
      expectedAnswer: 'explanation',
      allowObservationSearch: true,
      directive:
        'This is a WHY question. Do not answer from a single source: synthesize across domains — what is true (knowledge), what is unfolding (threads), and what has been felt (emotional context, conflicts). Connect causes explicitly ("after X, much of Y shifted into Z"). Only assert connections the evidence supports.',
    },
  },
  {
    strategy: 'reflect_patterns',
    pattern:
      /\b(?:what patterns|patterns (?:do you|have you) (?:notice|see)|what keeps happening|what have i learned|what (?:do you|have you) noticed about me|what makes me (?:happiest|happy|miserable)|recurring)\b/i,
    plan: {
      retrieve: ['knowledge', 'active_threads', 'chapters'],
      reasoning: 'synthesize',
      expectedAnswer: 'reflection',
      allowObservationSearch: false,
      directive:
        'This is a PATTERN/REFLECTION question. Answer primarily from durable crystallized claims (behavioral patterns, lessons, values) in WHAT LOREBOOK KNOWS — these are earned from repeated evidence. Support them with thread and chapter context. NEVER invent a life lesson that no claim supports; if the record holds no relevant pattern, say the pattern has not established itself yet.',
    },
  },
  {
    strategy: 'current_focus',
    pattern:
      /\b(?:what (?:am i|have i been) (?:working on|building|focused on|up to)|what(?:'s| is) (?:my focus|taking up my time|going on with me)|focused on lately|been up to lately|where(?:'s| is) my (?:energy|time) going)\b/i,
    plan: {
      retrieve: ['active_threads', 'knowledge', 'goals'],
      reasoning: 'inspect',
      expectedAnswer: 'summary',
      allowObservationSearch: false,
      directive:
        'This is a CURRENT FOCUS question. Answer by inspecting ACTIVE NARRATIVE THREADS directly — they already rank what is unfolding by liveness. Never perform or simulate a broad memory search; never enumerate raw observations. Lead with the highest-priority active threads.',
    },
  },
  {
    strategy: 'planning',
    pattern:
      /\b(?:should i|what(?:'s| is) (?:my|the) next step|what should i (?:do|focus on|prioritize)|help me (?:plan|decide)|am i on track)\b/i,
    plan: {
      retrieve: ['goals', 'active_threads', 'knowledge'],
      reasoning: 'synthesize',
      expectedAnswer: 'plan',
      allowObservationSearch: false,
      directive:
        'This is a PLANNING question. Ground the answer in stated goals, active threads, and current commitments — not in generic advice. Weigh the live threads against the goals and be concrete about trade-offs the record actually shows.',
    },
  },
  {
    strategy: 'emotional_reflection',
    pattern:
      /\b(?:how (?:am i|have i been) (?:doing|feeling)|i(?:'ve| have) been feeling|feeling (?:lately|these days)|my (?:mood|mental health|emotions)\b)/i,
    plan: {
      retrieve: ['emotional_context', 'active_threads', 'relationship_history', 'knowledge'],
      reasoning: 'synthesize',
      expectedAnswer: 'reflection',
      allowObservationSearch: true,
      directive:
        'This is an EMOTIONAL REFLECTION question. Synthesize emotional context, live conflicts, and relationship state with what is unfolding in the threads. Speak to trajectory, not just current state. Never diagnose; describe what the record shows.',
    },
  },
  {
    strategy: 'relationship',
    pattern:
      /\b(?:what happened (?:with|between me and)|how (?:are|is) things with|where do (?:i|we) stand with|tell me about (?:my relationship|things) with|what(?:'s| is) (?:going on|the story) with)\s+\p{L}/iu,
    plan: {
      retrieve: ['relationship_history', 'knowledge', 'events', 'active_threads'],
      reasoning: 'narrate',
      expectedAnswer: 'narrative',
      allowObservationSearch: true,
      directive:
        'This is a RELATIONSHIP question about a specific person. Answer from their relationship timeline: how it started, how it moved, where it stands. Keep every other person and unrelated life domain out of the answer.',
    },
  },
  {
    strategy: 'timeline',
    pattern:
      /\b(?:what happened (?:in|during|last|on|around)|when did i|walk me through|what did i do (?:in|during|last)|history of)\b/i,
    plan: {
      retrieve: ['chapters', 'events', 'observations'],
      reasoning: 'narrate',
      expectedAnswer: 'narrative',
      allowObservationSearch: true,
      directive:
        'This is a TIMELINE question. Answer from chapters and events in chronological order. Give the period its shape — what it was about — rather than an undifferentiated list of happenings.',
    },
  },
  {
    strategy: 'identity',
    pattern:
      /\b(?:who am i|what kind of person am i|describe me|what am i like|what defines me|my personality|tell me about myself)\b/i,
    plan: {
      retrieve: ['knowledge', 'active_threads', 'relationship_history'],
      reasoning: 'inspect',
      expectedAnswer: 'summary',
      allowObservationSearch: false,
      directive:
        'This is an IDENTITY question. Answer from durable knowledge — who this person is, as established by crystallized claims and stable relationships — colored by what is currently unfolding. Do not reconstruct identity from scattered observations.',
    },
  },
];

const GENERAL_PLAN: Omit<CognitivePlan, 'strategy'> = {
  retrieve: ['knowledge', 'active_threads', 'observations'],
  reasoning: 'retrieve',
  expectedAnswer: 'chat',
  allowObservationSearch: true,
  directive: '',
};

/**
 * WMA is the authoritative intent taxonomy — the planner maps its intents to
 * strategies instead of maintaining a parallel classification. Regex rules
 * below only cover cognitive shapes WMA does not classify (why, patterns,
 * planning, emotional reflection).
 */
type WmaIntent = import('../chat/workingMemoryAssembler').WorkingMemoryIntent;

const WMA_STRATEGY: Partial<Record<WmaIntent, CognitiveStrategy>> = {
  IDENTITY_QUERY: 'identity',
  RELATIONSHIP_QUERY: 'relationship',
  PERSON_QUERY: 'relationship',
  ARC_QUERY: 'current_focus',
  DIRECTION_QUERY: 'current_focus',
  MOMENTUM_QUERY: 'current_focus',
  PROJECT_QUERY: 'current_focus',
  GOAL_QUERY: 'planning',
  CONFLICT_QUERY: 'why',
  TEMPORAL_COMPARISON_QUERY: 'compare',
  TIMELINE_QUERY: 'timeline',
  TIME_RANGE_QUERY: 'timeline',
  TODAY_QUERY: 'timeline',
  YESTERDAY_QUERY: 'timeline',
  THIS_WEEK_QUERY: 'timeline',
  THIS_MONTH_QUERY: 'timeline',
  EVENT_QUERY: 'timeline',
  CHAPTER_QUERY: 'timeline',
};

function planForStrategy(strategy: CognitiveStrategy): CognitivePlan {
  const rule = STRATEGY_RULES.find((r) => r.strategy === strategy);
  if (!rule) return { strategy: 'general', ...GENERAL_PLAN };
  return { strategy, ...rule.plan };
}

/**
 * Decide how to think about this question before any retrieval happens.
 * Pass the WMA-classified intent when available; the planner treats it as
 * authoritative and only falls back to its own shape detection for the
 * strategies WMA has no intent for.
 */
export function planCognition(
  message: string,
  opts: { wmaIntent?: WmaIntent } = {},
): CognitivePlan {
  const compacted = message.replace(/\s+/g, ' ').trim();

  // Shapes WMA cannot express take precedence: "Why have I been depressed?"
  // is a why-question even when an intent classifier tags it differently.
  for (const rule of STRATEGY_RULES) {
    if (
      (rule.strategy === 'why' ||
        rule.strategy === 'reflect_patterns' ||
        rule.strategy === 'compare') &&
      rule.pattern.test(compacted)
    ) {
      return { strategy: rule.strategy, ...rule.plan };
    }
  }

  const mapped = opts.wmaIntent ? WMA_STRATEGY[opts.wmaIntent] : undefined;
  if (mapped) return planForStrategy(mapped);

  for (const rule of STRATEGY_RULES) {
    if (rule.pattern.test(compacted)) {
      return { strategy: rule.strategy, ...rule.plan };
    }
  }
  return { strategy: 'general', ...GENERAL_PLAN };
}

/** Render the strategy for the system prompt; null for ordinary chat. */
export function formatCognitivePlanBlock(plan: CognitivePlan): string | null {
  if (plan.strategy === 'general' || !plan.directive) return null;
  return [
    `Strategy: ${plan.strategy} | reasoning: ${plan.reasoning} | expected answer: ${plan.expectedAnswer}`,
    plan.directive,
  ].join('\n');
}
