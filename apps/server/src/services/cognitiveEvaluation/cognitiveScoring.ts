import type {
  CognitiveEvaluationExpectations,
  CognitiveEvaluationManifest,
  CognitiveEvaluationOutput,
  CognitiveEvaluationStatus,
  CognitiveMetricName,
  CognitiveMetricResult,
  CognitiveScenarioResult,
} from './cognitiveEvaluationTypes';
import { evaluateComposition } from '../responseComposition';

const DEFAULT_THRESHOLDS: Record<CognitiveMetricName, number> = {
  coverage: 85,
  correctness: 90,
  narrative_quality: 75,
  chronological_correctness: 95,
  context_precision: 90,
  leakage: 95,
  explainability: 80,
  compression_quality: 80,
  identity_preservation: 85,
  composition_adherence: 80,
};

function normalize(value: string): string {
  return value.toLocaleLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function includesConcept(haystack: string, concept: string): boolean {
  return normalize(haystack).includes(normalize(concept));
}

function ratioScore(hits: number, total: number): number | null {
  return total === 0 ? null : Math.round((hits / total) * 100);
}

function statusFor(score: number, threshold: number): CognitiveEvaluationStatus {
  if (score >= threshold) return 'PASS';
  if (score >= Math.max(0, threshold - 10)) return 'WARN';
  return 'FAIL';
}

function outputText(output: CognitiveEvaluationOutput): string {
  return [
    output.recall,
    ...output.assertions,
    ...output.contexts,
    ...output.identityThreads,
    output.currentChapter ?? '',
    ...output.narrativeTransitions,
  ].join(' ');
}

function metric(
  name: CognitiveMetricName,
  score: number | null,
  manifest: CognitiveEvaluationManifest,
  detail: string,
): CognitiveMetricResult {
  const threshold = manifest.thresholds?.[name] ?? DEFAULT_THRESHOLDS[name];
  if (score == null) return { metric: name, score: 0, threshold, status: 'SKIPPED', detail };
  const bounded = Math.max(0, Math.min(100, Math.round(score)));
  return { metric: name, score: bounded, threshold, status: statusFor(bounded, threshold), detail };
}

function scoreChronology(
  expected: CognitiveEvaluationExpectations,
  output: CognitiveEvaluationOutput,
): { score: number | null; detail: string } {
  const ids = expected.expectedTimelineIds ?? [];
  const expectedDates = expected.expectedDates ?? {};
  if (!ids.length && !Object.keys(expectedDates).length && !expected.requireChronologicalOrder) {
    return { score: null, detail: 'No chronology contract.' };
  }
  let checks = 0;
  let passed = 0;
  if (ids.length) {
    checks += ids.length;
    const actualIds = output.timeline.map((item) => item.id);
    passed += ids.filter((id) => actualIds.includes(id)).length;
    checks += 1;
    if (ids.filter((id) => actualIds.includes(id)).join('|') === actualIds.filter((id) => ids.includes(id)).join('|')) passed += 1;
  }
  for (const [id, date] of Object.entries(expectedDates)) {
    checks += 1;
    if (output.timeline.find((item) => item.id === id)?.occurredAt === date) passed += 1;
  }
  if (expected.requireChronologicalOrder) {
    checks += 1;
    const dates = output.timeline.map((item) => item.occurredAt).filter((date): date is string => Boolean(date));
    if (dates.every((date, index) => index === 0 || dates[index - 1] <= date)) passed += 1;
  }
  return { score: ratioScore(passed, checks), detail: `${passed}/${checks} chronology checks passed.` };
}

export function scoreCognitiveOutput(
  manifest: CognitiveEvaluationManifest,
  output: CognitiveEvaluationOutput,
): CognitiveMetricResult[] {
  const expected = manifest.expectations;
  const text = outputText(output);
  const conceptHits = expected.requiredConcepts.filter((concept) => includesConcept(text, concept)).length;
  const assertionContracts = expected.expectedAssertions ?? [];
  const assertionHits = assertionContracts.filter((contract) =>
    output.assertions.some((assertion) => contract.concepts.every((concept) => includesConcept(assertion, concept))),
  ).length;
  const requiredContexts = expected.requiredContexts ?? [];
  const contextHits = requiredContexts.filter((context) => output.contexts.some((actual) => includesConcept(actual, context))).length;
  const excludedContexts = expected.excludedContexts ?? [];
  const contextPollution = output.contexts.filter((actual) => excludedContexts.some((excluded) => includesConcept(actual, excluded))).length;
  const unexpectedContexts = output.contexts.filter((actual) =>
    !requiredContexts.some((required) => includesConcept(actual, required)),
  ).length;
  const contextRecall = requiredContexts.length ? contextHits / requiredContexts.length : 0;
  const contextPrecision = contextHits + unexpectedContexts
    ? contextHits / (contextHits + unexpectedContexts)
    : 0;
  const contextF1 = contextRecall + contextPrecision
    ? Math.round(2 * contextRecall * contextPrecision / (contextRecall + contextPrecision) * 100)
    : 0;
  const excludedConcepts = [...(expected.excludedConcepts ?? []), ...excludedContexts];
  const leakageHits = excludedConcepts.filter((concept) => includesConcept(text, concept)).length;
  const requiredTransitions = expected.requiredNarrativeTransitions ?? [];
  const transitionHits = requiredTransitions.filter((transition) =>
    output.narrativeTransitions.some((actual) => includesConcept(actual, transition)),
  ).length;
  const requiredThreads = expected.requiredIdentityThreads ?? [];
  const threadHits = requiredThreads.filter((thread) => output.identityThreads.some((actual) => includesConcept(actual, thread))).length;
  const excludedThreads = expected.excludedIdentityThreads ?? [];
  const badThreads = output.identityThreads.filter((actual) => excludedThreads.some((thread) => includesConcept(actual, thread))).length;
  const chapterCheck = expected.expectedCurrentChapter
    ? Number(includesConcept(output.currentChapter ?? '', expected.expectedCurrentChapter))
    : null;
  const chronology = scoreChronology(expected, output);
  const evidenceTarget = expected.minEvidenceLinks ?? 0;
  const linkedClaims = output.evidenceLinks.filter((link) => link.evidenceIds.length > 0).length;
  const wordCount = output.recall.trim() ? output.recall.trim().split(/\s+/).length : 0;
  const maxWords = expected.maxRecallWords;
  const recallConceptHits = expected.requiredConcepts.filter((concept) => includesConcept(output.recall, concept)).length;
  const recallCoverage = ratioScore(recallConceptHits, expected.requiredConcepts.length) ?? 100;
  const compressionScore = maxWords == null
    ? null
    : Math.round((Number(wordCount <= maxWords) * 0.5 + recallCoverage / 100 * 0.5) * 100);
  const composition = output.composition
    ? evaluateComposition({
        userMessage: manifest.prompt,
        response: output.composition.response,
        plan: output.composition.plan,
      })
    : null;

  return [
    metric('coverage', ratioScore(conceptHits, expected.requiredConcepts.length), manifest, `${conceptHits}/${expected.requiredConcepts.length} required concepts found.`),
    metric('correctness', ratioScore(assertionHits, assertionContracts.length), manifest, `${assertionHits}/${assertionContracts.length} assertion contracts satisfied.`),
    metric('narrative_quality', ratioScore(transitionHits, requiredTransitions.length), manifest, `${transitionHits}/${requiredTransitions.length} required transitions preserved; qualitative review remains separate.`),
    metric('chronological_correctness', chronology.score, manifest, chronology.detail),
    metric('context_precision', requiredContexts.length
      ? Math.max(0, contextF1 - contextPollution * 10)
      : null, manifest, `${contextHits}/${requiredContexts.length} required contexts; ${unexpectedContexts} unexpected and ${contextPollution} explicitly excluded contexts.`),
    metric('leakage', excludedConcepts.length ? Math.max(0, 100 - Math.round(leakageHits / excludedConcepts.length * 100)) : null, manifest, `${leakageHits}/${excludedConcepts.length} excluded concepts leaked.`),
    metric('explainability', evidenceTarget ? Math.min(100, Math.round(linkedClaims / evidenceTarget * 100)) : null, manifest, `${linkedClaims}/${evidenceTarget} evidence-linked claims.`),
    metric('compression_quality', compressionScore, manifest, `${wordCount}/${maxWords ?? 'unbounded'} words; ${recallCoverage}% required-concept recall.`),
    metric('identity_preservation', requiredThreads.length || chapterCheck != null
      ? Math.max(0, Math.round(((threadHits + (chapterCheck ?? 0)) / (requiredThreads.length + (chapterCheck == null ? 0 : 1))) * 100 - badThreads * 25))
      : null, manifest, `${threadHits}/${requiredThreads.length} identity threads; ${badThreads} excluded threads; chapter ${chapterCheck == null ? 'not scored' : chapterCheck ? 'matched' : 'missed'}.`),
    metric('composition_adherence', composition ? Math.round(composition.score * 100) : null, manifest,
      composition
        ? `${composition.score} composition score; ${composition.reasons.length} quality issue(s).`
        : 'No composition output.'),
  ];
}

export function evaluateCognitiveScenario(
  manifest: CognitiveEvaluationManifest,
  output: CognitiveEvaluationOutput,
  durationMs = 0,
): CognitiveScenarioResult {
  const metrics = scoreCognitiveOutput(manifest, output);
  const scored = metrics.filter((entry) => entry.status !== 'SKIPPED');
  const status: CognitiveEvaluationStatus = scored.some((entry) => entry.status === 'FAIL')
    ? 'FAIL'
    : scored.some((entry) => entry.status === 'WARN')
      ? 'WARN'
      : scored.length ? 'PASS' : 'SKIPPED';
  return {
    scenarioId: manifest.id,
    title: manifest.title,
    domain: manifest.domain,
    version: manifest.version,
    status,
    metrics,
    overallScore: scored.length ? Math.round(scored.reduce((sum, entry) => sum + entry.score, 0) / scored.length) : 0,
    humanReviewRequired: manifest.humanReviewQuestions.length > 0,
    humanReviewQuestions: manifest.humanReviewQuestions,
    durationMs,
  };
}
