import { describe, expect, it } from 'vitest';

import {
  baselineCognitiveAdapter,
  compareCognitiveOutputs,
  evaluateCognitiveScenario,
  goldenCognitiveScenarios,
  runCognitiveEvaluationSuite,
} from '../../src/services/cognitiveEvaluation';

const NOW = '2026-08-09T15:00:00.000Z';

function scenario(id: string) {
  const found = goldenCognitiveScenarios.find((manifest) => manifest.id === id);
  if (!found) throw new Error(`Missing scenario ${id}`);
  return found;
}

describe('Cognitive Evaluation & Regression Framework', () => {
  it('keeps the canonical synthetic benchmark green', async () => {
    const run = await runCognitiveEvaluationSuite({
      manifests: goldenCognitiveScenarios,
      adapter: baselineCognitiveAdapter,
      now: NOW,
    });

    expect(run.status).toBe('PASS');
    expect(run.summary).toEqual({ PASS: 10, WARN: 0, FAIL: 0, SKIPPED: 0 });
    expect(run.invariants).toEqual({
      syntheticOnly: true,
      externalWrites: false,
      privateUserDataRead: false,
    });
    expect(new Set(goldenCognitiveScenarios.map((manifest) => manifest.domain)).size).toBe(10);
  });

  it('fails a career result polluted by relationship and shopping context', () => {
    const manifest = scenario('COG-CAREER-001');
    const candidate = {
      ...manifest.baselineOutput,
      contexts: [...manifest.baselineOutput.contexts, 'relationships', 'shopping'],
      recall: `${manifest.baselineOutput.recall} Jamie and the user went shopping.`,
    };
    const result = evaluateCognitiveScenario(manifest, candidate);

    expect(result.status).toBe('FAIL');
    expect(result.metrics.find((metric) => metric.metric === 'context_precision')?.status).toBe('FAIL');
    expect(result.metrics.find((metric) => metric.metric === 'leakage')?.score).toBeLessThan(95);
  });

  it('fails reordered chronology and fabricated unknown dates', () => {
    const manifest = scenario('COG-TEMPORAL-001');
    const candidate = {
      ...manifest.baselineOutput,
      timeline: [
        { id: 'follow-up', occurredAt: '2026-01-03', precision: 'exact' as const },
        { id: 'demo', occurredAt: '2022-05-01', precision: 'month' as const },
      ],
    };
    const result = evaluateCognitiveScenario(manifest, candidate);
    const chronology = result.metrics.find((metric) => metric.metric === 'chronological_correctness');

    expect(result.status).toBe('FAIL');
    expect(chronology?.score).toBeLessThan(chronology?.threshold ?? 100);
  });

  it('detects identity collapse during compression', () => {
    const manifest = scenario('COG-IDENTITY-001');
    const candidate = {
      ...manifest.baselineOutput,
      identityThreads: ['professional'],
      currentChapter: 'career transition',
      recall: 'You are a professional in transition.',
    };
    const result = evaluateCognitiveScenario(manifest, candidate);

    expect(result.status).toBe('FAIL');
    expect(result.metrics.find((metric) => metric.metric === 'identity_preservation')?.status).toBe('FAIL');
    expect(result.metrics.find((metric) => metric.metric === 'compression_quality')?.status).toBe('FAIL');
  });

  it('reports differential regressions and structural changes', () => {
    const manifest = scenario('COG-PROJECT-001');
    const candidate = {
      ...manifest.baselineOutput,
      assertions: [],
      contexts: ['relationships'],
      timeline: [...manifest.baselineOutput.timeline].reverse(),
      identityThreads: [],
      recall: 'MemoVault is a project.',
      evidenceLinks: [],
    };
    const diff = compareCognitiveOutputs(manifest, manifest.baselineOutput, candidate);

    expect(diff.regressionCount).toBeGreaterThan(0);
    expect(diff.assertions.removed).toEqual(manifest.baselineOutput.assertions);
    expect(diff.contexts.added).toContain('relationships');
    expect(diff.timeline.reordered).toBe(true);
    expect(diff.identityThreads.removed).toContain('builder');
    expect(diff.recallChanged).toBe(true);
  });

  it('refuses a non-synthetic manifest before invoking an adapter', async () => {
    const manifest = { ...scenario('COG-CAREER-001'), synthetic: false } as unknown as typeof goldenCognitiveScenarios[number];
    let invoked = false;

    await expect(runCognitiveEvaluationSuite({
      manifests: [manifest],
      adapter: () => {
        invoked = true;
        return manifest.baselineOutput;
      },
      now: NOW,
    })).rejects.toThrow('not synthetic');
    expect(invoked).toBe(false);
  });
});
