import type { CognitivePlan } from '../cognitivePlanner/cognitivePlanner';
import type { ResponseScopePlan } from '../responseScope/responseScopeTypes';
import {
  evaluateComposition,
  resolveCompositionPlan,
  type CompositionPlan,
  type CompositionProfile,
} from '../responseComposition';

export type CompositionBenchmarkScenario = {
  id: string;
  title: string;
  prompt: string;
  profile: CompositionProfile;
  baselineResponse: string;
  canonicalResponse: string;
  plan: CompositionPlan;
};

export type CompositionBenchmarkScenarioResult = {
  id: string;
  profile: CompositionProfile;
  baselineScore: number;
  canonicalScore: number;
  improved: boolean;
  canonicalPassed: boolean;
};

export type CompositionBenchmarkReport = {
  version: 'composition-benchmark-v1';
  status: 'PASS' | 'WARN' | 'FAIL';
  scenarios: CompositionBenchmarkScenarioResult[];
  averageBaselineScore: number;
  averageCanonicalScore: number;
  invariants: {
    syntheticOnly: true;
    externalWrites: false;
  };
};

function cognitive(strategy: CognitivePlan['strategy']): CognitivePlan {
  return {
    strategy,
    retrieve: ['knowledge'],
    reasoning: strategy === 'planning' ? 'retrieve' : 'synthesize',
    expectedAnswer: strategy === 'planning' ? 'plan' : strategy === 'reflect_patterns' ? 'reflection' : 'summary',
    allowObservationSearch: true,
    directive: 'synthetic benchmark',
  };
}

function scope(overrides: Partial<ResponseScopePlan> = {}): ResponseScopePlan {
  return {
    intent: 'general',
    contextPlan: {} as ResponseScopePlan['contextPlan'],
    responseMode: 'chat',
    scopeSource: 'message',
    allowedDomains: [],
    blockedDomains: [],
    primaryEntities: [],
    isCorrection: false,
    correctionNames: [],
    maxEvidenceItems: 12,
    maxCharactersReturned: 4_000,
    includeProvenanceSummary: false,
    includeUncertainty: true,
    closedScope: false,
    ...overrides,
  };
}

function scenario(
  id: string,
  title: string,
  prompt: string,
  profileSignals: Parameters<typeof resolveCompositionPlan>[0],
  baselineResponse: string,
  canonicalResponse: string,
): CompositionBenchmarkScenario {
  return {
    id,
    title,
    prompt,
    profile: resolveCompositionPlan(profileSignals).profile,
    baselineResponse,
    canonicalResponse,
    plan: resolveCompositionPlan(profileSignals),
  };
}

export const COMPOSITION_BENCHMARK_SCENARIOS: CompositionBenchmarkScenario[] = [
  scenario(
    'career-recall',
    'Career recall',
    'What jobs have I had?',
    { cognitivePlan: cognitive('general'), scopePlan: scope({ responseMode: 'focused_recall' }) },
    'Source ID: job-1. Source ID: job-2. What should I explain first? What else do you want?',
    'Your work moved from field robotics into hardware validation. The record includes several roles across that progression.',
  ),
  scenario(
    'character-explanation',
    'Character explanation',
    'Tell me about Jamie.',
    { cognitivePlan: cognitive('identity') },
    'Jamie, relationship_type=friend, character_id=abc. Database record attached.',
    'Jamie is someone you know through the experiences recorded in your story. The available memories place them in that relationship context.',
  ),
  scenario(
    'timeline-narration',
    'Timeline narration',
    'Walk me through my career.',
    { cognitivePlan: cognitive('timeline'), scopePlan: scope({ intent: 'timeline' }) },
    '2024. 2022. 2023. Source ID: event-1.',
    'Your career developed from early technical work in 2022 into broader responsibilities by 2023 and 2024.',
  ),
  scenario(
    'reflection',
    'Reflection',
    'What has changed about me?',
    { cognitivePlan: cognitive('reflect_patterns') },
    'You changed. You changed. What do you think?',
    'The records suggest a shift toward more deliberate technical ownership, while the underlying drive to build and improve remained consistent.',
  ),
  scenario(
    'planning',
    'Planning',
    'What should I do next?',
    { cognitivePlan: cognitive('planning') },
    'You should do everything. What else? What next?',
    'Start with the next concrete step that supports your stated goal, then review what you learn before committing to a larger move.',
  ),
  scenario(
    'debug',
    'Debug response',
    'Why did LoreBook answer this way?',
    { scopePlan: scope({ responseMode: 'debug_inspector' }) },
    'The retrieval diagnostic used source ID abc.',
    'The diagnostic trace shows which evidence was selected and which was excluded before generation.',
  ),
  scenario(
    'follow-up-continuity',
    'Follow-up continuity',
    'Can you summarize that again?',
    { scopePlan: scope({ responseMode: 'focused_recall' }) },
    'Here is the summary. What should I cover? Should I include more?',
    'Here is the concise summary again, keeping the focus on the topic we were discussing.',
  ),
  scenario(
    'general-grounded-answer',
    'General grounded answer',
    'Tell me something about my story.',
    {},
    'The database has 12 records. What else? What else?',
    'One clear thread in your story is the way you keep turning experience into something you can build on.',
  ),
];

export function runCompositionBenchmark(
  scenarios: readonly CompositionBenchmarkScenario[] = COMPOSITION_BENCHMARK_SCENARIOS,
): CompositionBenchmarkReport {
  const results = scenarios.map((scenario) => {
    const baseline = evaluateComposition({
      userMessage: scenario.prompt,
      response: scenario.baselineResponse,
      plan: scenario.plan,
    });
    const canonical = evaluateComposition({
      userMessage: scenario.prompt,
      response: scenario.canonicalResponse,
      plan: scenario.plan,
    });
    return {
      id: scenario.id,
      profile: scenario.profile,
      baselineScore: baseline.score,
      canonicalScore: canonical.score,
      improved: canonical.score > baseline.score,
      canonicalPassed: canonical.passed,
    };
  });
  const average = (key: 'baselineScore' | 'canonicalScore') =>
    Number((results.reduce((sum, result) => sum + result[key], 0) / Math.max(1, results.length)).toFixed(3));
  const averageBaselineScore = average('baselineScore');
  const averageCanonicalScore = average('canonicalScore');

  return {
    version: 'composition-benchmark-v1',
    status: results.every((result) => result.canonicalPassed) && averageCanonicalScore >= averageBaselineScore
      ? 'PASS'
      : 'WARN',
    scenarios: results,
    averageBaselineScore,
    averageCanonicalScore,
    invariants: { syntheticOnly: true, externalWrites: false },
  };
}
