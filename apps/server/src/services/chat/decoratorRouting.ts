/**
 * Explicit hot-path decorator routing.
 * Skip interpretive LLM completions unless the user request needs them.
 */

import { isPureReadOnlyKnowledgeQuery } from './readOnlyQueryPolicy';
import {
  classifyMessageComplexity,
  type MessageComplexityClass,
  type MessageComplexityDecision,
} from '../ingestion/messageComplexityGate';

export type DecoratorName =
  | 'transition_analysis'
  | 'emotional_state'
  | 'memory_suggestion'
  | 'continuity'
  | 'connections'
  | 'strategic_guidance'
  | 'belief_challenge'
  | 'persona_rl';

export type DecoratorDecision = {
  run: boolean;
  reason: string;
};

const ROUTING: Record<MessageComplexityClass, Partial<Record<DecoratorName, boolean>>> = {
  NO_LORE: {
    transition_analysis: false,
    emotional_state: false,
    memory_suggestion: false,
    continuity: true,
    connections: true,
    strategic_guidance: false,
    belief_challenge: false,
    persona_rl: true,
  },
  SIMPLE_FACT: {
    transition_analysis: false,
    emotional_state: false,
    memory_suggestion: false,
    continuity: true,
    connections: true,
    strategic_guidance: false,
    belief_challenge: false,
    persona_rl: true,
  },
  SIMPLE_EVENT: {
    transition_analysis: false,
    emotional_state: false,
    memory_suggestion: false,
    continuity: true,
    connections: true,
    strategic_guidance: false,
    belief_challenge: false,
    persona_rl: true,
  },
  ENTITY_MENTION: {
    transition_analysis: false,
    emotional_state: false,
    memory_suggestion: false,
    continuity: true,
    connections: true,
    strategic_guidance: false,
    belief_challenge: false,
    persona_rl: true,
  },
  CORRECTION: {
    transition_analysis: false,
    emotional_state: false,
    memory_suggestion: true,
    continuity: true,
    connections: true,
    strategic_guidance: false,
    belief_challenge: false,
    persona_rl: true,
  },
  MULTI_EVENT: {
    transition_analysis: false,
    emotional_state: false,
    memory_suggestion: true,
    continuity: true,
    connections: true,
    strategic_guidance: false,
    belief_challenge: false,
    persona_rl: true,
  },
  TEMPORALLY_COMPLEX: {
    transition_analysis: false,
    emotional_state: false,
    memory_suggestion: true,
    continuity: true,
    connections: true,
    strategic_guidance: false,
    belief_challenge: false,
    persona_rl: true,
  },
  RELATIONSHIP_COMPLEX: {
    transition_analysis: true,
    emotional_state: false,
    memory_suggestion: true,
    continuity: true,
    connections: true,
    strategic_guidance: false,
    belief_challenge: false,
    persona_rl: true,
  },
  REFLECTIVE: {
    transition_analysis: true,
    emotional_state: true,
    memory_suggestion: true,
    continuity: true,
    connections: true,
    strategic_guidance: true,
    belief_challenge: true,
    persona_rl: true,
  },
  AMBIGUOUS: {
    transition_analysis: true,
    emotional_state: true,
    memory_suggestion: true,
    continuity: true,
    connections: true,
    strategic_guidance: true,
    belief_challenge: true,
    persona_rl: true,
  },
};

export function resolveDecoratorPlan(
  message: string,
  decision?: MessageComplexityDecision,
): { complexity: MessageComplexityDecision; shouldRun: (name: DecoratorName) => DecoratorDecision } {
  const complexity = decision ?? classifyMessageComplexity(message);
  const classPlan = ROUTING[complexity.class];

  return {
    complexity,
    shouldRun(name) {
      if (name === 'memory_suggestion' && isPureReadOnlyKnowledgeQuery(message)) {
        return { run: false, reason: 'read_only_knowledge_query' };
      }
      // Stream prompt currently does not consume these; keep them off unless
      // reflective/ambiguous so we do not pay for unused completions.
      if ((name === 'emotional_state' || name === 'transition_analysis') && complexity.class !== 'REFLECTIVE' && complexity.class !== 'AMBIGUOUS') {
        return { run: false, reason: 'not_wired_to_stream_prompt' };
      }
      const allowed = classPlan[name];
      if (allowed === false) {
        return { run: false, reason: `class:${complexity.class}` };
      }
      return { run: true, reason: `class:${complexity.class}` };
    },
  };
}
