import { describe, expect, it } from 'vitest';

import {
  COMPOSITION_BENCHMARK_SCENARIOS,
  runCompositionBenchmark,
} from './compositionBenchmark';

describe('Blueprint 22 composition benchmark', () => {
  it('covers the permanent synthetic composition scenarios', () => {
    const report = runCompositionBenchmark();

    expect(report.invariants).toEqual({
      syntheticOnly: true,
      externalWrites: false,
    });
    expect(report.scenarios).toHaveLength(COMPOSITION_BENCHMARK_SCENARIOS.length);
    expect(report.status).toBe('PASS');
    expect(report.averageCanonicalScore).toBeGreaterThan(report.averageBaselineScore);
    expect(new Set(report.scenarios.map((scenario) => scenario.profile))).toEqual(
      new Set(['recall', 'character', 'timeline', 'reflection', 'planning', 'debug', 'general']),
    );
  });
});
