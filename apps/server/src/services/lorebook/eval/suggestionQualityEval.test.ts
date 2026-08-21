import { describe, expect, it } from 'vitest';
import {
  runSuggestionQualityEval,
  summarizeReport,
} from './suggestionEvalRunner';
import { EXPECTED_CANON, EVAL_DOCUMENTS, allEvalCandidates } from './suggestionEvalCorpus';
import { CANDIDATE_OUTCOMES, CLEANUP_OUTCOMES } from './suggestionQualityMetrics';

describe('suggestion quality eval harness', () => {
  it('uses only synthetic fixtures and a complete outcome vocabulary', () => {
    const blob = JSON.stringify({ EXPECTED_CANON, EVAL_DOCUMENTS });
    expect(blob).not.toMatch(/abelxmendoza|firefistabel|789bd607|Ashley De La Cruz|Armstrong Robotics|Building LoreBook/i);
    expect(allEvalCandidates().length).toBeGreaterThan(20);
    expect(CANDIDATE_OUTCOMES).toContain('ATTACHED_EXISTING');
    expect(CLEANUP_OUTCOMES).toContain('DUPLICATE_CARD_CREATED');
  });

  it('measures current suggestion authority against the synthetic oracle', async () => {
    const report = await runSuggestionQualityEval();
    const targets = report.successTargets;

    expect(report.llmCalls).toBe(0);
    expect(report.baseline.kind).toBe('estimated');
    expect(report.corpus.candidates).toBe(allEvalCandidates().length);

    expect(targets.duplicateCanonicalCardsOnIdenticalRerun, summarizeReport(report)).toBe(0);
    expect(targets.dismissedEquivalentResurrection).toBe(0);
    expect(targets.repeatedMergeSuggestionsAfterConfirmedMerge).toBe(0);
    expect(targets.notSamePairReSuggested).toBe(0);
    expect(targets.machineCreateDuringFullDegraded).toBe(0);

    expect(report.performance.nPlusOneReintroduced).toBe(false);
    expect(report.performance.firstPass.canonIndexLoads).toBe(1);
    expect(report.performance.secondPass.canonIndexLoads).toBe(1);
    expect(report.performance.firstPass.perCandidateDbQueries).toBe(0);
    expect(report.performance.firstPass.llmCalls).toBe(0);

    expect(targets.secondPassSemanticWrites).toBe(0);
    expect(report.phases.first_pass.outcomes.CREATED_NEW).toBeGreaterThan(0);
    expect(report.phases.dismissal_learning.outcomes.SUPPRESSED_PREVIOUS_REJECT).toBeGreaterThan(0);
    expect(report.phases.merge_learning.outcomes.MERGE_MEMORY_ATTACH).toBeGreaterThan(0);
    expect(report.bookScorecard.some((row) => row.candidates > 0)).toBe(true);

    const skillAfterGroupDismiss = report.phases.dismissal_learning.traces.find(
      (row) => row.candidateId === 'failure-analysis-skill',
    );
    expect(skillAfterGroupDismiss?.outcome).not.toBe('SUPPRESSED_PREVIOUS_REJECT');
  }, 30_000);
});
