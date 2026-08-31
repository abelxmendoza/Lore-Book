import type { CompositionPlan, CompositionQualityResult } from '../responseComposition';

export type CognitiveEvaluationStatus = 'PASS' | 'WARN' | 'FAIL' | 'SKIPPED';

export type CognitiveMetricName =
  | 'coverage'
  | 'correctness'
  | 'narrative_quality'
  | 'chronological_correctness'
  | 'context_precision'
  | 'leakage'
  | 'explainability'
  | 'compression_quality'
  | 'identity_preservation'
  | 'composition_adherence';

export type CognitiveEvaluationDomain =
  | 'career_timeline'
  | 'identity_summary'
  | 'relationship_recall'
  | 'project_recall'
  | 'current_chapter'
  | 'recent_changes'
  | 'character_summary'
  | 'memory_compression'
  | 'contradiction_handling'
  | 'temporal_reconstruction'
  | 'response_composition';

export type CognitiveTimelineItem = {
  id: string;
  occurredAt: string | null;
  precision: 'exact' | 'day' | 'month' | 'year' | 'range' | 'unknown';
};

export type CognitiveEvaluationOutput = {
  assertions: string[];
  contexts: string[];
  timeline: CognitiveTimelineItem[];
  identityThreads: string[];
  currentChapter?: string | null;
  recall: string;
  narrativeTransitions: string[];
  evidenceLinks: Array<{ claim: string; evidenceIds: string[] }>;
  composition?: {
    plan: CompositionPlan;
    response: string;
    quality?: CompositionQualityResult;
  };
};

export type CognitiveEvaluationExpectations = {
  requiredConcepts: string[];
  expectedAssertions?: Array<{ label: string; concepts: string[] }>;
  requiredContexts?: string[];
  excludedContexts?: string[];
  excludedConcepts?: string[];
  expectedTimelineIds?: string[];
  expectedDates?: Record<string, string | null>;
  requireChronologicalOrder?: boolean;
  requiredIdentityThreads?: string[];
  excludedIdentityThreads?: string[];
  expectedCurrentChapter?: string;
  requiredNarrativeTransitions?: string[];
  minEvidenceLinks?: number;
  maxRecallWords?: number;
};

export type CognitiveEvaluationManifest = {
  id: string;
  version: 'cognitive-eval-v1';
  title: string;
  domain: CognitiveEvaluationDomain;
  synthetic: true;
  prompt: string;
  conversation: Array<{ role: 'user' | 'assistant'; content: string }>;
  expectations: CognitiveEvaluationExpectations;
  thresholds?: Partial<Record<CognitiveMetricName, number>>;
  humanReviewQuestions: string[];
  baselineOutput: CognitiveEvaluationOutput;
};

export type CognitiveMetricResult = {
  metric: CognitiveMetricName;
  score: number;
  threshold: number;
  status: CognitiveEvaluationStatus;
  detail: string;
};

export type CognitiveScenarioResult = {
  scenarioId: string;
  title: string;
  domain: CognitiveEvaluationDomain;
  version: CognitiveEvaluationManifest['version'];
  status: CognitiveEvaluationStatus;
  metrics: CognitiveMetricResult[];
  overallScore: number;
  humanReviewRequired: boolean;
  humanReviewQuestions: string[];
  durationMs: number;
};

export type CognitiveEvaluationRun = {
  runId: string;
  frameworkVersion: 'cognitive-evaluation-v1';
  startedAt: string;
  completedAt: string;
  status: CognitiveEvaluationStatus;
  summary: Record<CognitiveEvaluationStatus, number>;
  averageScore: number;
  scenarios: CognitiveScenarioResult[];
  invariants: {
    syntheticOnly: true;
    externalWrites: false;
    privateUserDataRead: false;
  };
};

export type CognitiveEvaluationAdapter = (
  manifest: CognitiveEvaluationManifest,
) => Promise<CognitiveEvaluationOutput> | CognitiveEvaluationOutput;

export type CognitiveEvaluationDiff = {
  scenarioId: string;
  metricDeltas: Array<{
    metric: CognitiveMetricName;
    baseline: number;
    candidate: number;
    delta: number;
    regressed: boolean;
  }>;
  assertions: { added: string[]; removed: string[] };
  contexts: { added: string[]; removed: string[] };
  timeline: { added: string[]; removed: string[]; reordered: boolean };
  identityThreads: { added: string[]; removed: string[] };
  recallChanged: boolean;
  regressionCount: number;
};
