/**
 * Question-scoped retrieval plan.
 *
 * Intent + resolved entities + temporal/complexity signals decide what RAG
 * is allowed to load. Ranking must not be the only filter: a work-date
 * question should never fetch romance, quests, or the full character roster.
 */

import { classifyMessageComplexity } from '../ingestion/messageComplexityGate';
import type { WorkingMemoryAssembly } from './workingMemoryAssembler';
import type { ResponseScopePlan, ScopeIntent } from '../responseScope/responseScopeTypes';

export type RetrievalBreadth = 'minimal' | 'focused' | 'full';

export type QuestionScopedRetrievalPlan = {
  breadth: RetrievalBreadth;
  intent: ScopeIntent;
  primaryEntityNames: string[];
  loadCharacters: boolean;
  loadLocations: boolean;
  loadChapters: boolean;
  loadTimelineHierarchy: boolean;
  loadRomance: boolean;
  loadAttributes: boolean;
  loadCharacterMemories: boolean;
  loadCorrections: boolean;
  loadDeprecatedUnits: boolean;
  loadInterests: boolean;
  loadOrchestrator: boolean;
  loadSocialCommunities: boolean;
  loadEpisodicEvents: boolean;
  loadInterpretations: boolean;
  loadStableArcs: boolean;
  loadCrystallizedKnowledge: boolean;
  loadNarrativeThreads: boolean;
  loadContinuityAlive: boolean;
  loadSkillsIndex: boolean;
  loadStoryContext: boolean;
  earlyStopOnWmaEvidence: boolean;
  allowFocusedRetry: boolean;
  allowBroadFallback: boolean;
  reasons: string[];
};

const REFLECTIVE_INTENTS = new Set<ScopeIntent>(['biography']);
const FOCUSED_INTENTS = new Set<ScopeIntent>([
  'work',
  'place',
  'event',
  'relationship',
  'family',
  'project',
  'timeline',
]);

export function planQuestionScopedRetrieval(
  message: string,
  scopePlan: ResponseScopePlan,
): QuestionScopedRetrievalPlan {
  const complexity = classifyMessageComplexity(message);
  const names = scopePlan.primaryEntities.map((entity) => entity.name).filter(Boolean);
  const reasons: string[] = [`intent:${scopePlan.intent}`, `complexity:${complexity.class}`];

  const reflective =
    complexity.class === 'REFLECTIVE' ||
    complexity.class === 'AMBIGUOUS' ||
    complexity.failUpward ||
    REFLECTIVE_INTENTS.has(scopePlan.intent) ||
    scopePlan.responseMode === 'audit' ||
    scopePlan.responseMode === 'debug_inspector';

  if (reflective) {
    reasons.push('full_context_required');
    return {
      ...fullPlan(scopePlan.intent, names, reasons),
      earlyStopOnWmaEvidence: false,
      allowFocusedRetry: false,
      allowBroadFallback: true,
    };
  }

  const simpleFactual =
    complexity.class === 'NO_LORE' ||
    complexity.class === 'SIMPLE_FACT' ||
    complexity.class === 'ENTITY_MENTION' ||
    complexity.class === 'SIMPLE_EVENT';

  if (simpleFactual && (FOCUSED_INTENTS.has(scopePlan.intent) || names.length > 0)) {
    reasons.push('question_scoped_minimal');
    return {
      breadth: 'minimal',
      intent: scopePlan.intent,
      primaryEntityNames: names,
      loadCharacters: false,
      loadLocations: false,
      loadChapters: false,
      loadTimelineHierarchy: false,
      loadRomance: scopePlan.intent === 'relationship',
      loadAttributes: false,
      loadCharacterMemories: false,
      loadCorrections: complexity.class === 'CORRECTION',
      loadDeprecatedUnits: false,
      loadInterests: false,
      loadOrchestrator: false,
      loadSocialCommunities: false,
      loadEpisodicEvents: false,
      loadInterpretations: false,
      loadStableArcs: false,
      loadCrystallizedKnowledge: true,
      loadNarrativeThreads: false,
      loadContinuityAlive: false,
      loadSkillsIndex: scopePlan.intent === 'project',
      loadStoryContext: false,
      earlyStopOnWmaEvidence: true,
      allowFocusedRetry: true,
      allowBroadFallback: scopePlan.intent === 'general',
      reasons,
    };
  }

  if (FOCUSED_INTENTS.has(scopePlan.intent)) {
    reasons.push('question_scoped_focused');
    return {
      breadth: 'focused',
      intent: scopePlan.intent,
      primaryEntityNames: names,
      loadCharacters: scopePlan.intent === 'relationship' || scopePlan.intent === 'family' || names.length > 0,
      loadLocations: scopePlan.intent === 'place' || scopePlan.intent === 'event',
      loadChapters: false,
      loadTimelineHierarchy: scopePlan.intent === 'timeline',
      loadRomance: scopePlan.intent === 'relationship',
      loadAttributes: names.length > 0,
      loadCharacterMemories: names.length > 0,
      loadCorrections: true,
      loadDeprecatedUnits: false,
      loadInterests: false,
      loadOrchestrator: false,
      loadSocialCommunities: false,
      loadEpisodicEvents: false,
      loadInterpretations: false,
      loadStableArcs: scopePlan.intent === 'timeline',
      loadCrystallizedKnowledge: true,
      loadNarrativeThreads: false,
      loadContinuityAlive: false,
      loadSkillsIndex: scopePlan.intent === 'project',
      loadStoryContext: false,
      earlyStopOnWmaEvidence: simpleFactual,
      allowFocusedRetry: true,
      allowBroadFallback: false,
      reasons,
    };
  }

  reasons.push('default_full');
  return fullPlan(scopePlan.intent, names, reasons);
}

function fullPlan(
  intent: ScopeIntent,
  names: string[],
  reasons: string[],
): QuestionScopedRetrievalPlan {
  return {
    breadth: 'full',
    intent,
    primaryEntityNames: names,
    loadCharacters: true,
    loadLocations: true,
    loadChapters: true,
    loadTimelineHierarchy: true,
    loadRomance: true,
    loadAttributes: true,
    loadCharacterMemories: true,
    loadCorrections: true,
    loadDeprecatedUnits: true,
    loadInterests: true,
    loadOrchestrator: true,
    loadSocialCommunities: true,
    loadEpisodicEvents: true,
    loadInterpretations: true,
    loadStableArcs: true,
    loadCrystallizedKnowledge: true,
    loadNarrativeThreads: true,
    loadContinuityAlive: true,
    loadSkillsIndex: true,
    loadStoryContext: true,
    earlyStopOnWmaEvidence: false,
    allowFocusedRetry: false,
    allowBroadFallback: true,
    reasons,
  };
}

export function isWorkingMemoryEvidenceSufficient(
  assembly: WorkingMemoryAssembly | null,
  plan: QuestionScopedRetrievalPlan,
): boolean {
  if (!plan.earlyStopOnWmaEvidence || !assembly) return false;
  if (assembly.budget.selected <= 0) return false;
  if (assembly.confidence < 0.55) return false;
  const grounded = [
    ...assembly.events,
    ...assembly.timeline,
    ...assembly.episodes,
    ...assembly.claims,
    ...assembly.communities,
  ];
  if (grounded.length === 0) return false;
  if (plan.primaryEntityNames.length === 0) return true;
  const needles = plan.primaryEntityNames.map((name) => name.toLowerCase());
  return grounded.some((item) => {
    const haystack = `${item.title} ${item.content}`.toLowerCase();
    return needles.some((needle) => haystack.includes(needle));
  });
}
